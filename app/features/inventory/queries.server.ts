import {
  and,
  asc,
  desc,
  eq,
  inArray,
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
  jobCards,
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
  requireStoreAccess,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";
import { lowStockCondition } from "~/features/inventory/low-stock";
import {
  UNUSUAL_ISSUE_THRESHOLD,
  UNUSUAL_ISSUE_WINDOW_DAYS,
} from "~/features/workshop/constants";

const REPORT_LIMIT = 250;
import {
  readCachedApprovalCount,
  writeCachedApprovalCount,
} from "./approval-count-cache.server";

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

export async function getBalances(
  actor: Actor,
  options?: { storeId?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);

  if (options?.storeId) {
    await requireStoreAccess(actor, options.storeId);
  }

  let storeFilter = sql`true`;
  if (options?.storeId) {
    storeFilter = sql`s.id = ${options.storeId}`;
  } else if (ids !== null) {
    if (ids.length === 0) return [];
    storeFilter = sql`s.id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})`;
  }

  const result = await db.execute<{
    store_id: string;
    store: string;
    store_code: string;
    part_id: string;
    sku: string;
    barcode: string | null;
    part: string;
    unit: string;
    on_hand: string;
    reorder_level: string | null;
  }>(sql`
    SELECT
      s.id AS store_id,
      s.name AS store,
      s.code AS store_code,
      p.id AS part_id,
      p.sku,
      p.barcode,
      p.name AS part,
      p.unit,
      COALESCE(b.on_hand, 0)::text AS on_hand,
      sps.reorder_level::text AS reorder_level
    FROM (
      SELECT store_id, part_id FROM inventory_balances
      UNION
      SELECT store_id, part_id FROM store_part_settings
    ) sp
    INNER JOIN parts p ON p.id = sp.part_id AND p.active = true
    INNER JOIN stores s ON s.id = sp.store_id AND s.active = true
    LEFT JOIN inventory_balances b
      ON b.store_id = sp.store_id AND b.part_id = sp.part_id
    LEFT JOIN store_part_settings sps
      ON sps.store_id = sp.store_id AND sps.part_id = sp.part_id
    WHERE ${storeFilter}
    ORDER BY s.code, p.sku
  `);

  return result.rows.map((row) => ({
    storeId: row.store_id,
    store: row.store,
    storeCode: row.store_code,
    partId: row.part_id,
    sku: row.sku,
    barcode: row.barcode,
    part: row.part,
    unit: row.unit,
    onHand: row.on_hand,
    reorderLevel: row.reorder_level,
  }));
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
  filters?: {
    documentNumber?: string;
    purchaseNumber?: string;
    start?: string;
    end?: string;
  },
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
        filters?.start
          ? sql`${stockDocuments.businessDate} >= ${filters.start}`
          : undefined,
        filters?.end
          ? sql`${stockDocuments.businessDate} <= ${filters.end}`
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
      storeId: stockDocuments.storeId,
      fleetNumber: buses.fleetNumber,
      jobCardId: stockDocuments.jobCardId,
      jobNumber: jobCards.jobNumber,
      createdBy: users.displayName,
      lastApprovalError: stockDocuments.lastApprovalError,
      lastApprovalAttemptedAt: stockDocuments.lastApprovalAttemptedAt,
      partId: parts.id,
      sku: parts.sku,
      part: parts.name,
      quantity: stockDocumentLines.quantity,
      onHand: sql<string>`coalesce(${inventoryBalances.onHand}, 0)`,
    })
    .from(stockDocuments)
    .innerJoin(stores, eq(stockDocuments.storeId, stores.id))
    .innerJoin(users, eq(stockDocuments.createdBy, users.id))
    .leftJoin(buses, eq(stockDocuments.busId, buses.id))
    .leftJoin(jobCards, eq(stockDocuments.jobCardId, jobCards.id))
    .innerJoin(
      stockDocumentLines,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .leftJoin(
      inventoryBalances,
      and(
        eq(inventoryBalances.storeId, stockDocuments.storeId),
        eq(inventoryBalances.partId, stockDocumentLines.partId),
      ),
    )
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
  const cacheKey = `${actor.id}:${ids?.join(",") ?? "all"}`;
  const cached = readCachedApprovalCount(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const [issueRow] = await db
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

  const { countPendingJobCards } =
    await import("~/features/workshop/queries.server");
  const jobCardCount = await countPendingJobCards(actor);
  const value = Number(issueRow?.count ?? 0) + jobCardCount;
  writeCachedApprovalCount(cacheKey, value);
  return value;
}

export async function getReturnableJobCardItems(
  actor: Actor,
  jobCardId: string,
) {
  const ids = await getAuthorizedStoreIds(actor);
  const [card] = await db
    .select({ id: jobCards.id, storeId: jobCards.storeId })
    .from(jobCards)
    .where(
      and(eq(jobCards.id, jobCardId), scopedStoreCondition(jobCards.storeId, ids)),
    )
    .limit(1);
  if (!card) return [];

  const rows = await db
    .select({
      partId: stockDocumentLines.partId,
      sku: parts.sku,
      name: parts.name,
      unit: parts.unit,
      issued: sql<string>`coalesce(sum(case when ${stockDocuments.type} = 'BUS_ISSUE' then ${stockDocumentLines.quantity}::numeric else 0 end), 0)`,
      returned: sql<string>`coalesce(sum(case when ${stockDocuments.type} = 'BUS_RETURN' then ${stockDocumentLines.quantity}::numeric else 0 end), 0)`,
    })
    .from(stockDocumentLines)
    .innerJoin(
      stockDocuments,
      eq(stockDocumentLines.documentId, stockDocuments.id),
    )
    .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
    .where(
      and(
        eq(stockDocuments.jobCardId, jobCardId),
        eq(stockDocuments.status, "POSTED"),
        inArray(stockDocuments.type, ["BUS_ISSUE", "BUS_RETURN"]),
      ),
    )
    .groupBy(stockDocumentLines.partId, parts.sku, parts.name, parts.unit);

  return rows
    .map((row) => {
      const issued = Number(row.issued);
      const returned = Number(row.returned);
      const available = issued - returned;
      return {
        partId: row.partId,
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        issued: issued.toFixed(3),
        returned: returned.toFixed(3),
        available: available.toFixed(3),
      };
    })
    .filter((row) => Number(row.available) > 0)
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

export async function getReturnableItemsByJobCard(
  actor: Actor,
  jobCardIds: string[],
) {
  const result: Record<
    string,
    Awaited<ReturnType<typeof getReturnableJobCardItems>>
  > = {};
  await Promise.all(
    jobCardIds.map(async (id) => {
      result[id] = await getReturnableJobCardItems(actor, id);
    }),
  );
  return result;
}

export async function getItemUsage(
  actor: Actor,
  filters?: {
    start?: string;
    end?: string;
    storeId?: string;
    partId?: string;
  },
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
        filters?.partId ? eq(parts.id, filters.partId) : undefined,
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
