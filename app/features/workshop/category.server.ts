import { eq } from "drizzle-orm";

import { partCategories, parts } from "~/db/schema";
import type { Transaction } from "~/features/inventory/posting.server";
import { WorkshopError } from "./errors";

export async function requirePartCategory(
  tx: Transaction,
  partId: string,
  code: "TYRE" | "OIL",
) {
  const [row] = await tx
    .select({
      id: parts.id,
      sku: parts.sku,
      name: parts.name,
      active: parts.active,
      categoryCode: partCategories.code,
    })
    .from(parts)
    .leftJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .where(eq(parts.id, partId))
    .limit(1);
  if (!row || !row.active) throw new WorkshopError("Part is not available");
  if (row.categoryCode !== code) {
    throw new WorkshopError(
      code === "TYRE"
        ? "Part must be in the TYRE category"
        : "Part must be in the OIL category",
    );
  }
  return row;
}
