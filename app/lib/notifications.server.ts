import { and, eq, sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import {
  inventoryBalances,
  parts,
  storePartSettings,
  stores,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";

export type LowStockNotification = {
  storeId: string;
  partId: string;
  currentQuantity: string;
  threshold: string;
  message: string;
};

export async function checkLowStockAlerts(
  actor: Actor,
  options?: {
    storeId?: string;
    partId?: string;
  },
): Promise<LowStockNotification[]> {
  const ids = await getAuthorizedStoreIds(actor);
  const { storeId, partId } = options ?? {};
  const rows = await db
    .select({
      storeId: storePartSettings.storeId,
      partId: storePartSettings.partId,
      threshold: storePartSettings.reorderLevel,
      onHand: sql<string>`COALESCE(${inventoryBalances.onHand}, 0)`,
      storeName: stores.name,
      partName: parts.name,
      sku: parts.sku,
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
        storeId ? eq(storePartSettings.storeId, storeId) : undefined,
        partId ? eq(storePartSettings.partId, partId) : undefined,
        sql`COALESCE(${inventoryBalances.onHand}, 0) <= ${storePartSettings.reorderLevel}`,
      ),
    );

  return rows.map((row) => ({
    storeId: row.storeId,
    partId: row.partId,
    currentQuantity: row.onHand,
    threshold: row.threshold,
    message: `Low stock: ${row.storeName} — ${row.partName} (${row.sku}) current ${row.onHand}, reorder at ${row.threshold}`,
  }));
}

/**
 * Dispatches low-stock notifications. Currently logs + writes an audit event
 * so alerts are visible in the audit trail until email/webhook is configured.
 */
export async function dispatchLowStockNotification(
  actor: Actor,
  notification: LowStockNotification,
): Promise<void> {
  const { auditEvents } = await import("~/db/schema");
  console.info(`[NOTIFICATION] ${notification.message}`);
  await db.insert(auditEvents).values({
    actorId: actor.id,
    eventType: "LOW_STOCK_ALERT",
    entityType: "part",
    entityId: notification.partId,
    storeId: notification.storeId,
    metadata: {
      message: notification.message,
      currentQuantity: notification.currentQuantity,
      threshold: notification.threshold,
    },
  });
}

export async function notifyLowStockForParts(
  actor: Actor,
  storeId: string,
  partIds: string[],
) {
  const unique = [...new Set(partIds)];
  for (const partId of unique) {
    const alerts = await checkLowStockAlerts(actor, { storeId, partId });
    for (const alert of alerts) {
      await dispatchLowStockNotification(actor, alert);
    }
  }
}
