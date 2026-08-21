import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "~/db/client.server";
import {
  auditEvents,
  buses,
  inventoryBalances,
  localPurchases,
  partCategories,
  parts,
  stockDocumentLines,
  stockDocuments,
  stockMovements,
  storePartSettings,
  stores,
  suppliers,
  tyreEvents,
  tyres,
  users,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";
import { lowStockCondition } from "~/features/inventory/low-stock";
import {
  UNUSUAL_ISSUE_THRESHOLD,
  UNUSUAL_ISSUE_WINDOW_DAYS,
} from "~/features/workshop/constants";

const REPORT_LIMIT = 250;

export async function getTransactionOptions(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return Promise.all([
    db
      .select()
      .from(stores)
      .where(and(eq(stores.active, true), scopedStoreCondition(stores.id, ids)))
      .orderBy(asc(stores.code)),
    db
      .select({
        id: parts.id,
        sku: parts.sku,
        name: parts.name,
        barcode: parts.barcode,
        categoryId: parts.categoryId,
        categoryName: partCategories.name,
        categoryCode: partCategories.code,
      })
      .from(parts)
      .leftJoin(partCategories, eq(parts.categoryId, partCategories.id))
      .where(eq(parts.active, true))
      .orderBy(asc(parts.sku)),
    db
      .select()
      .from(buses)
      .where(eq(buses.active, true))
      .orderBy(asc(buses.fleetNumber)),
    db
      .select()
      .from(suppliers)
      .where(eq(suppliers.active, true))
      .orderBy(asc(suppliers.name)),
  ]).then(([storeRows, partRows, busRows, supplierRows]) => ({
    stores: storeRows,
    parts: partRows,
    buses: busRows,
    suppliers: supplierRows,
  }));
}

export async function getScanCatalog(actor: Actor) {
  const [catalog, balances] = await Promise.all([
    db
      .select({
        id: parts.id,
        sku: parts.sku,
        name: parts.name,
        barcode: parts.barcode,
      })
      .from(parts)
      .where(eq(parts.active, true))
      .orderBy(asc(parts.sku)),
    getBalances(actor),
  ]);
  return { catalog, balances };
}

export async function getBalances(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      storeId: stores.id,
      store: stores.name,
      storeCode: stores.code,
      partId: parts.id,
      sku: parts.sku,
      barcode: parts.barcode,
      part: parts.name,
      unit: parts.unit,
      onHand: sql<string>`COALESCE(${inventoryBalances.onHand}, 0)`,
      reorderLevel: storePartSettings.reorderLevel,
    })
    .from(parts)
    .innerJoin(
      stores,
      and(eq(stores.active, true), scopedStoreCondition(stores.id, ids)),
    )
    .leftJoin(
      inventoryBalances,
      and(
        eq(inventoryBalances.storeId, stores.id),
        eq(inventoryBalances.partId, parts.id),
      ),
    )
    .leftJoin(
      storePartSettings,
      and(
        eq(storePartSettings.storeId, stores.id),
        eq(storePartSettings.partId, parts.id),
      ),
    )
    .where(
      and(
        eq(parts.active, true),
        or(
          isNotNull(inventoryBalances.onHand),
          isNotNull(storePartSettings.partId),
        ),
      ),
    )
    .orderBy(asc(stores.code), asc(parts.sku));
}

export async function getLowStock(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      storeId: stores.id,
      store: stores.name,
      storeCode: stores.code,
      partId: parts.id,
      sku: parts.sku,
      part: parts.name,
      onHand: sql<string>`COALESCE(${inventoryBalances.onHand}, 0)`,
      reorderLevel: storePartSettings.reorderLevel,
    })
    .from(storePartSettings)
    .innerJoin(stores, eq(storePartSettings.storeId, stores.id))
    .innerJoin(parts, eq(storePartSettings.partId, parts.id))
    .leftJoin(
      inventoryBalances,
      and(
        eq(storePartSettings.storeId, inventoryBalances.storeId),
        eq(storePartSettings.partId, inventoryBalances.partId),
      ),
    )
    .where(
      and(
        scopedStoreCondition(storePartSettings.storeId, ids),
        lowStockCondition,
      ),
    )
    .orderBy(asc(stores.code), asc(parts.sku));
}

export async function getMovements(
  actor: Actor,
  filters?: { documentNumber?: string; purchaseNumber?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);
  let documentNumber = filters?.documentNumber?.trim() || undefined;
  if (!documentNumber && filters?.purchaseNumber) {
    const [purchase] = await db
      .select({ number: stockDocuments.documentNumber })
      .from(localPurchases)
      .innerJoin(
        stockDocuments,
        eq(localPurchases.receiptDocumentId, stockDocuments.id),
      )
      .where(eq(localPurchases.purchaseNumber, filters.purchaseNumber))
      .limit(1);
    documentNumber = purchase?.number;
  }

  const rows = await db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      type: stockDocuments.type,
      date: stockDocuments.businessDate,
      store: stores.name,
      sku: parts.sku,
      part: parts.name,
      delta: stockMovements.quantityDelta,
      balance: stockMovements.balanceAfter,
    })
    .from(stockMovements)
    .innerJoin(stockDocuments, eq(stockMovements.documentId, stockDocuments.id))
    .innerJoin(stores, eq(stockMovements.storeId, stores.id))
    .innerJoin(parts, eq(stockMovements.partId, parts.id))
    .where(
      and(
        scopedStoreCondition(stockMovements.storeId, ids),
        documentNumber
          ? eq(stockDocuments.documentNumber, documentNumber)
          : undefined,
      ),
    )
    .orderBy(desc(stockMovements.occurredAt))
    .limit(REPORT_LIMIT + 1);
  return {
    rows: rows.slice(0, REPORT_LIMIT),
    truncated: rows.length > REPORT_LIMIT,
    focus: documentNumber ?? null,
  };
}

export async function getBusUsage(
  actor: Actor,
  filters?: { start?: string; end?: string; bus?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);

  const conditions = [
    eq(stockDocuments.type, "BUS_ISSUE"),
    eq(stockDocuments.status, "POSTED"),
    scopedStoreCondition(stockDocuments.storeId, ids),
  ];

  if (filters?.start)
    conditions.push(sql`${stockDocuments.businessDate} >= ${filters.start}`);
  if (filters?.end)
    conditions.push(sql`${stockDocuments.businessDate} <= ${filters.end}`);
  if (filters?.bus) conditions.push(eq(buses.fleetNumber, filters.bus));

  const rows = await db
    .select({
      id: stockDocuments.id,
      date: stockDocuments.businessDate,
      number: stockDocuments.documentNumber,
      store: stores.name,
      fleetNumber: buses.fleetNumber,
      registration: buses.registrationNumber,
      sku: parts.sku,
      part: parts.name,
      quantity: stockDocumentLines.quantity,
    })
    .from(stockDocumentLines)
    .innerJoin(
      stockDocuments,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .innerJoin(buses, eq(stockDocuments.busId, buses.id))
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .where(and(...conditions))
    .orderBy(desc(stockDocuments.businessDate))
    .limit(REPORT_LIMIT + 1);
  return {
    rows: rows.slice(0, REPORT_LIMIT),
    truncated: rows.length > REPORT_LIMIT,
  };
}

export async function getLocalPurchases(
  actor: Actor,
  filters?: { start?: string; end?: string; supplier?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);

  const conditions = [scopedStoreCondition(localPurchases.storeId, ids)];

  if (filters?.start)
    conditions.push(sql`${localPurchases.businessDate} >= ${filters.start}`);
  if (filters?.end)
    conditions.push(sql`${localPurchases.businessDate} <= ${filters.end}`);
  if (filters?.supplier)
    conditions.push(eq(localPurchases.supplierNameSnapshot, filters.supplier));

  const rows = await db
    .select({
      id: localPurchases.id,
      number: localPurchases.purchaseNumber,
      receiptDocumentId: localPurchases.receiptDocumentId,
      date: localPurchases.businessDate,
      store: stores.name,
      supplier: localPurchases.supplierNameSnapshot,
      total: localPurchases.total,
      status: localPurchases.status,
    })
    .from(localPurchases)
    .innerJoin(stores, eq(localPurchases.storeId, stores.id))
    .where(and(...conditions))
    .orderBy(desc(localPurchases.businessDate), desc(localPurchases.createdAt))
    .limit(REPORT_LIMIT + 1);
  return {
    rows: rows.slice(0, REPORT_LIMIT),
    truncated: rows.length > REPORT_LIMIT,
  };
}

export async function getPostedDocumentsForReversal(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      type: stockDocuments.type,
      date: stockDocuments.businessDate,
      store: stores.name,
    })
    .from(stockDocuments)
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .where(
      and(
        eq(stockDocuments.status, "POSTED"),
        sql`${stockDocuments.type} <> 'REVERSAL'`,
        scopedStoreCondition(stockDocuments.storeId, ids),
        sql`NOT EXISTS (
          SELECT 1 FROM stock_documents rev
          WHERE rev.reverses_document_id = ${stockDocuments.id}
        )`,
      ),
    )
    .orderBy(desc(stockDocuments.postedAt))
    .limit(100);
}

export async function getDocumentForReceipt(actor: Actor, id: string) {
  const ids = await getAuthorizedStoreIds(actor);
  const [doc] = await db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      type: stockDocuments.type,
      date: stockDocuments.businessDate,
      store: stores.name,
      storeCode: stores.code,
      bus: buses.fleetNumber,
      postedAt: stockDocuments.postedAt,
      reason: stockDocuments.reason,
      status: stockDocuments.status,
      lastApprovalError: stockDocuments.lastApprovalError,
      lastApprovalAttemptedAt: stockDocuments.lastApprovalAttemptedAt,
      createdBy: stockDocuments.createdBy,
    })
    .from(stockDocuments)
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .leftJoin(buses, eq(stockDocuments.busId, buses.id))
    .where(
      and(
        eq(stockDocuments.id, id),
        ids === null
          ? undefined
          : ids.length === 0
            ? sql`false`
            : or(
                inArray(stockDocuments.storeId, ids),
                inArray(stockDocuments.destinationStoreId, ids),
              ),
      ),
    );

  if (!doc) return null;

  const lines = await db
    .select({
      sku: parts.sku,
      name: parts.name,
      quantity: stockDocumentLines.quantity,
      unit: parts.unit,
      unitCost: stockDocumentLines.unitCost,
    })
    .from(stockDocumentLines)
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .where(eq(stockDocumentLines.documentId, id));

  return { ...doc, lines };
}

export async function getDailyMovements(actor: Actor, date: string) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      type: stockDocuments.type,
      store: stores.name,
      sku: parts.sku,
      part: parts.name,
      delta: stockMovements.quantityDelta,
      balance: stockMovements.balanceAfter,
    })
    .from(stockMovements)
    .innerJoin(stockDocuments, eq(stockMovements.documentId, stockDocuments.id))
    .innerJoin(stores, eq(stockMovements.storeId, stores.id))
    .innerJoin(parts, eq(stockMovements.partId, parts.id))
    .where(
      and(
        eq(stockDocuments.businessDate, date),
        scopedStoreCondition(stockMovements.storeId, ids),
      ),
    )
    .orderBy(desc(stockMovements.occurredAt));
}

export async function getFastMovingParts(
  actor: Actor,
  startDate: string,
  endDate: string,
) {
  const ids = await getAuthorizedStoreIds(actor);

  const results = await db
    .select({
      partId: parts.id,
      sku: parts.sku,
      part: parts.name,
      totalIssued: sql<string>`SUM(${stockMovements.quantityDelta} * -1)`,
    })
    .from(stockMovements)
    .innerJoin(stockDocuments, eq(stockMovements.documentId, stockDocuments.id))
    .innerJoin(parts, eq(stockMovements.partId, parts.id))
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "POSTED"),
        lt(stockMovements.quantityDelta, "0"),
        sql`${stockDocuments.businessDate} >= ${startDate}`,
        sql`${stockDocuments.businessDate} <= ${endDate}`,
        scopedStoreCondition(stockMovements.storeId, ids),
      ),
    )
    .groupBy(parts.id, parts.sku, parts.name)
    .orderBy(desc(sql`SUM(${stockMovements.quantityDelta} * -1)`))
    .limit(50);

  return results;
}

export async function getAuditEvents() {
  return db
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      eventType: auditEvents.eventType,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      outcome: auditEvents.outcome,
      actor: users.displayName,
      store: stores.name,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id))
    .leftJoin(stores, eq(auditEvents.storeId, stores.id))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(REPORT_LIMIT);
}

export async function getPendingIssues(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      date: stockDocuments.businessDate,
      store: stores.name,
      storeCode: stores.code,
      fleetNumber: buses.fleetNumber,
      createdBy: users.displayName,
      lastApprovalError: stockDocuments.lastApprovalError,
      lastApprovalAttemptedAt: stockDocuments.lastApprovalAttemptedAt,
      sku: parts.sku,
      part: parts.name,
      quantity: stockDocumentLines.quantity,
    })
    .from(stockDocuments)
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .innerJoin(users, eq(stockDocuments.createdBy, users.id))
    .leftJoin(buses, eq(stockDocuments.busId, buses.id))
    .innerJoin(
      stockDocumentLines,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
        scopedStoreCondition(stockDocuments.storeId, ids),
      ),
    )
    .orderBy(desc(stockDocuments.createdAt));
}

export async function countPendingApprovals(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const [row] = await db
    .select({
      count: sql<number>`count(distinct ${stockDocuments.id})::int`,
    })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
        scopedStoreCondition(stockDocuments.storeId, ids),
      ),
    );
  return Number(row?.count ?? 0);
}

export async function getItemUsage(
  actor: Actor,
  filters?: { start?: string; end?: string; storeId?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
    .select({
      partId: parts.id,
      sku: parts.sku,
      part: parts.name,
      unit: parts.unit,
      store: stores.name,
      issued: sql<string>`SUM(${stockDocumentLines.quantity})`,
    })
    .from(stockDocumentLines)
    .innerJoin(
      stockDocuments,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "POSTED"),
        scopedStoreCondition(stockDocuments.storeId, ids),
        filters?.start
          ? sql`${stockDocuments.businessDate} >= ${filters.start}`
          : undefined,
        filters?.end
          ? sql`${stockDocuments.businessDate} <= ${filters.end}`
          : undefined,
        filters?.storeId
          ? eq(stockDocuments.storeId, filters.storeId)
          : undefined,
      ),
    )
    .groupBy(parts.id, parts.sku, parts.name, parts.unit, stores.name)
    .orderBy(desc(sql`SUM(${stockDocumentLines.quantity})`))
    .limit(REPORT_LIMIT + 1);
  return {
    rows: rows.slice(0, REPORT_LIMIT),
    truncated: rows.length > REPORT_LIMIT,
  };
}

export async function getDailyIssues(actor: Actor, date: string) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      store: stores.name,
      fleetNumber: buses.fleetNumber,
      sku: parts.sku,
      part: parts.name,
      quantity: stockDocumentLines.quantity,
    })
    .from(stockDocumentLines)
    .innerJoin(
      stockDocuments,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .leftJoin(buses, eq(stockDocuments.busId, buses.id))
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "POSTED"),
        eq(stockDocuments.businessDate, date),
        scopedStoreCondition(stockDocuments.storeId, ids),
      ),
    )
    .orderBy(asc(stores.name), asc(parts.sku));
}

export async function getUnusualIssues(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const since = new Date();
  since.setDate(since.getDate() - UNUSUAL_ISSUE_WINDOW_DAYS);
  const sinceDate = since.toISOString().slice(0, 10);

  return db
    .select({
      partId: parts.id,
      sku: parts.sku,
      part: parts.name,
      busId: buses.id,
      fleetNumber: buses.fleetNumber,
      issueCount: sql<number>`count(${stockDocuments.id})::int`,
    })
    .from(stockDocuments)
    .innerJoin(
      stockDocumentLines,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .innerJoin(buses, eq(stockDocuments.busId, buses.id))
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        inArray(stockDocuments.status, ["POSTED", "PENDING_APPROVAL"]),
        sql`${stockDocuments.businessDate} >= ${sinceDate}`,
        scopedStoreCondition(stockDocuments.storeId, ids),
      ),
    )
    .groupBy(parts.id, parts.sku, parts.name, buses.id, buses.fleetNumber)
    .having(sql`count(${stockDocuments.id}) >= ${UNUSUAL_ISSUE_THRESHOLD}`)
    .orderBy(desc(sql`count(${stockDocuments.id})`));
}

export async function getRepetitiveIssueCounts(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const since = new Date();
  since.setDate(since.getDate() - UNUSUAL_ISSUE_WINDOW_DAYS);
  const sinceDate = since.toISOString().slice(0, 10);

  return db
    .select({
      partId: stockDocumentLines.partId,
      busId: stockDocuments.busId,
      issueCount: sql<number>`count(${stockDocuments.id})::int`,
    })
    .from(stockDocuments)
    .innerJoin(
      stockDocumentLines,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        inArray(stockDocuments.status, ["POSTED", "PENDING_APPROVAL"]),
        sql`${stockDocuments.businessDate} >= ${sinceDate}`,
        scopedStoreCondition(stockDocuments.storeId, ids),
      ),
    )
    .groupBy(stockDocumentLines.partId, stockDocuments.busId);
}

export async function getTransfers(
  actor: Actor,
  filters?: { start?: string; end?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);
  const destStores = alias(stores, "dest_stores");
  const rows = await db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      type: stockDocuments.type,
      status: stockDocuments.status,
      date: stockDocuments.businessDate,
      source: stores.name,
      destination: destStores.name,
      linkedDocumentId: stockDocuments.linkedDocumentId,
      sku: parts.sku,
      part: parts.name,
      quantity: stockDocumentLines.quantity,
    })
    .from(stockDocuments)
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .leftJoin(destStores, eq(stockDocuments.destinationStoreId, destStores.id))
    .innerJoin(
      stockDocumentLines,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .where(
      and(
        inArray(stockDocuments.type, ["TRANSFER_OUT", "TRANSFER_IN"]),
        eq(stockDocuments.status, "POSTED"),
        ids === null
          ? undefined
          : ids.length === 0
            ? sql`false`
            : or(
                inArray(stockDocuments.storeId, ids),
                inArray(stockDocuments.destinationStoreId, ids),
              ),
        filters?.start
          ? sql`${stockDocuments.businessDate} >= ${filters.start}`
          : undefined,
        filters?.end
          ? sql`${stockDocuments.businessDate} <= ${filters.end}`
          : undefined,
      ),
    )
    .orderBy(desc(stockDocuments.businessDate), desc(stockDocuments.postedAt))
    .limit(REPORT_LIMIT + 1);
  return {
    rows: rows.slice(0, REPORT_LIMIT),
    truncated: rows.length > REPORT_LIMIT,
  };
}

export async function getInTransitTransfers(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const destStores = alias(stores, "dest_stores");
  const outgoing = await db
    .select({
      id: stockDocuments.id,
      number: stockDocuments.documentNumber,
      date: stockDocuments.businessDate,
      sourceId: stockDocuments.storeId,
      source: stores.name,
      sourceCode: stores.code,
      destinationId: stockDocuments.destinationStoreId,
      destination: destStores.name,
      destinationCode: destStores.code,
    })
    .from(stockDocuments)
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .leftJoin(destStores, eq(stockDocuments.destinationStoreId, destStores.id))
    .where(
      and(
        eq(stockDocuments.type, "TRANSFER_OUT"),
        eq(stockDocuments.status, "POSTED"),
        sql`NOT EXISTS (
          SELECT 1 FROM stock_documents incoming
          WHERE incoming.linked_document_id = ${stockDocuments.id}
        )`,
        ids === null
          ? undefined
          : ids.length === 0
            ? sql`false`
            : or(
                inArray(stockDocuments.storeId, ids),
                inArray(stockDocuments.destinationStoreId, ids),
              ),
      ),
    )
    .orderBy(desc(stockDocuments.postedAt));

  const serials =
    outgoing.length === 0
      ? []
      : await db
          .select({
            documentId: tyreEvents.stockDocumentId,
            serialNumber: tyres.serialNumber,
            sku: parts.sku,
          })
          .from(tyreEvents)
          .innerJoin(tyres, eq(tyreEvents.tyreId, tyres.id))
          .innerJoin(parts, eq(tyres.partId, parts.id))
          .where(
            and(
              eq(tyreEvents.type, "TRANSFER_OUT"),
              inArray(
                tyreEvents.stockDocumentId,
                outgoing.map((row) => row.id),
              ),
            ),
          );

  const serialsByDoc = new Map<string, typeof serials>();
  for (const serial of serials) {
    if (!serial.documentId) continue;
    const list = serialsByDoc.get(serial.documentId) ?? [];
    list.push(serial);
    serialsByDoc.set(serial.documentId, list);
  }

  return outgoing.map((row) => ({
    ...row,
    serials: serialsByDoc.get(row.id) ?? [],
    canReceive:
      ids === null ||
      (row.destinationId != null && ids.includes(row.destinationId)),
  }));
}
