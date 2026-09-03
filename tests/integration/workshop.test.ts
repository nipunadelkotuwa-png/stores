/**
 * Workshop posting against local DATABASE_URL. Skips when unset.
 */
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("workshop job cards", () => {
  it("requires approval before bus issues, then posts and closes", async () => {
    const { db } = await import("../../app/db/client.server");
    const { buses, jobCards, parts, stores, users } =
      await import("../../app/db/schema");
    const {
      approvePendingIssue,
      postStock,
      submitIssueForApproval,
    } = await import("../../app/features/inventory/posting.server");
    const {
      approveJobCard,
      closeJobCard,
      openJobCard,
    } = await import("../../app/features/workshop/job-cards.server");

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
    ).rejects.toThrow(/verification|submitIssueForApproval/i);

    const [existingOpen] = await db
      .select({
        id: jobCards.id,
        jobNumber: jobCards.jobNumber,
        storeId: jobCards.storeId,
        status: jobCards.status,
      })
      .from(jobCards)
      .where(and(eq(jobCards.busId, bus!.id), eq(jobCards.status, "OPEN")))
      .limit(1);

    let card =
      existingOpen ??
      (await openJobCard(admin!, {
        storeId: store!.id,
        busId: bus!.id,
        businessDate: "2026-08-17",
        complaint: `Integration noise ${crypto.randomUUID().slice(0, 8)}`,
      }));

    if (!existingOpen) {
      expect(card).toMatchObject({ jobNumber: expect.stringMatching(/^JC-/) });
      const pending = await db
        .select({ status: jobCards.status })
        .from(jobCards)
        .where(eq(jobCards.id, card.id))
        .limit(1);
      expect(pending[0]?.status).toBe("PENDING_APPROVAL");

      await expect(
        submitIssueForApproval(admin!, {
          storeId: card.storeId,
          busId: bus!.id,
          jobCardId: card.id,
          businessDate: "2026-08-17",
          idempotencyKey: `it-jc-pending-issue-${crypto.randomUUID()}`,
          lines: [{ partId: part!.id, quantity: "1" }],
        }),
      ).rejects.toThrow(/open/i);

      const approved = await approveJobCard(admin!, card.id);
      card = { ...card, ...approved, status: "OPEN" as const };
    }

    expect(card.jobNumber).toMatch(/^JC-/);

    await postStock(admin!, "STOCK_RECEIPT", {
      storeId: card.storeId,
      businessDate: "2026-08-17",
      idempotencyKey: `it-jc-receipt-${crypto.randomUUID()}`,
      lines: [{ partId: part!.id, quantity: "2" }],
    });

    const pendingIssue = await submitIssueForApproval(admin!, {
      storeId: card.storeId,
      busId: bus!.id,
      jobCardId: card.id,
      businessDate: "2026-08-17",
      idempotencyKey: `it-jc-issue-${crypto.randomUUID()}`,
      lines: [{ partId: part!.id, quantity: "1" }],
    });
    expect(pendingIssue.number).toMatch(/^ISS-/);

    const verified = await approvePendingIssue(admin!, pendingIssue.id);
    expect(verified.number).toBe(pendingIssue.number);

    const closed = await closeJobCard(admin!, {
      jobCardId: card.id,
      workDone: "Replaced the noisy part",
    });
    expect(closed.id).toBe(card.id);

    await expect(
      submitIssueForApproval(admin!, {
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
