import { sql } from "drizzle-orm";

import { inventoryBalances, storePartSettings } from "~/db/schema";

/** Reorder 0 means “no threshold” — do not treat empty bins as alerts. */
export function isBelowReorder(
  onHand: number,
  reorderLevel: number | null | undefined,
): boolean {
  const threshold = Number(reorderLevel ?? 0);
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return onHand <= threshold;
}

export const lowStockCondition = sql`
  ${storePartSettings.reorderLevel}::numeric > 0
  AND COALESCE(${inventoryBalances.onHand}, 0) <= ${storePartSettings.reorderLevel}
`;
