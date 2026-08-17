import { and, eq, sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import { auditEvents, inventoryBalances, tyreEvents, tyres } from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { requireStoreAccess } from "~/lib/auth/authorization.server";
import {
  postStockInTransaction,
  prepareStockCommand,
  type Transaction,
} from "~/features/inventory/posting.server";
import { requirePartCategory } from "./category.server";
import { WorkshopError } from "./errors";
import { loadOpenJobCard } from "./job-cards.server";
import {
  fitTyreSchema,
  receiveTyreFromDagSchema,
  registerTyreSchema,
  sendTyreToDagSchema,
} from "./schemas";
import { canSendToDag, nextDagStage, receiveIsScrap } from "./tyre-lifecycle";

async function inStoreCount(tx: Transaction, storeId: string, partId: string) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(tyres)
    .where(
      and(
        eq(tyres.storeId, storeId),
        eq(tyres.partId, partId),
        eq(tyres.status, "IN_STORE"),
      ),
    );
  return Number(row?.count ?? 0);
}

async function onHand(tx: Transaction, storeId: string, partId: string) {
  const [row] = await tx
    .select({ onHand: inventoryBalances.onHand })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.storeId, storeId),
        eq(inventoryBalances.partId, partId),
      ),
    )
    .limit(1);
  return Number(row?.onHand ?? 0);
}

export async function registerTyre(actor: Actor, input: unknown) {
  const command = registerTyreSchema.parse(input);
  await requireStoreAccess(actor, command.storeId);
  if (command.lifecycleStage === "SCRAP") {
    throw new WorkshopError("Cannot register a scrapped tyre into store");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    await requirePartCategory(tx, command.partId, "TYRE");
    const stored = await inStoreCount(tx, command.storeId, command.partId);
    const stock = await onHand(tx, command.storeId, command.partId);
    if (stored + 1 > stock) {
      throw new WorkshopError(
        "Not enough on-hand tyre stock to register another serial at this store",
      );
    }

    const [tyre] = await tx
      .insert(tyres)
      .values({
        serialNumber: command.serialNumber,
        partId: command.partId,
        lifecycleStage: command.lifecycleStage,
        status: "IN_STORE",
        storeId: command.storeId,
        notes: command.notes || null,
      })
      .returning();

    await tx.insert(tyreEvents).values({
      tyreId: tyre.id,
      type: "REGISTER",
      storeId: command.storeId,
      toStage: command.lifecycleStage,
      notes: command.notes || null,
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TYRE_REGISTERED",
      entityType: "tyre",
      entityId: tyre.id,
      storeId: command.storeId,
      metadata: { serialNumber: tyre.serialNumber },
    });
    return tyre;
  });
}

export async function fitOrReplaceTyre(actor: Actor, input: unknown) {
  const command = fitTyreSchema.parse(input);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const card = await loadOpenJobCard(tx, command.jobCardId);
    await requireStoreAccess(actor, card.storeId);

    const [incoming] = await tx
      .select()
      .from(tyres)
      .where(eq(tyres.id, command.tyreId))
      .limit(1);
    if (!incoming) throw new WorkshopError("Tyre not found");
    if (incoming.status !== "IN_STORE" || incoming.storeId !== card.storeId) {
      throw new WorkshopError("Tyre must be in stock at this job card's store");
    }

    const [occupant] = await tx
      .select()
      .from(tyres)
      .where(
        and(
          eq(tyres.currentBusId, card.busId),
          eq(tyres.currentPosition, command.position),
          eq(tyres.status, "FITTED"),
        ),
      )
      .limit(1);

    let removedDocumentId: string | undefined;
    if (occupant) {
      const returned = await postStockInTransaction(
        tx,
        actor,
        "BUS_RETURN",
        prepareStockCommand("BUS_RETURN", {
          storeId: card.storeId,
          busId: card.busId,
          jobCardId: card.id,
          businessDate: card.businessDate,
          notes: `Tyre ${occupant.serialNumber} removed from ${command.position}`,
          idempotencyKey: `${command.idempotencyKey}-remove`,
          lines: [{ partId: occupant.partId, quantity: "1" }],
        }),
      );
      removedDocumentId = returned.id;
      await tx
        .update(tyres)
        .set({
          status: "IN_STORE",
          storeId: card.storeId,
          currentBusId: null,
          currentPosition: null,
        })
        .where(eq(tyres.id, occupant.id));
      await tx.insert(tyreEvents).values({
        tyreId: occupant.id,
        type: "REMOVE",
        jobCardId: card.id,
        stockDocumentId: returned.id,
        storeId: card.storeId,
        busId: card.busId,
        fromPosition: command.position,
        fromStage: occupant.lifecycleStage,
        odometerKm: card.odometerKm,
        createdBy: actor.id,
      });
    }

    const issued = await postStockInTransaction(
      tx,
      actor,
      "BUS_ISSUE",
      prepareStockCommand("BUS_ISSUE", {
        storeId: card.storeId,
        busId: card.busId,
        jobCardId: card.id,
        businessDate: card.businessDate,
        notes: `Tyre ${incoming.serialNumber} fitted to ${command.position}`,
        idempotencyKey: `${command.idempotencyKey}-fit`,
        lines: [{ partId: incoming.partId, quantity: "1" }],
      }),
    );

    await tx
      .update(tyres)
      .set({
        status: "FITTED",
        storeId: null,
        currentBusId: card.busId,
        currentPosition: command.position,
      })
      .where(eq(tyres.id, incoming.id));

    await tx.insert(tyreEvents).values({
      tyreId: incoming.id,
      type: occupant ? "REPLACE" : "FIT",
      jobCardId: card.id,
      stockDocumentId: issued.id,
      storeId: card.storeId,
      busId: card.busId,
      toPosition: command.position,
      toStage: incoming.lifecycleStage,
      odometerKm: card.odometerKm,
      notes: occupant ? `Replaced ${occupant.serialNumber}` : null,
      createdBy: actor.id,
    });

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: occupant ? "TYRE_REPLACED" : "TYRE_FITTED",
      entityType: "tyre",
      entityId: incoming.id,
      storeId: card.storeId,
      metadata: {
        serialNumber: incoming.serialNumber,
        position: command.position,
        jobNumber: card.jobNumber,
        removedDocumentId,
      },
    });

    return { id: incoming.id, documentId: issued.id };
  });
}

export async function sendTyreToDag(actor: Actor, input: unknown) {
  const command = sendTyreToDagSchema.parse(input);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const [tyre] = await tx
      .select()
      .from(tyres)
      .where(eq(tyres.id, command.tyreId))
      .limit(1);
    if (!tyre) throw new WorkshopError("Tyre not found");
    if (tyre.status !== "IN_STORE" || !tyre.storeId) {
      throw new WorkshopError("Tyre must be in store stock to send to DAG");
    }
    if (!canSendToDag(tyre.lifecycleStage)) {
      throw new WorkshopError("Scrapped tyres cannot be sent to DAG");
    }
    await requireStoreAccess(actor, tyre.storeId);

    const posted = await postStockInTransaction(
      tx,
      actor,
      "TYRE_DAG_SEND",
      prepareStockCommand("TYRE_DAG_SEND", {
        storeId: tyre.storeId,
        businessDate: command.businessDate,
        reason: `DAG send ${tyre.serialNumber}`,
        notes: command.notes,
        idempotencyKey: command.idempotencyKey,
        lines: [{ partId: tyre.partId, quantity: "1" }],
      }),
    );

    await tx
      .update(tyres)
      .set({ status: "AT_DAG", currentBusId: null, currentPosition: null })
      .where(eq(tyres.id, tyre.id));

    await tx.insert(tyreEvents).values({
      tyreId: tyre.id,
      type: "SEND_DAG",
      stockDocumentId: posted.id,
      storeId: tyre.storeId,
      fromStage: tyre.lifecycleStage,
      notes: command.notes || null,
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TYRE_DAG_SENT",
      entityType: "tyre",
      entityId: tyre.id,
      storeId: tyre.storeId,
      metadata: { serialNumber: tyre.serialNumber, documentId: posted.id },
    });
    return { id: tyre.id, documentId: posted.id };
  });
}

export async function receiveTyreFromDag(actor: Actor, input: unknown) {
  const command = receiveTyreFromDagSchema.parse(input);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const [tyre] = await tx
      .select()
      .from(tyres)
      .where(eq(tyres.id, command.tyreId))
      .limit(1);
    if (!tyre) throw new WorkshopError("Tyre not found");
    if (tyre.status !== "AT_DAG" || !tyre.storeId) {
      throw new WorkshopError("Tyre is not at DAG");
    }
    await requireStoreAccess(actor, tyre.storeId);

    const nextStage = nextDagStage(tyre.lifecycleStage);
    if (receiveIsScrap(tyre.lifecycleStage) || nextStage === "SCRAP") {
      await tx
        .update(tyres)
        .set({
          status: "SCRAPPED",
          lifecycleStage: "SCRAP",
          storeId: null,
          currentBusId: null,
          currentPosition: null,
        })
        .where(eq(tyres.id, tyre.id));
      await tx.insert(tyreEvents).values({
        tyreId: tyre.id,
        type: "SCRAP",
        storeId: tyre.storeId,
        fromStage: tyre.lifecycleStage,
        toStage: "SCRAP",
        notes: command.notes || "Received from DAG as scrap",
        createdBy: actor.id,
      });
      await tx.insert(auditEvents).values({
        actorId: actor.id,
        eventType: "TYRE_SCRAPPED",
        entityType: "tyre",
        entityId: tyre.id,
        storeId: tyre.storeId,
        metadata: { serialNumber: tyre.serialNumber },
      });
      return { id: tyre.id, documentId: null, stage: "SCRAP" as const };
    }

    if (!command.targetPartId) {
      throw new WorkshopError("Select the DAG SKU to receive this tyre as");
    }
    await requirePartCategory(tx, command.targetPartId, "TYRE");

    const posted = await postStockInTransaction(
      tx,
      actor,
      "TYRE_DAG_RECEIVE",
      prepareStockCommand("TYRE_DAG_RECEIVE", {
        storeId: tyre.storeId,
        businessDate: command.businessDate,
        reason: `DAG receive ${tyre.serialNumber} as ${nextStage}`,
        notes: command.notes,
        idempotencyKey: command.idempotencyKey,
        lines: [{ partId: command.targetPartId, quantity: "1" }],
      }),
    );

    await tx
      .update(tyres)
      .set({
        status: "IN_STORE",
        partId: command.targetPartId,
        lifecycleStage: nextStage,
      })
      .where(eq(tyres.id, tyre.id));

    await tx.insert(tyreEvents).values({
      tyreId: tyre.id,
      type: "RECEIVE_DAG",
      stockDocumentId: posted.id,
      storeId: tyre.storeId,
      fromStage: tyre.lifecycleStage,
      toStage: nextStage,
      notes: command.notes || null,
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TYRE_DAG_RECEIVED",
      entityType: "tyre",
      entityId: tyre.id,
      storeId: tyre.storeId,
      metadata: {
        serialNumber: tyre.serialNumber,
        stage: nextStage,
        documentId: posted.id,
      },
    });
    return { id: tyre.id, documentId: posted.id, stage: nextStage };
  });
}
