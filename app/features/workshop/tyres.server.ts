import { and, eq, sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import {
  auditEvents,
  inventoryBalances,
  parts,
  tyreEvents,
  tyres,
} from "~/db/schema";
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
  disposeTyreSchema,
  fitTyreSchema,
  receiveTyreFromDagSchema,
  registerTyreSchema,
  sendTyreToDagSchema,
} from "./schemas";
import {
  canSendToDag,
  isOperableInStore,
  skuMatchesLifecycleStage,
} from "./tyre-lifecycle";

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
    if (
      !isOperableInStore(incoming.status) ||
      incoming.storeId !== card.storeId
    ) {
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
    if (!isOperableInStore(tyre.status) || !tyre.storeId) {
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
        supplierId: command.supplierId,
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

    await requirePartCategory(tx, command.targetPartId, "TYRE");
    const [targetPart] = await tx
      .select({ sku: parts.sku })
      .from(parts)
      .where(eq(parts.id, command.targetPartId))
      .limit(1);
    if (!targetPart) throw new WorkshopError("Target tyre SKU not found");
    if (!skuMatchesLifecycleStage(targetPart.sku, command.toStage)) {
      throw new WorkshopError(
        `SKU ${targetPart.sku} does not match return stage ${command.toStage}`,
      );
    }

    const posted = await postStockInTransaction(
      tx,
      actor,
      "TYRE_DAG_RECEIVE",
      prepareStockCommand("TYRE_DAG_RECEIVE", {
        storeId: tyre.storeId,
        businessDate: command.businessDate,
        reason: `DAG return ${tyre.serialNumber} as ${command.toStage}`,
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
        lifecycleStage: command.toStage,
      })
      .where(eq(tyres.id, tyre.id));

    await tx.insert(tyreEvents).values({
      tyreId: tyre.id,
      type: "RECEIVE_DAG",
      stockDocumentId: posted.id,
      storeId: tyre.storeId,
      fromStage: tyre.lifecycleStage,
      toStage: command.toStage,
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
        stage: command.toStage,
        documentId: posted.id,
      },
    });
    return { id: tyre.id, documentId: posted.id, stage: command.toStage };
  });
}

export async function disposeTyre(actor: Actor, input: unknown) {
  const command = disposeTyreSchema.parse(input);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const [tyre] = await tx
      .select()
      .from(tyres)
      .where(eq(tyres.id, command.tyreId))
      .limit(1);
    if (!tyre) throw new WorkshopError("Tyre not found");
    if (!isOperableInStore(tyre.status) || !tyre.storeId) {
      throw new WorkshopError("Tyre must be in store stock to dispose");
    }
    await requireStoreAccess(actor, tyre.storeId);

    const posted = await postStockInTransaction(
      tx,
      actor,
      "TYRE_DISPOSAL",
      prepareStockCommand("TYRE_DISPOSAL", {
        storeId: tyre.storeId,
        businessDate: command.businessDate,
        reason: `Dispose ${tyre.serialNumber}`,
        notes: command.notes,
        idempotencyKey: command.idempotencyKey,
        lines: [{ partId: tyre.partId, quantity: "1" }],
      }),
    );

    await tx
      .update(tyres)
      .set({
        status: "DISPOSED",
        currentBusId: null,
        currentPosition: null,
      })
      .where(eq(tyres.id, tyre.id));

    await tx.insert(tyreEvents).values({
      tyreId: tyre.id,
      type: "DISPOSE",
      stockDocumentId: posted.id,
      storeId: tyre.storeId,
      fromStage: tyre.lifecycleStage,
      notes: command.notes || null,
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TYRE_DISPOSED",
      entityType: "tyre",
      entityId: tyre.id,
      storeId: tyre.storeId,
      metadata: { serialNumber: tyre.serialNumber, documentId: posted.id },
    });
    return { id: tyre.id, documentId: posted.id };
  });
}
