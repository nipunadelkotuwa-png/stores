import { and, asc, count, desc, eq, lt, lte, sql } from "drizzle-orm";
import { db } from "~/db/client.server";
import {
  buses,
  inventoryBalances,
  parts,
  stockDocuments,
  stockMovements,
  storePartSettings,
  stores,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";

export async function getDashboard(actor: Actor) {
  const storeIds = await getAuthorizedStoreIds(actor);
  const storeScope = scopedStoreCondition(stores.id, storeIds);
  const documentScope = scopedStoreCondition(stockDocuments.storeId, storeIds);
  const movementScope = scopedStoreCondition(stockMovements.storeId, storeIds);

  const [[storeTotal], [partTotal], [busTotal], [movementTotal]] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(stores)
        .where(and(eq(stores.active, true), storeScope)),
      db.select({ value: count() }).from(parts).where(eq(parts.active, true)),
      db.select({ value: count() }).from(buses).where(eq(buses.active, true)),
      db
        .select({ value: count() })
        .from(stockDocuments)
        .where(and(eq(stockDocuments.status, "POSTED"), documentScope)),
    ]);

  const lowStockThresholds = await db
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
        lte(
          sql`COALESCE(${inventoryBalances.onHand}, 0)`,
          storePartSettings.reorderLevel,
        ),
      ),
    )
    .orderBy(asc(stores.name), asc(parts.sku));

  const topConsumed = await db
    .select({
      partId: parts.id,
      sku: parts.sku,
      part: parts.name,
      quantity: sql<string>`SUM(${stockMovements.quantityDelta} * -1)`,
    })
    .from(stockMovements)
    .innerJoin(parts, eq(stockMovements.partId, parts.id))
    .innerJoin(stockDocuments, eq(stockMovements.documentId, stockDocuments.id))
    .where(
      and(
        lt(stockMovements.quantityDelta, "0"),
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "POSTED"),
        movementScope,
      ),
    )
    .groupBy(parts.id, parts.sku, parts.name)
    .orderBy(desc(sql`SUM(${stockMovements.quantityDelta} * -1)`))
    .limit(5);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const trendData = await db
    .select({
      date: stockDocuments.businessDate,
      type: stockDocuments.type,
      count: count(),
    })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.status, "POSTED"),
        sql`${stockDocuments.businessDate} >= ${dateStr}`,
        documentScope,
      ),
    )
    .groupBy(stockDocuments.businessDate, stockDocuments.type)
    .orderBy(asc(stockDocuments.businessDate));

  return {
    storeCount: storeTotal.value,
    partCount: partTotal.value,
    busCount: busTotal.value,
    transactionCount: movementTotal.value,
    lowStock: lowStockThresholds,
    topConsumed,
    trendData,
  };
}
