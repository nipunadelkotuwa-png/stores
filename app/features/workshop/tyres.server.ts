import { and, desc, eq, sql } from "drizzle-orm";
import { data } from "react-router";

import { db } from "~/db/client.server";
import {
  auditEvents,
  inventoryBalances,
  parts,
  stockDocuments,
  tyreEvents,
  tyres,
} from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { requireStoreAccess } from "~/lib/auth/authorization.server";
import {
  notifyIssueSubmitted,
  postStockInTransaction,
  prepareStockCommand,
  submitIssueForApprovalInTransaction,
  type Transaction,
} from "~/features/inventory/posting.server";
import { encodeWorkshopNotes, parseWorkshopNotes } from "./pending-notes";
import { requirePartCategory } from "./category.server";
import { WorkshopError } from "./errors";
import { loadOpenJobCard } from "./job-cards.server";
import {
  disposeTyreSchema,
  fitTyreSchema,
  receiveTyreFromDagSchema,
  registerTyreSchema,
  rejectTyreAtDagSchema,
  sendTyreToDagSchema,
} from "./schemas";
import {
  canSendToDag,
  isOperableInStore,
  nextDagStage,
  skuMatchesLifecycleStage,
} from "./tyre-lifecycle";
import type { TyreLifecycleStage } from "./constants";

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

async function reservedTyreIds(tx: Transaction) {
  const pending = await tx
    .select({ notes: stockDocuments.notes })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
      ),
    );
  const ids = new Set<string>();
  for (const row of pending) {
    const payload = parseWorkshopNotes(row.notes);
    if (payload?.kind === "TYRE_FIT") ids.add(payload.tyreId);
  }
  return ids;
}

export async function fitOrReplaceTyre(actor: Actor, input: unknown) {
  const command = fitTyreSchema.parse(input);

  const result = await db.transaction(async (tx) => {
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
    const reserved = await reservedTyreIds(tx);
    if (reserved.has(incoming.id)) {
      throw new WorkshopError(
        "This tyre is already reserved for a pending fit",
      );
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

    const pending = await submitIssueForApprovalInTransaction(tx, actor, {
      storeId: card.storeId,
      busId: card.busId,
      jobCardId: card.id,
      businessDate: card.businessDate,
      notes: encodeWorkshopNotes(
        {
          kind: "TYRE_FIT",
          tyreId: incoming.id,
          position: command.position,
          occupantId: occupant?.id,
        },
        `Tyre ${incoming.serialNumber} fitted to ${command.position}`,
      ),
      idempotencyKey: `${command.idempotencyKey}-fit`,
      lines: [{ partId: incoming.partId, quantity: "1" }],
    });

    return {
      id: incoming.id,
      documentId: pending.id,
      number: pending.number,
      created: pending.created,
    };
  });

  notifyIssueSubmitted(result);
  return result;
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
      throw new WorkshopError(
        tyre.lifecycleStage === "DAG3"
          ? "DAG3 tyres cannot be sent for another DAG cycle"
          : "This tyre stage cannot be sent to DAG",
      );
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

    const toStage = nextDagStage(tyre.lifecycleStage as TyreLifecycleStage);

    const [sendEvent] = await tx
      .select({
        stockDocumentId: tyreEvents.stockDocumentId,
      })
      .from(tyreEvents)
      .where(
        and(eq(tyreEvents.tyreId, tyre.id), eq(tyreEvents.type, "SEND_DAG")),
      )
      .orderBy(desc(tyreEvents.occurredAt))
      .limit(1);
    if (!sendEvent?.stockDocumentId) {
      throw new WorkshopError("Original DAG send document not found");
    }

    const [sendDoc] = await tx
      .select({
        id: stockDocuments.id,
        supplierId: stockDocuments.supplierId,
        documentNumber: stockDocuments.documentNumber,
        type: stockDocuments.type,
      })
      .from(stockDocuments)
      .where(eq(stockDocuments.id, sendEvent.stockDocumentId))
      .limit(1);
    if (!sendDoc || sendDoc.type !== "TYRE_DAG_SEND") {
      throw new WorkshopError("Original DAG send document is invalid");
    }

    const [existingReceive] = await tx
      .select({ id: stockDocuments.id })
      .from(stockDocuments)
      .where(eq(stockDocuments.linkedDocumentId, sendDoc.id))
      .limit(1);
    if (existingReceive) {
      throw new WorkshopError("This DAG send has already been received");
    }

    await requirePartCategory(tx, command.targetPartId, "TYRE");
    const [targetPart] = await tx
      .select({ sku: parts.sku })
      .from(parts)
      .where(eq(parts.id, command.targetPartId))
      .limit(1);
    if (!targetPart) throw new WorkshopError("Target tyre SKU not found");
    if (!skuMatchesLifecycleStage(targetPart.sku, toStage)) {
      throw new WorkshopError(
        `SKU ${targetPart.sku} does not match return stage ${toStage}`,
      );
    }

    const posted = await postStockInTransaction(
      tx,
      actor,
      "TYRE_DAG_RECEIVE",
      prepareStockCommand("TYRE_DAG_RECEIVE", {
        storeId: tyre.storeId,
        supplierId: sendDoc.supplierId,
        linkedDocumentId: sendDoc.id,
        businessDate: command.businessDate,
        reason: `DAG return ${tyre.serialNumber} as ${toStage}`,
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
        lifecycleStage: toStage,
      })
      .where(eq(tyres.id, tyre.id));

    await tx.insert(tyreEvents).values({
      tyreId: tyre.id,
      type: "RECEIVE_DAG",
      stockDocumentId: posted.id,
      storeId: tyre.storeId,
      fromStage: tyre.lifecycleStage,
      toStage,
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
        fromStage: tyre.lifecycleStage,
        toStage,
        documentId: posted.id,
        linkedDocumentId: sendDoc.id,
        sendDocumentNumber: sendDoc.documentNumber,
      },
    });
    return { id: tyre.id, documentId: posted.id, stage: toStage };
  });
}

export async function rejectTyreAtDag(actor: Actor, input: unknown) {
  if (actor.role !== "ADMIN") {
    throw data(
      { message: "Only administrators can reject a tyre at DAG." },
      { status: 403 },
    );
  }
  const command = rejectTyreAtDagSchema.parse(input);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const [tyre] = await tx
      .select()
      .from(tyres)
      .where(eq(tyres.id, command.tyreId))
      .limit(1);
    if (!tyre) throw new WorkshopError("Tyre not found");
    if (tyre.status !== "AT_DAG") {
      throw new WorkshopError("Tyre must be at DAG to record a supplier reject");
    }

    const [sendEvent] = await tx
      .select({
        stockDocumentId: tyreEvents.stockDocumentId,
      })
      .from(tyreEvents)
      .where(
        and(eq(tyreEvents.tyreId, tyre.id), eq(tyreEvents.type, "SEND_DAG")),
      )
      .orderBy(desc(tyreEvents.occurredAt))
      .limit(1);

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
      type: "DAG_REJECTED",
      stockDocumentId: sendEvent?.stockDocumentId || null,
      storeId: tyre.storeId,
      fromStage: tyre.lifecycleStage,
      toStage: tyre.lifecycleStage,
      notes: [command.reason, command.notes].filter(Boolean).join(" — "),
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TYRE_DAG_REJECTED",
      entityType: "tyre",
      entityId: tyre.id,
      storeId: tyre.storeId,
      metadata: {
        serialNumber: tyre.serialNumber,
        stage: tyre.lifecycleStage,
        reason: command.reason,
        sendDocumentId: sendEvent?.stockDocumentId,
      },
    });
    return { id: tyre.id };
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
