import Decimal from "decimal.js";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { data } from "react-router";

import { db } from "~/db/client.server";
import * as schema from "~/db/schema";
import {
  auditEvents,
  documentSequences,
  inventoryBalances,
  jobCards,
  parts,
  stockDocumentLines,
  stockDocuments,
  stockMovements,
  stores,
} from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { requireStoreAccess } from "~/lib/auth/authorization.server";
import { InsufficientStockError, inventoryActionError } from "./errors";
import {
  isStockDecrease,
  prepareStockCommand,
  type StockType,
} from "./command";

export { InsufficientStockError, inventoryActionError } from "./errors";
export { prepareStockCommand } from "./command";
export type { StockType } from "./command";

export type Transaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]
>[0];

type PreparedCommand = ReturnType<typeof prepareStockCommand>;

async function assertJobCardForIssue(
  tx: Transaction,
  type: StockType,
  command: PreparedCommand,
  options?: { allowClosed?: boolean },
) {
  if (type !== "BUS_ISSUE" && type !== "BUS_RETURN") return;
  if (!command.jobCardId) {
    throw new Error("An open job card is required to issue or return parts");
  }
  const [card] = await tx
    .select({
      id: jobCards.id,
      status: jobCards.status,
      storeId: jobCards.storeId,
      busId: jobCards.busId,
    })
    .from(jobCards)
    .where(eq(jobCards.id, command.jobCardId))
    .limit(1);
  if (!card) throw new Error("Job card not found");
  if (card.status === "CANCELLED") {
    throw new Error("Job card is cancelled");
  }
  const allowClosed = options?.allowClosed === true && type === "BUS_ISSUE";
  if (card.status === "CLOSED" && !allowClosed) {
    throw new Error("Job card must be open to post stock against it");
  }
  if (card.status !== "OPEN" && card.status !== "CLOSED") {
    throw new Error("Job card must be open to post stock against it");
  }
  if (card.storeId !== command.storeId) {
    throw new Error("Job card store does not match the stock document");
  }
  if (card.busId !== command.busId) {
    throw new Error("Job card bus does not match the stock document");
  }
}

function documentNumberPrefix(
  type: StockType | "REVERSAL",
  storeCode: string,
  year: number,
) {
  let kind = "ADJ";
  if (type === "STOCK_RECEIPT") kind = "SIN";
  else if (type === "BUS_ISSUE") kind = "ISS";
  else if (type === "BUS_RETURN") kind = "BSR";
  else if (type === "REVERSAL") kind = "REV";
  else if (type === "TYRE_DAG_SEND") kind = "TDS";
  else if (type === "TYRE_DAG_RECEIVE") kind = "TDR";
  else if (type === "TYRE_DISPOSAL") kind = "TDP";
  else if (type === "TRANSFER_OUT") kind = "TRO";
  else if (type === "TRANSFER_IN") kind = "TRI";

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

async function pendingIssueQuantity(
  tx: Transaction,
  storeId: string,
  partId: string,
  excludeDocumentId?: string,
) {
  const [row] = await tx
    .select({
      qty: sql<string>`coalesce(sum(${stockDocumentLines.quantity}), 0)`,
    })
    .from(stockDocumentLines)
    .innerJoin(
      stockDocuments,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
        eq(stockDocuments.storeId, storeId),
        eq(stockDocumentLines.partId, partId),
        excludeDocumentId
          ? ne(stockDocuments.id, excludeDocumentId)
          : undefined,
      ),
    );
  return new Decimal(row?.qty ?? 0);
}

async function assertAvailableForPendingIssue(
  tx: Transaction,
  storeId: string,
  partId: string,
  quantity: Decimal,
) {
  await tx
    .insert(inventoryBalances)
    .values({ storeId, partId, onHand: "0" })
    .onConflictDoNothing();
  const reserved = await pendingIssueQuantity(tx, storeId, partId);
  const [balance] = await tx
    .select({ onHand: inventoryBalances.onHand })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.storeId, storeId),
        eq(inventoryBalances.partId, partId),
      ),
    )
    .limit(1);
  if (new Decimal(balance?.onHand ?? 0).minus(reserved).lt(quantity)) {
    throw new InsufficientStockError(partId);
  }
}

async function applyBalanceDelta(
  tx: Transaction,
  storeId: string,
  partId: string,
  delta: Decimal,
  excludeDocumentId?: string,
) {
  await tx
    .insert(inventoryBalances)
    .values({ storeId, partId, onHand: "0" })
    .onConflictDoNothing();
  const reserved = delta.isNegative()
    ? await pendingIssueQuantity(tx, storeId, partId, excludeDocumentId)
    : new Decimal(0);
  const [balance] = await tx
    .update(inventoryBalances)
    .set({
      onHand: sql`${inventoryBalances.onHand} + ${delta.toFixed(3)}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryBalances.storeId, storeId),
        eq(inventoryBalances.partId, partId),
        sql`${inventoryBalances.onHand} + ${delta.toFixed(3)} >= ${reserved.toFixed(3)}`,
      ),
    )
    .returning({ onHand: inventoryBalances.onHand });
  if (!balance) throw new InsufficientStockError(partId);
  return balance.onHand;
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
  await assertJobCardForIssue(tx, type, command);
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
      jobCardId: command.jobCardId,
      destinationStoreId: command.destinationStoreId,
      linkedDocumentId: command.linkedDocumentId,
      businessDate: command.businessDate,
      reason: command.reason,
      notes: command.notes,
      idempotencyKey: command.idempotencyKey,
      createdBy: actor.id,
    })
    .returning();

  for (const [index, line] of command.lines.entries()) {
    const part = partById.get(line.partId)!;
    const delta = isStockDecrease(type, command.direction)
      ? line.quantity.negated()
      : line.quantity;
    const onHand = await applyBalanceDelta(
      tx,
      command.storeId,
      line.partId,
      delta,
    );
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
      balanceAfter: onHand,
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
  if (isStockDecrease(type, command.direction)) {
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

export async function postConversion(
  actor: Actor,
  input: {
    storeId: string;
    businessDate: string;
    sourcePartId: string;
    targetPartId: string;
    quantity: string;
    idempotencyKey: string;
  },
) {
  await requireStoreAccess(actor, input.storeId);
  if (actor.role !== "ADMIN") {
    throw data(
      { message: "Only administrators can convert tires." },
      { status: 403 },
    );
  }

  const outCommand = prepareStockCommand("ADJUSTMENT", {
    storeId: input.storeId,
    businessDate: input.businessDate,
    reason: `Tire Conversion to ${input.targetPartId}`,
    direction: "decrease",
    lines: [{ partId: input.sourcePartId, quantity: input.quantity }],
    idempotencyKey: input.idempotencyKey + "-out",
  });

  const inCommand = prepareStockCommand("ADJUSTMENT", {
    storeId: input.storeId,
    businessDate: input.businessDate,
    reason: `Tire Conversion from ${input.sourcePartId}`,
    direction: "increase",
    lines: [{ partId: input.targetPartId, quantity: input.quantity }],
    idempotencyKey: input.idempotencyKey + "-in",
  });

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    await postStockInTransaction(tx, actor, "ADJUSTMENT", outCommand);
    const inResult = await postStockInTransaction(
      tx,
      actor,
      "ADJUSTMENT",
      inCommand,
    );
    return inResult; // We return the receipt document as the main result
  });

  const { notifyLowStockForParts } = await import("~/lib/notifications.server");
  void notifyLowStockForParts(actor, input.storeId, [input.sourcePartId]).catch(
    () => undefined,
  );

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
        jobCardId: original.jobCardId,
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

async function persistApprovalError(documentId: string, error: unknown) {
  let message = inventoryActionError(error, "Unable to approve issue");
  if (error instanceof InsufficientStockError) {
    const [part] = await db
      .select({ sku: parts.sku, name: parts.name })
      .from(parts)
      .where(eq(parts.id, error.partId))
      .limit(1);
    if (part) {
      message = `Insufficient stock: ${part.sku} (${part.name})`;
    }
  }
  await db
    .update(stockDocuments)
    .set({
      lastApprovalError: message,
      lastApprovalAttemptedAt: new Date(),
    })
    .where(
      and(
        eq(stockDocuments.id, documentId),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
      ),
    );
}

export async function submitIssueForApproval(actor: Actor, input: unknown) {
  const command = prepareStockCommand("BUS_ISSUE", input);
  await requireStoreAccess(actor, command.storeId);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const existing = await tx
      .select({
        id: stockDocuments.id,
        number: stockDocuments.documentNumber,
        status: stockDocuments.status,
      })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.createdBy, actor.id),
          eq(stockDocuments.idempotencyKey, command.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (existing[0].status === "REJECTED") {
        throw new Error(
          "This request was already submitted and rejected. Start a new issue.",
        );
      }
      return {
        id: existing[0].id,
        number: existing[0].number,
        created: false,
      };
    }

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
    await assertJobCardForIssue(tx, "BUS_ISSUE", command);
    for (const line of command.lines) {
      await assertAvailableForPendingIssue(
        tx,
        command.storeId,
        line.partId,
        line.quantity,
      );
    }
    const partById = new Map(partRows.map((part) => [part.id, part]));
    const number = await nextDocumentNumber(
      tx,
      command.storeId,
      "BUS_ISSUE",
      command.businessDate,
    );
    const [document] = await tx
      .insert(stockDocuments)
      .values({
        documentNumber: number,
        type: "BUS_ISSUE",
        status: "PENDING_APPROVAL",
        storeId: command.storeId,
        busId: command.busId,
        jobCardId: command.jobCardId,
        businessDate: command.businessDate,
        reason: command.reason,
        notes: command.notes,
        idempotencyKey: command.idempotencyKey,
        createdBy: actor.id,
      })
      .returning();

    for (const [index, line] of command.lines.entries()) {
      const part = partById.get(line.partId)!;
      await tx.insert(stockDocumentLines).values({
        documentId: document.id,
        lineNumber: index + 1,
        partId: part.id,
        quantity: line.quantity.toFixed(3),
        unitCost: line.unitCost,
        skuSnapshot: part.sku,
        nameSnapshot: part.name,
        unitSnapshot: part.unit,
      });
    }

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "ISSUE_SUBMITTED",
      entityType: "stock_document",
      entityId: document.id,
      storeId: command.storeId,
      metadata: { documentNumber: number, type: "BUS_ISSUE" },
    });
    return { id: document.id, number, created: true };
  });

  if (result.created) {
    const { notifyAdmins } = await import("~/lib/notifications.server");
    void notifyAdmins({
      type: "ISSUE_PENDING",
      title: "Bus issue awaiting approval",
      body: `${result.number} needs approval.`,
      href: `/receipts/${result.id}`,
    }).catch(() => undefined);
  }

  return { id: result.id, number: result.number };
}

export async function approvePendingIssue(actor: Actor, documentId: string) {
  if (actor.role !== "ADMIN") {
    throw data(
      { message: "Only administrators can approve bus issues." },
      { status: 403 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const [document] = await tx
        .select()
        .from(stockDocuments)
        .where(eq(stockDocuments.id, documentId))
        .limit(1);
      if (!document || document.type !== "BUS_ISSUE") {
        throw new Error("Pending bus issue not found");
      }
      if (document.status !== "PENDING_APPROVAL") {
        throw new Error("This issue is not awaiting approval");
      }
      await requireStoreAccess(actor, document.storeId);

      const lines = await tx
        .select()
        .from(stockDocumentLines)
        .where(eq(stockDocumentLines.documentId, document.id));
      if (lines.length === 0) {
        throw new Error("Issue has no lines to post");
      }

      await assertJobCardForIssue(
        tx,
        "BUS_ISSUE",
        prepareStockCommand("BUS_ISSUE", {
          storeId: document.storeId,
          busId: document.busId,
          jobCardId: document.jobCardId,
          businessDate: document.businessDate,
          idempotencyKey: document.idempotencyKey,
          lines: lines.map((line) => ({
            partId: line.partId,
            quantity: line.quantity,
          })),
        }),
        { allowClosed: true },
      );

      for (const line of lines) {
        const delta = new Decimal(line.quantity).negated();
        const onHand = await applyBalanceDelta(
          tx,
          document.storeId,
          line.partId,
          delta,
          document.id,
        );
        await tx.insert(stockMovements).values({
          documentId: document.id,
          documentLineId: line.id,
          storeId: document.storeId,
          partId: line.partId,
          quantityDelta: delta.toFixed(3),
          balanceAfter: onHand,
        });
      }

      const [posted] = await tx
        .update(stockDocuments)
        .set({
          status: "POSTED",
          postedBy: actor.id,
          postedAt: new Date(),
          lastApprovalError: null,
          lastApprovalAttemptedAt: null,
        })
        .where(
          and(
            eq(stockDocuments.id, document.id),
            eq(stockDocuments.status, "PENDING_APPROVAL"),
          ),
        )
        .returning({ id: stockDocuments.id });
      if (!posted) {
        throw new Error("This issue is not awaiting approval");
      }
      await tx.insert(auditEvents).values({
        actorId: actor.id,
        eventType: "ISSUE_APPROVED",
        entityType: "stock_document",
        entityId: document.id,
        storeId: document.storeId,
        metadata: { documentNumber: document.documentNumber },
      });
      return {
        id: document.id,
        number: document.documentNumber,
        createdBy: document.createdBy,
        storeId: document.storeId,
        partIds: lines.map((line) => line.partId),
      };
    });

    const { notifyLowStockForParts, notifyUser } =
      await import("~/lib/notifications.server");
    void notifyLowStockForParts(actor, result.storeId, result.partIds).catch(
      () => undefined,
    );
    void notifyUser(result.createdBy, {
      type: "ISSUE_APPROVED",
      title: "Bus issue approved",
      body: `${result.number} has been posted.`,
      href: `/receipts/${result.id}`,
    }).catch(() => undefined);

    return { id: result.id, number: result.number };
  } catch (error) {
    await persistApprovalError(documentId, error);
    throw error;
  }
}

export async function rejectPendingIssue(
  actor: Actor,
  documentId: string,
  reason: string,
) {
  if (actor.role !== "ADMIN") {
    throw data(
      { message: "Only administrators can reject bus issues." },
      { status: 403 },
    );
  }
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new Error("A rejection reason of at least 3 characters is required");
  }

  const [document] = await db
    .update(stockDocuments)
    .set({
      status: "REJECTED",
      lastApprovalError: `Rejected: ${trimmed}`,
      lastApprovalAttemptedAt: new Date(),
    })
    .where(
      and(
        eq(stockDocuments.id, documentId),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
        eq(stockDocuments.type, "BUS_ISSUE"),
      ),
    )
    .returning({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      createdBy: stockDocuments.createdBy,
      storeId: stockDocuments.storeId,
    });
  if (!document) {
    throw new Error("Pending bus issue not found");
  }

  await db.insert(auditEvents).values({
    actorId: actor.id,
    eventType: "ISSUE_REJECTED",
    entityType: "stock_document",
    entityId: document.id,
    storeId: document.storeId,
    metadata: { documentNumber: document.number, reason: trimmed },
  });

  const { notifyUser } = await import("~/lib/notifications.server");
  void notifyUser(document.createdBy, {
    type: "ISSUE_REJECTED",
    title: "Bus issue rejected",
    body: `${document.number}: ${trimmed}`,
    href: `/receipts/${document.id}`,
  }).catch(() => undefined);

  return document;
}
