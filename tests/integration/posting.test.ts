/**
 * Integration smoke for the posting engine against the local DATABASE_URL.
 * Skips when DATABASE_URL is unset so unit CI stays offline-friendly.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("inventory posting integration", () => {
  it("posts a receipt, decrease adjustment, and rejects insufficient stock", async () => {
    const { db } = await import("../../app/db/client.server");
    const { parts, stores, users } = await import("../../app/db/schema");
    const { InsufficientStockError, postStock } =
      await import("../../app/features/inventory/posting.server");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    const [part] = await db.select().from(parts).limit(1);
    expect(admin && store && part).toBeTruthy();

    const receipt = await postStock(admin!, "STOCK_RECEIPT", {
      storeId: store!.id,
      businessDate: "2026-08-05",
      idempotencyKey: `it-receipt-${crypto.randomUUID()}`,
      lines: [{ partId: part!.id, quantity: "3", unitCost: "10" }],
    });
    expect(receipt.number).toMatch(/^SIN-/);

    const decrease = await postStock(admin!, "ADJUSTMENT", {
      storeId: store!.id,
      businessDate: "2026-08-05",
      direction: "decrease",
      reason: "Integration stock count",
      idempotencyKey: `it-adj-${crypto.randomUUID()}`,
      lines: [{ partId: part!.id, quantity: "1" }],
    });
    expect(decrease.number).toMatch(/^ADJ-/);

    await expect(
      postStock(admin!, "ADJUSTMENT", {
        storeId: store!.id,
        businessDate: "2026-08-05",
        direction: "decrease",
        reason: "Drain to fail",
        idempotencyKey: `it-fail-${crypto.randomUUID()}`,
        lines: [{ partId: part!.id, quantity: "999999" }],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });
});
