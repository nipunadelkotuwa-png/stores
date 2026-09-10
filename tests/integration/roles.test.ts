/**
 * Named-role mutation gates against local DATABASE_URL. Skips when unset.
 */
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

function isForbidden(error: unknown) {
  if (error instanceof Response) return error.status === 403;
  return (error as { init?: { status?: number } }).init?.status === 403;
}

describe.runIf(hasDb)("named role enforcement", { timeout: 60_000 }, () => {
  it("blocks viewer stock posts, store-keeper job-card writes, and workshop DAG reject", async () => {
    const { db } = await import("../../app/db/client.server");
    const { buses, parts, stockDocuments, stores, users } =
      await import("../../app/db/schema");
    const { postStock } =
      await import("../../app/features/inventory/posting.server");
    const { openJobCard, closeJobCard } =
      await import("../../app/features/workshop/job-cards.server");
    const { rejectTyreAtDag } =
      await import("../../app/features/workshop/tyres.server");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    const [part] = await db.select().from(parts).limit(1);
    const [bus] = await db.select().from(buses).limit(1);
    expect(admin && store && part && bus).toBeTruthy();

    const beforeCount = (
      await db.select({ id: stockDocuments.id }).from(stockDocuments)
    ).length;

    await expect(
      postStock(
        { ...admin!, role: "VIEWER" },
        "STOCK_RECEIPT",
        {
          storeId: store!.id,
          businessDate: "2026-09-10",
          idempotencyKey: `viewer-stock-${crypto.randomUUID()}`,
          lines: [{ partId: part!.id, quantity: "1", unitCost: "1" }],
        },
      ),
    ).rejects.toSatisfy(isForbidden);

    expect(
      (await db.select({ id: stockDocuments.id }).from(stockDocuments)).length,
    ).toBe(beforeCount);

    await expect(
      openJobCard(
        { ...admin!, role: "STORE_KEEPER" },
        {
          storeId: store!.id,
          busId: bus!.id,
          businessDate: "2026-09-10",
          complaint: "Store keeper should not open cards",
        },
      ),
    ).rejects.toSatisfy(isForbidden);

    await expect(
      closeJobCard(
        { ...admin!, role: "STORE_KEEPER" },
        {
          jobCardId: crypto.randomUUID(),
          workDone: "Store keeper should not close cards",
        },
      ),
    ).rejects.toSatisfy(isForbidden);

    await expect(
      rejectTyreAtDag(
        { ...admin!, role: "WORKSHOP" },
        {
          tyreId: crypto.randomUUID(),
          reason: "Should not reject",
        },
      ),
    ).rejects.toSatisfy(isForbidden);
  });

  it("refuses last-admin demotion and never drops to zero admins concurrently", async () => {
    const { db } = await import("../../app/db/client.server");
    const { users } = await import("../../app/db/schema");
    const {
      LastAdminError,
      assertNotLastActiveAdmin,
    } = await import("../../app/features/master-data/users-access.server");

    const snapshot = await db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        passwordHash: users.passwordHash,
      })
      .from(users);

    const [admin] = snapshot.filter(
      (row) => row.role === "ADMIN" && row.status === "ACTIVE",
    );
    expect(admin).toBeTruthy();

    const extras: { id: string }[] = [];
    try {
      const activeBefore = snapshot.filter(
        (row) => row.role === "ADMIN" && row.status === "ACTIVE",
      );
      if (activeBefore.length === 1) {
        await expect(
          db.transaction(async (tx) => {
            await assertNotLastActiveAdmin(tx, activeBefore[0]!.id, {
              role: "VIEWER",
            });
            await tx
              .update(users)
              .set({ role: "VIEWER" })
              .where(eq(users.id, activeBefore[0]!.id));
          }),
        ).rejects.toBeInstanceOf(LastAdminError);
      }

      extras.push(
        ...(await db
          .insert(users)
          .values({
            email: `last-admin-${crypto.randomUUID().slice(0, 8)}@test.local`,
            displayName: "Last admin extra",
            role: "ADMIN" as const,
            passwordHash: admin!.passwordHash,
            mustChangePassword: false,
          })
          .returning({ id: users.id })),
      );

      const racedIds = [admin!.id, extras[0]!.id];
      await Promise.allSettled(
        racedIds.map((id) =>
          db.transaction(async (tx) => {
            await assertNotLastActiveAdmin(tx, id, { role: "VIEWER" });
            await tx
              .update(users)
              .set({ role: "VIEWER" })
              .where(eq(users.id, id));
          }),
        ),
      );

      const remaining = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE")));
      expect(remaining.length).toBeGreaterThan(0);
    } finally {
      for (const user of snapshot) {
        await db
          .update(users)
          .set({ role: user.role, status: user.status })
          .where(eq(users.id, user.id));
      }
      if (extras.length > 0) {
        await db.delete(users).where(
          inArray(
            users.id,
            extras.map((row) => row.id),
          ),
        );
      }
    }
  });

  it("picks up a live role change on the next session read", async () => {
    const { db } = await import("../../app/db/client.server");
    const { parts, stores, users } = await import("../../app/db/schema");
    const { requireAdmin } =
      await import("../../app/lib/auth/authorization.server");
    const { createUserSession, getSessionRecord } =
      await import("../../app/lib/auth/session.server");
    const { postStock } =
      await import("../../app/features/inventory/posting.server");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    expect(admin).toBeTruthy();

    const [created] = await db
      .insert(users)
      .values({
        email: `role-change-${crypto.randomUUID().slice(0, 8)}@test.local`,
        displayName: "Role change operator",
        role: "OPERATOR",
        passwordHash: admin!.passwordHash,
        mustChangePassword: false,
      })
      .returning({ id: users.id });

    try {
      const login = await createUserSession(created!.id, "/");
      const cookie = login.headers.get("Set-Cookie")?.split(";")[0];
      expect(cookie).toBeTruthy();
      const adminRequest = new Request("http://localhost/admin/users", {
        headers: { Cookie: cookie! },
      });
      await expect(requireAdmin(adminRequest)).rejects.toSatisfy(isForbidden);

      await db
        .update(users)
        .set({ role: "VIEWER" })
        .where(eq(users.id, created!.id));

      const record = await getSessionRecord(
        new Request("http://localhost/stock-in/new", {
          headers: { Cookie: cookie! },
        }),
      );
      expect(record?.user.role).toBe("VIEWER");

      const [store] = await db.select().from(stores).limit(1);
      const [part] = await db.select().from(parts).limit(1);
      await expect(
        postStock(record!.user, "STOCK_RECEIPT", {
          storeId: store!.id,
          businessDate: "2026-09-10",
          idempotencyKey: `live-role-${crypto.randomUUID()}`,
          lines: [{ partId: part!.id, quantity: "1", unitCost: "1" }],
        }),
      ).rejects.toSatisfy(isForbidden);
    } finally {
      const { sessions } = await import("../../app/db/schema");
      await db.delete(sessions).where(eq(sessions.userId, created!.id));
      await db.delete(users).where(eq(users.id, created!.id));
    }
  });
});
