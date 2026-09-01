import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "~/db/client.server";
import {
  inventoryBalances,
  jobCards,
  parts,
  stockDocumentLines,
  stockDocuments,
  storePartSettings,
  stores,
  users,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";
import { lowStockCondition } from "~/features/inventory/low-stock";

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function dayBounds(daysAgo: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function getPosHubData(actor: Actor) {
  const storeIds = await getAuthorizedStoreIds(actor);
  const documentScope = scopedStoreCondition(stockDocuments.storeId, storeIds);
  const today = dayBounds(0);
  const yesterday = dayBounds(1);

  const [
    [todayTransactionTotal],
    [yesterdayTransactionTotal],
    [reorderCategoryTotal],
    lowStock,
    recentDocumentsBase,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.status, "POSTED"),
          gte(stockDocuments.postedAt, today.start),
          lt(stockDocuments.postedAt, today.end),
          documentScope,
        ),
      ),
    db
      .select({ value: count() })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.status, "POSTED"),
          gte(stockDocuments.postedAt, yesterday.start),
          lt(stockDocuments.postedAt, yesterday.end),
          documentScope,
        ),
      ),
    db
      .select({
        value: sql<number>`COUNT(DISTINCT ${parts.categoryId})::int`,
      })
      .from(storePartSettings)
      .innerJoin(parts, eq(storePartSettings.partId, parts.id))
      .where(
        and(
          scopedStoreCondition(storePartSettings.storeId, storeIds),
          sql`${storePartSettings.reorderLevel} > 0`,
          sql`${parts.categoryId} IS NOT NULL`,
        ),
      ),
    db
      .select({
        storeId: stores.id,
        store: stores.name,
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
          scopedStoreCondition(storePartSettings.storeId, storeIds),
          lowStockCondition,
        ),
      )
      .orderBy(
        sql`COALESCE(${inventoryBalances.onHand}, 0) / NULLIF(${storePartSettings.reorderLevel}, 0)`,
      )
      .limit(8),
    db
      .select({
        id: stockDocuments.id,
        type: stockDocuments.type,
        number: stockDocuments.documentNumber,
        postedAt: stockDocuments.postedAt,
        actor: users.displayName,
        partName: stockDocumentLines.nameSnapshot,
        quantity: stockDocumentLines.quantity,
        jobNumber: jobCards.jobNumber,
      })
      .from(stockDocuments)
      .innerJoin(
        stockDocumentLines,
        and(
          eq(stockDocumentLines.documentId, stockDocuments.id),
          eq(stockDocumentLines.lineNumber, 1),
        ),
      )
      .leftJoin(users, eq(stockDocuments.postedBy, users.id))
      .leftJoin(jobCards, eq(stockDocuments.jobCardId, jobCards.id))
      .where(and(eq(stockDocuments.status, "POSTED"), documentScope))
      .orderBy(desc(stockDocuments.postedAt))
      .limit(4),
  ]);

  const recentIds = recentDocumentsBase.map((row) => row.id);
  const lineCountRows =
    recentIds.length === 0
      ? []
      : await db
          .select({
            documentId: stockDocumentLines.documentId,
            lineCount: sql<number>`count(*)::int`,
          })
          .from(stockDocumentLines)
          .where(inArray(stockDocumentLines.documentId, recentIds))
          .groupBy(stockDocumentLines.documentId);

  const lineCountByDocument = new Map(
    lineCountRows.map((row) => [row.documentId, row.lineCount]),
  );
  const recentDocuments = recentDocumentsBase.map((row) => ({
    ...row,
    lineCount: lineCountByDocument.get(row.id) ?? 1,
  }));

  return {
    lowStock,
    reorderCategoryCount: reorderCategoryTotal.value,
    todayTransactions: todayTransactionTotal.value,
    transactionTrend: pctChange(
      todayTransactionTotal.value,
      yesterdayTransactionTotal.value,
    ),
    recentActivity: recentDocuments.map((row) => ({
      id: row.id,
      href: `/receipts/${row.id}`,
      actor: row.actor ?? "System",
      time: row.postedAt,
      type: row.type,
      tone: activityTone(row.type),
      label: formatActivityLabel(row),
    })),
  };
}

function activityTone(type: string): "green" | "blue" | "purple" | "orange" {
  if (type === "STOCK_RECEIPT") return "orange";
  if (type === "BUS_ISSUE") return "green";
  if (type === "BUS_RETURN") return "blue";
  return "purple";
}

function formatActivityLabel(row: {
  type: string;
  partName: string;
  quantity: string;
  jobNumber: string | null;
  number: string;
  lineCount: number;
}) {
  const qty = Number(row.quantity);
  const qtyLabel = Number.isFinite(qty) ? qty : row.quantity;
  const extraLines =
    row.lineCount > 1 ? ` (+${row.lineCount - 1} more line${row.lineCount > 2 ? "s" : ""})` : "";

  switch (row.type) {
    case "BUS_ISSUE":
      return row.jobNumber
        ? `Issued ${row.partName} to ${row.jobNumber}${extraLines}`
        : `Issued ${row.partName}${extraLines}`;
    case "STOCK_RECEIPT":
      return `Received ${qtyLabel}x ${row.partName} (Stock In)${extraLines}`;
    case "BUS_RETURN":
      return `Returned ${qtyLabel}x ${row.partName}${extraLines}`;
    case "ADJUSTMENT":
      return `Adjusted ${row.partName}${extraLines}`;
    default:
      return `${row.partName} · ${row.number}${extraLines}`;
  }
}
