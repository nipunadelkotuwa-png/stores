import { and, asc, count, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "~/db/client.server";
import {
  buses,
  inventoryBalances,
  parts,
  stockDocumentLines,
  stockDocuments,
  storePartSettings,
  stores,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";
import { lowStockCondition } from "~/features/inventory/low-stock";
import { periodBounds, type PeriodDays } from "~/features/dashboard/period";

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

type DashboardOptions = {
  periodDays?: PeriodDays;
};

function documentStoreFilter(
  storeIds: string[] | null,
  column = sql`store_id`,
) {
  if (storeIds === null) return sql`true`;
  if (storeIds.length === 0) return sql`false`;
  return sql`${column} IN (${sql.join(
    storeIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}

export async function getDashboard(
  actor: Actor,
  options: DashboardOptions = {},
) {
  const storeIds = await getAuthorizedStoreIds(actor);
  const storeScope = scopedStoreCondition(stores.id, storeIds);
  const documentScope = scopedStoreCondition(stockDocuments.storeId, storeIds);
  const balanceScope = scopedStoreCondition(
    inventoryBalances.storeId,
    storeIds,
  );

  const bounds = periodBounds(options.periodDays ?? 30);

  const [
    [storeTotal],
    [partTotal],
    [busTotal],
    [periodTransactionTotal],
    [previousTransactionTotal],
    [partsAddedInPeriod],
    [partsBeforePeriod],
    [busesAddedInPeriod],
    [busesBeforePeriod],
    [storesAddedInPeriod],
    [totalItemsRow],
    totalValueRow,
    periodIssuedRow,
    [periodStockInRow],
    [lowStockCountRow],
    lowStockThresholds,
    recentTransactions,
    trendData,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(stores)
      .where(and(eq(stores.active, true), storeScope)),
    db.select({ value: count() }).from(parts).where(eq(parts.active, true)),
    db.select({ value: count() }).from(buses).where(eq(buses.active, true)),
    db
      .select({ value: count() })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.status, "POSTED"),
          gte(stockDocuments.businessDate, bounds.periodStart),
          lte(stockDocuments.businessDate, bounds.periodEnd),
          documentScope,
        ),
      ),
    db
      .select({ value: count() })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.status, "POSTED"),
          gte(stockDocuments.businessDate, bounds.previousStart),
          lt(stockDocuments.businessDate, bounds.periodStart),
          documentScope,
        ),
      ),
    db
      .select({ value: count() })
      .from(parts)
      .where(
        and(
          eq(parts.active, true),
          gte(parts.createdAt, sql`${bounds.periodStart}::timestamptz`),
        ),
      ),
    db
      .select({ value: count() })
      .from(parts)
      .where(
        and(
          eq(parts.active, true),
          lt(parts.createdAt, sql`${bounds.periodStart}::timestamptz`),
        ),
      ),
    db
      .select({ value: count() })
      .from(buses)
      .where(
        and(
          eq(buses.active, true),
          gte(buses.createdAt, sql`${bounds.periodStart}::timestamptz`),
        ),
      ),
    db
      .select({ value: count() })
      .from(buses)
      .where(
        and(
          eq(buses.active, true),
          lt(buses.createdAt, sql`${bounds.periodStart}::timestamptz`),
        ),
      ),
    db
      .select({ value: count() })
      .from(stores)
      .where(
        and(
          eq(stores.active, true),
          gte(stores.createdAt, sql`${bounds.periodStart}::timestamptz`),
          storeScope,
        ),
      ),
    db
      .select({
        value: sql<string>`COALESCE(SUM(${inventoryBalances.onHand}), 0)`,
      })
      .from(inventoryBalances)
      .where(balanceScope),
    db
      .execute<{ value: string }>(
        sql`
      WITH last_receipt_cost AS (
        SELECT DISTINCT ON (sdl.part_id, sd.store_id)
          sdl.part_id,
          sd.store_id,
          sdl.unit_cost
        FROM stock_document_lines sdl
        INNER JOIN stock_documents sd ON sd.id = sdl.document_id
        WHERE sd.status = 'POSTED'
          AND sd.type = 'STOCK_RECEIPT'
          AND sdl.unit_cost IS NOT NULL
        ORDER BY sdl.part_id, sd.store_id, sd.posted_at DESC NULLS LAST
      )
      SELECT COALESCE(SUM(
        b.on_hand * COALESCE(lrc.unit_cost, 0)
      ), 0)::text AS value
      FROM inventory_balances b
      LEFT JOIN last_receipt_cost lrc
        ON lrc.part_id = b.part_id AND lrc.store_id = b.store_id
      WHERE ${documentStoreFilter(storeIds, sql`b.store_id`)}
    `,
      )
      .then((result) => result.rows[0] ?? { value: "0" }),
    db
      .execute<{ value: string }>(
        sql`
      WITH last_receipt_cost AS (
        SELECT DISTINCT ON (sdl.part_id, sd.store_id)
          sdl.part_id,
          sd.store_id,
          sdl.unit_cost
        FROM stock_document_lines sdl
        INNER JOIN stock_documents sd ON sd.id = sdl.document_id
        WHERE sd.status = 'POSTED'
          AND sd.type = 'STOCK_RECEIPT'
          AND sdl.unit_cost IS NOT NULL
        ORDER BY sdl.part_id, sd.store_id, sd.posted_at DESC NULLS LAST
      )
      SELECT COALESCE(SUM(
        sdl.quantity * COALESCE(sdl.unit_cost, lrc.unit_cost, 0)
      ), 0)::text AS value
      FROM stock_document_lines sdl
      INNER JOIN stock_documents sd ON sd.id = sdl.document_id
      LEFT JOIN last_receipt_cost lrc
        ON lrc.part_id = sdl.part_id AND lrc.store_id = sd.store_id
      WHERE sd.status = 'POSTED'
        AND sd.type = 'BUS_ISSUE'
        AND sd.business_date >= ${bounds.periodStart}
        AND sd.business_date <= ${bounds.periodEnd}
        AND ${documentStoreFilter(storeIds, sql`sd.store_id`)}
    `,
      )
      .then((result) => result.rows[0] ?? { value: "0" }),
    db
      .select({
        value: sql<string>`COALESCE(SUM(
          ${stockDocumentLines.quantity} * COALESCE(${stockDocumentLines.unitCost}, 0)
        ), 0)`,
      })
      .from(stockDocumentLines)
      .innerJoin(
        stockDocuments,
        eq(stockDocumentLines.documentId, stockDocuments.id),
      )
      .where(
        and(
          eq(stockDocuments.status, "POSTED"),
          eq(stockDocuments.type, "STOCK_RECEIPT"),
          gte(stockDocuments.businessDate, bounds.periodStart),
          lte(stockDocuments.businessDate, bounds.periodEnd),
          documentScope,
        ),
      ),
    db
      .select({
        value: count(),
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
          scopedStoreCondition(storePartSettings.storeId, storeIds),
          lowStockCondition,
        ),
      ),
    db
      .select({
        storeId: stores.id,
        store: stores.name,
        partId: parts.id,
        part: parts.name,
        sku: parts.sku,
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
          scopedStoreCondition(storePartSettings.storeId, storeIds),
          lowStockCondition,
        ),
      )
      .orderBy(asc(stores.name), asc(parts.sku))
      .limit(8),
    db
      .select({
        id: stockDocuments.id,
        number: stockDocuments.documentNumber,
        type: stockDocuments.type,
        postedAt: stockDocuments.postedAt,
      })
      .from(stockDocuments)
      .where(and(eq(stockDocuments.status, "POSTED"), documentScope))
      .orderBy(desc(stockDocuments.postedAt))
      .limit(5),
    db
      .select({
        date: stockDocuments.businessDate,
        type: stockDocuments.type,
        count: count(),
      })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.status, "POSTED"),
          gte(stockDocuments.businessDate, bounds.periodStart),
          documentScope,
        ),
      )
      .groupBy(stockDocuments.businessDate, stockDocuments.type)
      .orderBy(asc(stockDocuments.businessDate)),
  ]);

  return {
    periodDays: bounds.periodDays,
    storeCount: storeTotal.value,
    partCount: partTotal.value,
    busCount: busTotal.value,
    transactionCount: periodTransactionTotal.value,
    periodLabel: bounds.periodLabel,
    trends: {
      stores: pctChange(
        storesAddedInPeriod.value,
        storeTotal.value - storesAddedInPeriod.value,
      ),
      parts: pctChange(partsAddedInPeriod.value, partsBeforePeriod.value),
      buses: pctChange(busesAddedInPeriod.value, busesBeforePeriod.value),
      transactions: pctChange(
        periodTransactionTotal.value,
        previousTransactionTotal.value,
      ),
    },
    growth: {
      stores: storesAddedInPeriod.value,
      parts: partsAddedInPeriod.value,
      buses: busesAddedInPeriod.value,
    },
    totalItems: totalItemsRow.value,
    totalValue: totalValueRow.value,
    periodIssuedValue: periodIssuedRow.value,
    periodStockInValue: periodStockInRow.value,
    lowStockCount: lowStockCountRow.value,
    lowStock: lowStockThresholds,
    recentTransactions,
    trendData,
  };
}
