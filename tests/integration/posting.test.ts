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

  it("keeps a standalone issue pending when approve fails", async () => {
    const { and, eq } = await import("drizzle-orm");
    const { db } = await import("../../app/db/client.server");
    const { buses, jobCards, parts, stockDocuments, stores, users } =
      await import("../../app/db/schema");
    const {
      InsufficientStockError,
      approvePendingIssue,
      submitIssueForApproval,
    } = await import("../../app/features/inventory/posting.server");
    const { openJobCard } =
      await import("../../app/features/workshop/job-cards.server");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    const [bus] = await db.select().from(buses).limit(1);
    const [part] = await db.select().from(parts).limit(1);
    expect(admin && store && bus && part).toBeTruthy();

    const [existingOpen] = await db
      .select({
        id: jobCards.id,
        storeId: jobCards.storeId,
        busId: jobCards.busId,
      })
      .from(jobCards)
      .where(and(eq(jobCards.busId, bus!.id), eq(jobCards.status, "OPEN")))
      .limit(1);
    const card =
      existingOpen ??
      (await openJobCard(admin!, {
        storeId: store!.id,
        busId: bus!.id,
        businessDate: "2026-08-17",
        complaint: `Pending issue ${crypto.randomUUID().slice(0, 8)}`,
      }));

    const pending = await submitIssueForApproval(admin!, {
      storeId: card.storeId,
      busId: card.busId ?? bus!.id,
      jobCardId: card.id,
      businessDate: "2026-08-17",
      idempotencyKey: `it-pending-${crypto.randomUUID()}`,
      lines: [{ partId: part!.id, quantity: "999999" }],
    });
    expect(pending.number).toMatch(/^ISS-/);

    await expect(
      approvePendingIssue(admin!, pending.id),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const [row] = await db
      .select({
        status: stockDocuments.status,
        error: stockDocuments.lastApprovalError,
      })
      .from(stockDocuments)
      .where(eq(stockDocuments.id, pending.id))
      .limit(1);
    expect(row?.status).toBe("PENDING_APPROVAL");
    expect(row?.error).toMatch(/Insufficient stock/i);
  });
});
