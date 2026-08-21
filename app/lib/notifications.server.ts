import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import {
  inventoryBalances,
  notifications,
  parts,
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
        lowStockCondition,
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

type InboxPayload = {
  type: string;
  title: string;
  body: string;
  href?: string;
};

export async function notifyUser(userId: string, payload: InboxPayload) {
  await db.insert(notifications).values({
    userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    href: payload.href ?? null,
  });
}

export async function notifyAdmins(payload: InboxPayload) {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE")));
  if (admins.length === 0) return;
  await db.insert(notifications).values(
    admins.map((admin) => ({
      userId: admin.id,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      href: payload.href ?? null,
    })),
  );
}

export async function listInbox(userId: string, limit = 20) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { items: rows, unreadCount: Number(unread?.count ?? 0) };
}

export async function markNotificationRead(userId: string, id: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
