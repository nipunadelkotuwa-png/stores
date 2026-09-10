import { and, desc, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";

import { db } from "~/db/client.server";
import {
  auditEvents,
  inventoryBalances,
  localPurchaseLines,
  localPurchases,
  partCategories,
  parts,
  stockDocuments,
  suppliers,
  tyreEvents,
  tyreImports,
  tyres,
} from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import {
  assertPermission,
  requireStoreAccess,
} from "~/lib/auth/authorization.server";
import {
  notifyIssueSubmitted,
  postStockInTransaction,
  prepareStockCommand,
  submitIssueForApprovalInTransaction,
  type Transaction,
} from "~/features/inventory/posting.server";
import { encodeWorkshopNotes } from "./pending-notes";
import { requirePartCategory } from "./category.server";
import {
  WorkshopConflictError,
  WorkshopError,
  LIFECYCLE_CONFLICT,
} from "./errors";
import { loadOpenJobCard } from "./job-cards.server";
import {
  lockTyre,
  loadTyreLifecycleEvents,
  reservedTyreIds,
} from "./tyre-lock.server";
import {
  canonicalizeTyreImport,
  disposeTyreSchema,
  fitTyreSchema,
  importOrgTyresSchema,
  receiveTyreFromDagSchema,
  receiveTyresFromDagSchema,
  registerTyreSchema,
  rejectTyreAtDagSchema,
  sendTyreToDagSchema,
  sendTyresToDagSchema,
  tyreImportRequestHash,
} from "./schemas";
import { dagBatchError, dagDocumentIdempotencyKey } from "./dag-batch";
import {
  canSendToDag,
  getTyreLifecycleActions,
  isOperableInStore,
  lifecycleStageFromSku,
  nextDagStage,
  skuMatchesLifecycleStage,
  type TyreLifecycleEvent,
} from "./tyre-lifecycle";
import type { TyreLifecycleStage } from "./constants";
import {
  isSerializationFailure,
  isUniqueViolation,
} from "~/lib/postgres-error";

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

async function runTyreTransaction<T>(
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      return work(tx);
    });
  } catch (error) {
    if (isSerializationFailure(error)) {
      throw new WorkshopConflictError(LIFECYCLE_CONFLICT);
    }
    throw error;
  }
}

async function assertNotReserved(tx: Transaction, tyreId: string) {
  const reserved = await reservedTyreIds(tx);
  if (reserved.has(tyreId)) {
    throw new WorkshopConflictError(
      "This tyre is already reserved for a pending fit",
    );
  }
}

function actionsFor(
  tyre: { id: string; lifecycleStage: string; status: string },
  events: TyreLifecycleEvent[],
) {
  return getTyreLifecycleActions({
    tyreId: tyre.id,
    stage: tyre.lifecycleStage,
    status: tyre.status,
    events,
  });
}

export async function registerTyreInTransaction(
  tx: Transaction,
  actor: Actor,
  input: {
    storeId: string;
    partId: string;
    serialNumber: string;
    notes?: string | null;
    reason?: string | null;
    skipStockCheck?: boolean;
  },
) {
  const part = await requirePartCategory(tx, input.partId, "TYRE");
  const stage = lifecycleStageFromSku(part.sku);
  if (!stage) {
    throw new WorkshopError(
      `SKU ${part.sku} does not include a tyre lifecycle stage`,
    );
  }
  if (!input.skipStockCheck) {
    const stored = await inStoreCount(tx, input.storeId, input.partId);
    const stock = await onHand(tx, input.storeId, input.partId);
    if (stored + 1 > stock) {
      throw new WorkshopError(
        "Not enough on-hand tyre stock to register another serial at this store",
      );
    }
  }

  const [duplicate] = await tx
    .select({ serialNumber: tyres.serialNumber })
    .from(tyres)
    .where(
      sql`lower(${tyres.serialNumber}) = ${input.serialNumber.toLowerCase()}`,
    )
    .limit(1);
  if (duplicate) {
    throw new WorkshopError(`Serial ${duplicate.serialNumber} already exists`);
  }

  try {
    const [tyre] = await tx
      .insert(tyres)
      .values({
        serialNumber: input.serialNumber,
        partId: input.partId,
        lifecycleStage: stage,
        status: "IN_STORE",
        storeId: input.storeId,
        notes: input.notes || null,
      })
      .returning();

    await tx.insert(tyreEvents).values({
      tyreId: tyre.id,
      type: "REGISTER",
      storeId: input.storeId,
      toStage: stage,
      notes: input.notes || null,
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TYRE_REGISTERED",
      entityType: "tyre",
      entityId: tyre.id,
      storeId: input.storeId,
      metadata: {
        serialNumber: tyre.serialNumber,
        stage,
        reason: input.reason ?? null,
      },
    });
    return tyre;
  } catch (error) {
    if (
      isUniqueViolation(error, "tyres_serial_unique") ||
      isUniqueViolation(error, "tyres_serial_lower_unique")
    ) {
      throw new WorkshopError(`Serial ${input.serialNumber} already exists`);
    }
    throw error;
  }
}

export async function registerTyre(actor: Actor, input: unknown) {
  assertPermission(
    actor,
    "adjustments.create",
    "Only administrators can register serials as an inventory correction. Import new tyres instead.",
  );
  const command = registerTyreSchema.parse(input);
  await requireStoreAccess(actor, command.storeId);

  return runTyreTransaction(async (tx) => {
    return registerTyreInTransaction(tx, actor, {
      storeId: command.storeId,
      partId: command.partId,
      serialNumber: command.serialNumber,
      notes: [command.reason, command.notes].filter(Boolean).join(" — "),
      reason: command.reason,
    });
  });
}

export async function importOrgTyres(actor: Actor, input: unknown) {
  assertPermission(actor, "tyres.manage");
  const command = importOrgTyresSchema.parse(input);
  await requireStoreAccess(actor, command.storeId);
  const canonical = canonicalizeTyreImport(command);
  const requestHash = tyreImportRequestHash(canonical);

  return runTyreTransaction(async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM tyre_imports WHERE store_id = ${command.storeId}::uuid AND created_by = ${actor.id}::uuid AND idempotency_key = ${command.idempotencyKey} FOR UPDATE`,
    );
    const [existing] = await tx
      .select()
      .from(tyreImports)
      .where(
        and(
          eq(tyreImports.storeId, command.storeId),
          eq(tyreImports.createdBy, actor.id),
          eq(tyreImports.idempotencyKey, command.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new WorkshopConflictError(
          "This import key was already used with different data",
        );
      }
      return {
        purchaseId: existing.purchaseId,
        receiptId: existing.receiptDocumentId,
        created: false,
      };
    }

    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, command.supplierId))
      .limit(1);
    if (!supplier?.active) throw new WorkshopError("Supplier is not available");
    const part = await requirePartCategory(tx, command.partId, "TYRE");
    if (!skuMatchesLifecycleStage(part.sku, "ORG")) {
      throw new WorkshopError("Import SKU must be an ORG tyre");
    }

    const unitPrice = new Decimal(canonical.unitCost);
    const quantity = new Decimal(canonical.quantity);
    const lineTotal = quantity.times(unitPrice).toDecimalPlaces(2);
    const purchaseNumber = `LPO-${command.businessDate.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const [purchase] = await tx
      .insert(localPurchases)
      .values({
        purchaseNumber,
        storeId: command.storeId,
        supplierId: command.supplierId,
        supplierNameSnapshot: supplier.name,
        supplierInvoiceReference: command.invoiceReference || null,
        businessDate: command.businessDate,
        subtotal: lineTotal.toFixed(2),
        total: lineTotal.toFixed(2),
        status: "DRAFT",
        notes: command.notes || null,
        idempotencyKey: `tyre-import-${command.storeId}-${command.idempotencyKey}`,
        createdBy: actor.id,
      })
      .returning();

    await tx.insert(localPurchaseLines).values({
      purchaseId: purchase.id,
      lineNumber: 1,
      partId: part.id,
      quantity: quantity.toFixed(3),
      unitPrice: unitPrice.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
      skuSnapshot: part.sku,
      nameSnapshot: part.name,
      unitSnapshot: part.unit,
    });

    const receipt = await postStockInTransaction(
      tx,
      actor,
      "STOCK_RECEIPT",
      prepareStockCommand("STOCK_RECEIPT", {
        storeId: command.storeId,
        supplierId: command.supplierId,
        businessDate: command.businessDate,
        idempotencyKey: `tyre-import-receipt-${command.storeId}-${command.idempotencyKey}`,
        lines: [
          {
            partId: command.partId,
            quantity: String(canonical.quantity),
            unitCost: canonical.unitCost,
          },
        ],
      }),
    );

    await tx
      .update(localPurchases)
      .set({
        status: "POSTED",
        receiptDocumentId: receipt.id,
        postedBy: actor.id,
        postedAt: new Date(),
      })
      .where(eq(localPurchases.id, purchase.id));

    const registered = [];
    for (const serial of canonical.serials) {
      registered.push(
        await registerTyreInTransaction(tx, actor, {
          storeId: command.storeId,
          partId: command.partId,
          serialNumber: serial,
          notes: command.notes || null,
          reason: "IMPORT",
          skipStockCheck: true,
        }),
      );
    }

    await tx.insert(tyreImports).values({
      storeId: command.storeId,
      createdBy: actor.id,
      idempotencyKey: command.idempotencyKey,
      requestHash,
      purchaseId: purchase.id,
      receiptDocumentId: receipt.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TYRE_IMPORT_POSTED",
      entityType: "tyre_import",
      entityId: purchase.id,
      storeId: command.storeId,
      metadata: {
        purchaseNumber,
        receiptNumber: receipt.number,
        serials: canonical.serials,
        quantity: canonical.quantity,
      },
    });

    return {
      purchaseId: purchase.id,
      receiptId: receipt.id,
      receiptNumber: receipt.number,
      tyreIds: registered.map((tyre) => tyre.id),
      created: true,
    };
  });
}

export async function fitOrReplaceTyre(actor: Actor, input: unknown) {
  assertPermission(actor, "tyres.manage");
  const command = fitTyreSchema.parse(input);

  const result = await runTyreTransaction(async (tx) => {
    const card = await loadOpenJobCard(tx, command.jobCardId);
    await requireStoreAccess(actor, card.storeId);

    const incoming = await lockTyre(tx, command.tyreId);
    if (!incoming) throw new WorkshopError("Tyre not found");
    const events = await loadTyreLifecycleEvents(tx, incoming.id);
    if (!actionsFor(incoming, events).canFit) {
      throw new WorkshopConflictError(LIFECYCLE_CONFLICT);
    }
    if (
      !isOperableInStore(incoming.status) ||
      incoming.storeId !== card.storeId
    ) {
      throw new WorkshopError("Tyre must be in stock at this job card's store");
    }
    await assertNotReserved(tx, incoming.id);

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
    if (occupant) {
      await lockTyre(tx, occupant.id);
    }

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

async function existingStockByIdempotency(
  tx: Transaction,
  actorId: string,
  idempotencyKey: string,
) {
  const [row] = await tx
    .select({
      id: stockDocuments.id,
      type: stockDocuments.type,
      status: stockDocuments.status,
    })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.createdBy, actorId),
        eq(stockDocuments.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

function sendIneligibilityReason(
  tyre: { lifecycleStage: string; serialNumber: string },
  canSend: boolean,
) {
  if (canSend) return `${tyre.serialNumber} — ${LIFECYCLE_CONFLICT}`;
  if (tyre.lifecycleStage === "DAG3") {
    return `${tyre.serialNumber} — DAG3 tyres cannot be sent for another DAG cycle`;
  }
  return `${tyre.serialNumber} — not eligible to send to DAG`;
}

export async function sendTyreToDagInTx(
  tx: Transaction,
  actor: Actor,
  command: ReturnType<typeof sendTyreToDagSchema.parse>,
) {
  assertPermission(actor, "dag.send");
  const tyre = await lockTyre(tx, command.tyreId);
  if (!tyre) throw new WorkshopError("Tyre not found");
  if (!tyre.storeId) {
    throw new WorkshopError("Tyre must be in store stock to send to DAG");
  }
  await requireStoreAccess(actor, tyre.storeId);
  await assertNotReserved(tx, tyre.id);
  const events = await loadTyreLifecycleEvents(tx, tyre.id);
  if (!actionsFor(tyre, events).canSendToDag) {
    throw new WorkshopConflictError(
      canSendToDag(tyre.lifecycleStage as TyreLifecycleStage)
        ? LIFECYCLE_CONFLICT
        : tyre.lifecycleStage === "DAG3"
          ? "DAG3 tyres cannot be sent for another DAG cycle"
          : "This tyre is not eligible to send to DAG",
    );
  }

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

  if (tyre.status !== "AT_DAG") {
    await tx
      .update(tyres)
      .set({ status: "AT_DAG", currentBusId: null, currentPosition: null })
      .where(eq(tyres.id, tyre.id));

    const [alreadySent] = await tx
      .select({ id: tyreEvents.id })
      .from(tyreEvents)
      .where(
        and(
          eq(tyreEvents.tyreId, tyre.id),
          eq(tyreEvents.stockDocumentId, posted.id),
          eq(tyreEvents.type, "SEND_DAG"),
        ),
      )
      .limit(1);
    if (!alreadySent) {
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
    }
  }

  return { id: tyre.id, documentId: posted.id };
}

export async function sendTyreToDag(actor: Actor, input: unknown) {
  assertPermission(actor, "dag.send");
  const command = sendTyreToDagSchema.parse(input);
  return runTyreTransaction((tx) => sendTyreToDagInTx(tx, actor, command));
}

export async function sendTyresToDag(actor: Actor, input: unknown) {
  assertPermission(actor, "dag.send");
  const command = sendTyresToDagSchema.parse(input);
  const tyreIds = [...new Set(command.tyreIds)].sort();

  return runTyreTransaction(async (tx) => {
    const locked = [];
    for (const tyreId of tyreIds) {
      locked.push({ tyreId, tyre: await lockTyre(tx, tyreId) });
    }

    const failures: string[] = [];
    const toPost: ReturnType<typeof sendTyreToDagSchema.parse>[] = [];
    let storeId: string | null = null;

    for (const { tyreId, tyre } of locked) {
      const label = tyre?.serialNumber ?? tyreId;
      const idempotencyKey = dagDocumentIdempotencyKey(
        "DAG_OUT",
        command.batchKey,
        tyreId,
      );
      const existing = await existingStockByIdempotency(
        tx,
        actor.id,
        idempotencyKey,
      );
      if (existing) {
        if (tyre?.status === "AT_DAG") continue;
        failures.push(`${label} — previous DAG OUT is incomplete`);
        continue;
      }
      if (!tyre) {
        failures.push(`${tyreId} — tyre not found`);
        continue;
      }
      if (!tyre.storeId) {
        failures.push(`${label} — must be in store stock to send to DAG`);
        continue;
      }
      try {
        await requireStoreAccess(actor, tyre.storeId);
      } catch {
        failures.push(`${label} — belongs to another store`);
        continue;
      }
      if (storeId && storeId !== tyre.storeId) {
        failures.push(`${label} — belongs to another store`);
        continue;
      }
      storeId = tyre.storeId;
      try {
        await assertNotReserved(tx, tyre.id);
      } catch (error) {
        failures.push(
          `${label} — ${error instanceof Error ? error.message : "reserved"}`,
        );
        continue;
      }
      const events = await loadTyreLifecycleEvents(tx, tyre.id);
      if (!actionsFor(tyre, events).canSendToDag) {
        failures.push(
          sendIneligibilityReason(
            tyre,
            canSendToDag(tyre.lifecycleStage as TyreLifecycleStage),
          ),
        );
        continue;
      }
      toPost.push({
        tyreId: tyre.id,
        supplierId: command.supplierId,
        businessDate: command.businessDate,
        notes: command.notes,
        idempotencyKey,
      });
    }

    if (failures.length > 0) throw dagBatchError("send", failures);

    const results = [];
    for (const item of toPost) {
      results.push(await sendTyreToDagInTx(tx, actor, item));
    }
    return results;
  });
}

async function listActiveTyreParts(tx: Transaction) {
  return tx
    .select({ id: parts.id, sku: parts.sku })
    .from(parts)
    .innerJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .where(and(eq(partCategories.code, "TYRE"), eq(parts.active, true)));
}

function resolveReturnPart(
  tyreParts: { id: string; sku: string }[],
  stage: TyreLifecycleStage,
  serial: string,
) {
  const matches = tyreParts.filter((part) =>
    skuMatchesLifecycleStage(part.sku, stage),
  );
  if (matches.length === 0) {
    return {
      error: `${serial} — no ${stage} return SKU`,
      partId: null as string | null,
    };
  }
  if (matches.length > 1) {
    return {
      error: `${serial} — more than one DAG return SKU matches ${stage}`,
      partId: null as string | null,
    };
  }
  return { error: null as string | null, partId: matches[0].id };
}

export async function receiveTyreFromDagInTx(
  tx: Transaction,
  actor: Actor,
  command: ReturnType<typeof receiveTyreFromDagSchema.parse>,
) {
  assertPermission(actor, "dag.receive");
  const tyre = await lockTyre(tx, command.tyreId);
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
    .where(and(eq(tyreEvents.tyreId, tyre.id), eq(tyreEvents.type, "SEND_DAG")))
    .orderBy(desc(tyreEvents.sequence))
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

  const [alreadyReceived] = await tx
    .select({ id: tyreEvents.id })
    .from(tyreEvents)
    .where(
      and(
        eq(tyreEvents.tyreId, tyre.id),
        eq(tyreEvents.stockDocumentId, posted.id),
        eq(tyreEvents.type, "RECEIVE_DAG"),
      ),
    )
    .limit(1);
  if (!alreadyReceived) {
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
  }
  return { id: tyre.id, documentId: posted.id, stage: toStage };
}

export async function receiveTyreFromDag(actor: Actor, input: unknown) {
  assertPermission(actor, "dag.receive");
  const command = receiveTyreFromDagSchema.parse(input);
  return runTyreTransaction((tx) => receiveTyreFromDagInTx(tx, actor, command));
}

export async function receiveTyresFromDag(actor: Actor, input: unknown) {
  assertPermission(actor, "dag.receive");
  const command = receiveTyresFromDagSchema.parse(input);
  const tyreIds = [...new Set(command.tyreIds)].sort();

  return runTyreTransaction(async (tx) => {
    const locked = [];
    for (const tyreId of tyreIds) {
      locked.push({ tyreId, tyre: await lockTyre(tx, tyreId) });
    }
    const tyreParts = await listActiveTyreParts(tx);
    const failures: string[] = [];
    const toPost: ReturnType<typeof receiveTyreFromDagSchema.parse>[] = [];
    let storeId: string | null = null;

    for (const { tyreId, tyre } of locked) {
      const label = tyre?.serialNumber ?? tyreId;
      const idempotencyKey = dagDocumentIdempotencyKey(
        "DAG_IN",
        command.batchKey,
        tyreId,
      );
      const existing = await existingStockByIdempotency(
        tx,
        actor.id,
        idempotencyKey,
      );
      if (existing) {
        if (tyre?.status === "IN_STORE") continue;
        failures.push(`${label} — previous DAG IN is incomplete`);
        continue;
      }
      if (!tyre) {
        failures.push(`${tyreId} — tyre not found`);
        continue;
      }
      if (tyre.status !== "AT_DAG" || !tyre.storeId) {
        failures.push(
          tyre.status === "IN_STORE"
            ? `${label} — already received`
            : `${label} — is not at DAG`,
        );
        continue;
      }
      try {
        await requireStoreAccess(actor, tyre.storeId);
      } catch {
        failures.push(`${label} — belongs to another store`);
        continue;
      }
      if (storeId && storeId !== tyre.storeId) {
        failures.push(`${label} — belongs to another store`);
        continue;
      }
      storeId = tyre.storeId;

      let toStage: TyreLifecycleStage;
      try {
        toStage = nextDagStage(tyre.lifecycleStage as TyreLifecycleStage);
      } catch (error) {
        failures.push(
          `${label} — ${error instanceof Error ? error.message : "cannot receive"}`,
        );
        continue;
      }

      const [sendEvent] = await tx
        .select({ stockDocumentId: tyreEvents.stockDocumentId })
        .from(tyreEvents)
        .where(
          and(eq(tyreEvents.tyreId, tyre.id), eq(tyreEvents.type, "SEND_DAG")),
        )
        .orderBy(desc(tyreEvents.sequence))
        .limit(1);
      if (!sendEvent?.stockDocumentId) {
        failures.push(`${label} — original DAG send document not found`);
        continue;
      }
      const [sendDoc] = await tx
        .select({
          id: stockDocuments.id,
          type: stockDocuments.type,
        })
        .from(stockDocuments)
        .where(eq(stockDocuments.id, sendEvent.stockDocumentId))
        .limit(1);
      if (!sendDoc || sendDoc.type !== "TYRE_DAG_SEND") {
        failures.push(`${label} — original DAG send document is invalid`);
        continue;
      }
      const [existingReceive] = await tx
        .select({ id: stockDocuments.id })
        .from(stockDocuments)
        .where(eq(stockDocuments.linkedDocumentId, sendDoc.id))
        .limit(1);
      if (existingReceive) {
        failures.push(`${label} — already received`);
        continue;
      }

      const resolved = resolveReturnPart(tyreParts, toStage, label);
      if (resolved.error || !resolved.partId) {
        failures.push(resolved.error ?? `${label} — no return SKU`);
        continue;
      }

      toPost.push({
        tyreId: tyre.id,
        targetPartId: resolved.partId,
        businessDate: command.businessDate,
        notes: command.notes,
        idempotencyKey,
      });
    }

    if (failures.length > 0) throw dagBatchError("receive", failures);

    const results = [];
    for (const item of toPost) {
      results.push(await receiveTyreFromDagInTx(tx, actor, item));
    }
    return results;
  });
}

export async function rejectTyreAtDag(actor: Actor, input: unknown) {
  assertPermission(actor, "dag.reject");
  const command = rejectTyreAtDagSchema.parse(input);

  return runTyreTransaction(async (tx) => {
    const tyre = await lockTyre(tx, command.tyreId);
    if (!tyre) throw new WorkshopError("Tyre not found");
    if (tyre.status !== "AT_DAG") {
      throw new WorkshopError(
        "Tyre must be at DAG to record a supplier reject",
      );
    }

    const [sendEvent] = await tx
      .select({
        stockDocumentId: tyreEvents.stockDocumentId,
      })
      .from(tyreEvents)
      .where(
        and(eq(tyreEvents.tyreId, tyre.id), eq(tyreEvents.type, "SEND_DAG")),
      )
      .orderBy(desc(tyreEvents.sequence))
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
  assertPermission(actor, "tyres.manage");
  const command = disposeTyreSchema.parse(input);

  return runTyreTransaction(async (tx) => {
    const tyre = await lockTyre(tx, command.tyreId);
    if (!tyre) throw new WorkshopError("Tyre not found");
    if (!isOperableInStore(tyre.status) || !tyre.storeId) {
      throw new WorkshopError("Tyre must be in store stock to dispose");
    }
    await requireStoreAccess(actor, tyre.storeId);
    await assertNotReserved(tx, tyre.id);
    const events = await loadTyreLifecycleEvents(tx, tyre.id);
    if (!actionsFor(tyre, events).canDispose) {
      throw new WorkshopConflictError(LIFECYCLE_CONFLICT);
    }

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
