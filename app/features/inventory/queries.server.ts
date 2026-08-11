import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "~/db/client.server";
import {
  buses,
  inventoryBalances,
  localPurchases,
  parts,
  stockDocumentLines,
  stockDocuments,
  stockMovements,
  storePartSettings,
  stores,
  suppliers,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";

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
      .select()
      .from(parts)
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

export async function getBalances(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      store: stores.name,
      storeCode: stores.code,
      partId: parts.id,
      sku: parts.sku,
      part: parts.name,
      unit: parts.unit,
      onHand: inventoryBalances.onHand,
      reorderLevel: storePartSettings.reorderLevel,
    })
    .from(inventoryBalances)
    .innerJoin(stores, eq(inventoryBalances.storeId, stores.id))
    .innerJoin(parts, eq(inventoryBalances.partId, parts.id))
    .leftJoin(
      storePartSettings,
      and(
        eq(inventoryBalances.storeId, storePartSettings.storeId),
        eq(inventoryBalances.partId, storePartSettings.partId),
      ),
    )
    .where(scopedStoreCondition(inventoryBalances.storeId, ids))
    .orderBy(asc(stores.code), asc(parts.sku));
}

export async function getLowStock(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
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
        sql`COALESCE(${inventoryBalances.onHand}, 0) <= ${storePartSettings.reorderLevel}`,
      ),
    )
    .orderBy(asc(stores.code), asc(parts.sku));
}

export async function getMovements(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
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
    .where(scopedStoreCondition(stockMovements.storeId, ids))
    .orderBy(desc(stockMovements.occurredAt))
    .limit(REPORT_LIMIT + 1);
  return {
    rows: rows.slice(0, REPORT_LIMIT),
    truncated: rows.length > REPORT_LIMIT,
  };
}

export async function getBusUsage(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
    .select({
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
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        scopedStoreCondition(stockDocuments.storeId, ids),
      ),
    )
    .orderBy(desc(stockDocuments.businessDate))
    .limit(REPORT_LIMIT + 1);
  return {
    rows: rows.slice(0, REPORT_LIMIT),
    truncated: rows.length > REPORT_LIMIT,
  };
}

export async function getLocalPurchases(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
    .select({
      id: localPurchases.id,
      number: localPurchases.purchaseNumber,
      date: localPurchases.businessDate,
      store: stores.name,
      supplier: localPurchases.supplierNameSnapshot,
      total: localPurchases.total,
      status: localPurchases.status,
    })
    .from(localPurchases)
    .innerJoin(stores, eq(localPurchases.storeId, stores.id))
    .where(scopedStoreCondition(localPurchases.storeId, ids))
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
