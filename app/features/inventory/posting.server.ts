import Decimal from "decimal.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { data } from "react-router";

import { db } from "~/db/client.server";
import * as schema from "~/db/schema";
import {
  auditEvents,
  documentSequences,
  inventoryBalances,
  parts,
  stockDocumentLines,
  stockDocuments,
  stockMovements,
  stores,
} from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { requireStoreAccess } from "~/lib/auth/authorization.server";
import { InsufficientStockError } from "./errors";
import { prepareStockCommand, type StockType } from "./command";

export { InsufficientStockError, inventoryActionError } from "./errors";
export { prepareStockCommand } from "./command";
export type { StockType } from "./command";

export type Transaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]
>[0];

type PreparedCommand = ReturnType<typeof prepareStockCommand>;

function documentNumberPrefix(
  type: StockType | "REVERSAL",
  storeCode: string,
  year: number,
) {
  const kind =
    type === "STOCK_RECEIPT"
      ? "SIN"
      : type === "BUS_ISSUE"
        ? "ISS"
        : type === "REVERSAL"
          ? "REV"
          : "ADJ";
  return `${kind}-${storeCode}-${year}-`;
}

async function nextDocumentNumber(
  tx: Transaction,
  storeId: string,
  type: StockType | "REVERSAL",
  businessDate: string,
) {
  const year = Number(businessDate.slice(0, 4));
  const [store] = await tx
    .select({ code: stores.code })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  if (!store) throw new Error("Store no longer exists");

  const numberPrefix = documentNumberPrefix(type, store.code, year);
  const [aggregate] = await tx
    .select({
      maxSeq: sql<number>`coalesce(max(cast(substring(${stockDocuments.documentNumber} from '[0-9]+$') as integer)), 0)`,
    })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.storeId, storeId),
        eq(stockDocuments.type, type),
        sql`${stockDocuments.documentNumber} like ${`${numberPrefix}%`}`,
      ),
    );
  const startAt = Number(aggregate?.maxSeq ?? 0) + 1;

  await tx
    .insert(documentSequences)
    .values({ storeId, documentType: type, year, nextValue: startAt })
    .onConflictDoNothing();

  // Heal sequences that fell behind (seed/manual inserts, wiped rows, etc.)
  const [sequence] = await tx
    .update(documentSequences)
    .set({
      nextValue: sql`greatest(${documentSequences.nextValue}, ${startAt}) + 1`,
    })
    .where(
      and(
        eq(documentSequences.storeId, storeId),
        eq(documentSequences.documentType, type),
        eq(documentSequences.year, year),
      ),
    )
    .returning({ value: sql<number>`${documentSequences.nextValue} - 1` });
  if (!sequence) throw new Error("Unable to allocate document number");

  return `${numberPrefix}${String(sequence.value).padStart(6, "0")}`;
}

export async function postStockInTransaction(
  tx: Transaction,
  actor: Actor,
  type: StockType,
  command: PreparedCommand,
) {
  const existing = await tx
    .select({ id: stockDocuments.id, number: stockDocuments.documentNumber })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.createdBy, actor.id),
        eq(stockDocuments.idempotencyKey, command.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const partRows = await tx
    .select()
    .from(parts)
    .where(
      inArray(
        parts.id,
        command.lines.map((line) => line.partId),
      ),
    );
  if (partRows.length !== command.lines.length) {
    throw new Error("One or more parts are invalid");
  }
  const partById = new Map(partRows.map((part) => [part.id, part]));
  const number = await nextDocumentNumber(
    tx,
    command.storeId,
    type,
    command.businessDate,
  );
  const [document] = await tx
    .insert(stockDocuments)
    .values({
      documentNumber: number,
      type,
      status: "DRAFT",
      storeId: command.storeId,
      supplierId: command.supplierId,
      busId: command.busId,
      businessDate: command.businessDate,
      reason: command.reason,
      notes: command.notes,
      idempotencyKey: command.idempotencyKey,
      createdBy: actor.id,
    })
    .returning();

  for (const [index, line] of command.lines.entries()) {
    const part = partById.get(line.partId)!;
    const delta =
      type === "BUS_ISSUE" ||
      (type === "ADJUSTMENT" && command.direction === "decrease")
        ? line.quantity.negated()
        : line.quantity;
    await tx
      .insert(inventoryBalances)
      .values({ storeId: command.storeId, partId: line.partId, onHand: "0" })
      .onConflictDoNothing();
    const [balance] = await tx
      .update(inventoryBalances)
      .set({
        onHand: sql`${inventoryBalances.onHand} + ${delta.toFixed(3)}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryBalances.storeId, command.storeId),
          eq(inventoryBalances.partId, line.partId),
          sql`${inventoryBalances.onHand} + ${delta.toFixed(3)} >= 0`,
        ),
      )
      .returning({ onHand: inventoryBalances.onHand });
    if (!balance) throw new InsufficientStockError(line.partId);
    const [documentLine] = await tx
      .insert(stockDocumentLines)
      .values({
        documentId: document.id,
        lineNumber: index + 1,
        partId: part.id,
        quantity: line.quantity.toFixed(3),
        unitCost: line.unitCost,
        skuSnapshot: part.sku,
        nameSnapshot: part.name,
        unitSnapshot: part.unit,
      })
      .returning();
    await tx.insert(stockMovements).values({
      documentId: document.id,
      documentLineId: documentLine.id,
      storeId: command.storeId,
      partId: part.id,
      quantityDelta: delta.toFixed(3),
      balanceAfter: balance.onHand,
    });
  }

  await tx
    .update(stockDocuments)
    .set({ status: "POSTED", postedBy: actor.id, postedAt: new Date() })
    .where(eq(stockDocuments.id, document.id));
  await tx.insert(auditEvents).values({
    actorId: actor.id,
    eventType: "INVENTORY_POSTED",
    entityType: "stock_document",
    entityId: document.id,
    storeId: command.storeId,
    metadata: { documentNumber: number, type },
  });
  return { id: document.id, number };
}

export async function postStock(actor: Actor, type: StockType, input: unknown) {
  const command = prepareStockCommand(type, input);
  await requireStoreAccess(actor, command.storeId);
  if (type === "ADJUSTMENT" && actor.role !== "ADMIN") {
    throw data(
      { message: "Only administrators can post adjustments." },
      { status: 403 },
    );
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    return postStockInTransaction(tx, actor, type, command);
  });
  if (type === "BUS_ISSUE" || command.direction === "decrease") {
    const { notifyLowStockForParts } =
      await import("~/lib/notifications.server");
    void notifyLowStockForParts(
      actor,
      command.storeId,
      command.lines.map((line) => line.partId),
    ).catch(() => undefined);
  }
  return result;
}

export async function postReversal(
  actor: Actor,
  input: {
    documentId: string;
    businessDate: string;
    reason: string;
    idempotencyKey: string;
  },
) {
  if (actor.role !== "ADMIN") {
    throw data(
      { message: "Only administrators can reverse stock documents." },
      { status: 403 },
    );
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const existing = await tx
      .select({ id: stockDocuments.id, number: stockDocuments.documentNumber })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.createdBy, actor.id),
          eq(stockDocuments.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const [original] = await tx
      .select()
      .from(stockDocuments)
      .where(eq(stockDocuments.id, input.documentId))
      .limit(1);
    if (!original || original.status !== "POSTED") {
      throw new Error("Posted document not found");
    }
    if (original.type === "REVERSAL") {
      throw new Error("Cannot reverse a reversal document");
    }
    const [alreadyReversed] = await tx
      .select({ id: stockDocuments.id })
      .from(stockDocuments)
      .where(eq(stockDocuments.reversesDocumentId, original.id))
      .limit(1);
    if (alreadyReversed) {
      throw new Error("Document has already been reversed");
    }

    const originalLines = await tx
      .select()
      .from(stockDocumentLines)
      .where(eq(stockDocumentLines.documentId, original.id));
    const originalMovements = await tx
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.documentId, original.id));
    if (originalMovements.length === 0) {
      throw new Error("Original document has no movements");
    }

    const number = await nextDocumentNumber(
      tx,
      original.storeId,
      "REVERSAL",
      input.businessDate,
    );
    const [document] = await tx
      .insert(stockDocuments)
      .values({
        documentNumber: number,
        type: "REVERSAL",
        status: "DRAFT",
        storeId: original.storeId,
        busId: original.busId,
        supplierId: original.supplierId,
        reversesDocumentId: original.id,
        businessDate: input.businessDate,
        reason: input.reason,
        notes: `Reverses ${original.documentNumber}`,
        idempotencyKey: input.idempotencyKey,
        createdBy: actor.id,
      })
      .returning();

    const lineById = new Map(originalLines.map((line) => [line.id, line]));
    let lineNumber = 0;
    for (const movement of originalMovements) {
      lineNumber += 1;
      const sourceLine = lineById.get(movement.documentLineId);
      if (!sourceLine) {
        throw new Error("Movement line missing for reversal");
      }
      const delta = new Decimal(movement.quantityDelta).negated();
      await tx
        .insert(inventoryBalances)
        .values({
          storeId: movement.storeId,
          partId: movement.partId,
          onHand: "0",
        })
        .onConflictDoNothing();
      const [balance] = await tx
        .update(inventoryBalances)
        .set({
          onHand: sql`${inventoryBalances.onHand} + ${delta.toFixed(3)}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventoryBalances.storeId, movement.storeId),
            eq(inventoryBalances.partId, movement.partId),
            sql`${inventoryBalances.onHand} + ${delta.toFixed(3)} >= 0`,
          ),
        )
        .returning({ onHand: inventoryBalances.onHand });
      if (!balance) throw new InsufficientStockError(movement.partId);
      const [documentLine] = await tx
        .insert(stockDocumentLines)
        .values({
          documentId: document.id,
          lineNumber,
          partId: sourceLine.partId,
          quantity: sourceLine.quantity,
          unitCost: sourceLine.unitCost,
          skuSnapshot: sourceLine.skuSnapshot,
          nameSnapshot: sourceLine.nameSnapshot,
          unitSnapshot: sourceLine.unitSnapshot,
        })
        .returning();
      await tx.insert(stockMovements).values({
        documentId: document.id,
        documentLineId: documentLine.id,
        storeId: movement.storeId,
        partId: movement.partId,
        quantityDelta: delta.toFixed(3),
        balanceAfter: balance.onHand,
        reversesMovementId: movement.id,
      });
    }

    await tx
      .update(stockDocuments)
      .set({ status: "POSTED", postedBy: actor.id, postedAt: new Date() })
      .where(eq(stockDocuments.id, document.id));
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "INVENTORY_REVERSED",
      entityType: "stock_document",
      entityId: document.id,
      storeId: original.storeId,
      metadata: {
        documentNumber: number,
        reverses: original.documentNumber,
      },
    });
    return { id: document.id, number };
  });
}
