/**
 * Workshop posting against local DATABASE_URL. Skips when unset.
 */
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("workshop job cards", () => {
  it("requires an open job card for bus issues, then posts and closes", async () => {
    const { db } = await import("../../app/db/client.server");
    const { buses, jobCards, parts, stores, users } =
      await import("../../app/db/schema");
    const { postStock } =
      await import("../../app/features/inventory/posting.server");
    const { closeJobCard, openJobCard } =
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

    await expect(
      postStock(admin!, "BUS_ISSUE", {
        storeId: store!.id,
        busId: bus!.id,
        businessDate: "2026-08-17",
        idempotencyKey: `it-issue-no-jc-${crypto.randomUUID()}`,
        lines: [{ partId: part!.id, quantity: "1" }],
      }),
    ).rejects.toThrow(/job card/i);

    const [existingOpen] = await db
      .select({
        id: jobCards.id,
        jobNumber: jobCards.jobNumber,
        storeId: jobCards.storeId,
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
        complaint: `Integration noise ${crypto.randomUUID().slice(0, 8)}`,
      }));
    expect(card.jobNumber).toMatch(/^JC-/);

    await postStock(admin!, "STOCK_RECEIPT", {
      storeId: card.storeId,
      businessDate: "2026-08-17",
      idempotencyKey: `it-jc-receipt-${crypto.randomUUID()}`,
      lines: [{ partId: part!.id, quantity: "2" }],
    });

    const issue = await postStock(admin!, "BUS_ISSUE", {
      storeId: card.storeId,
      busId: bus!.id,
      jobCardId: card.id,
      businessDate: "2026-08-17",
      idempotencyKey: `it-jc-issue-${crypto.randomUUID()}`,
      lines: [{ partId: part!.id, quantity: "1" }],
    });
    expect(issue.number).toMatch(/^ISS-/);

    const closed = await closeJobCard(admin!, {
      jobCardId: card.id,
      workDone: "Replaced the noisy part",
    });
    expect(closed.id).toBe(card.id);

    await expect(
      postStock(admin!, "BUS_ISSUE", {
        storeId: card.storeId,
        busId: bus!.id,
        jobCardId: card.id,
        businessDate: "2026-08-17",
        idempotencyKey: `it-jc-closed-${crypto.randomUUID()}`,
        lines: [{ partId: part!.id, quantity: "1" }],
      }),
    ).rejects.toThrow(/open/i);
  });
});
