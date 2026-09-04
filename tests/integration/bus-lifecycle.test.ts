/**
 * Bus fleet lifecycle against local DATABASE_URL. Skips when unset.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("bus fleet lifecycle", () => {
  it("blocks sale while a job card is open, then excludes sold buses from ops", async () => {
    const { db } = await import("../../app/db/client.server");
    const { buses, stores, users } = await import("../../app/db/schema");
    const { BusLifecycleError } =
      await import("../../app/features/master-data/bus-lifecycle");
    const { activateBus, deactivateBus, markBusSold, restoreSoldBus } =
      await import("../../app/features/master-data/buses.server");
    const { getTransactionOptions } =
      await import("../../app/features/inventory/queries.server");
    const { cancelJobCard, openJobCard } =
      await import("../../app/features/workshop/job-cards.server");
    const { getJobCardFormOptions } =
      await import("../../app/features/workshop/queries.server");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    expect(admin && store).toBeTruthy();

    const fleetNumber = `SOLD-T-${crypto.randomUUID().slice(0, 8)}`;
    const [bus] = await db
      .insert(buses)
      .values({ fleetNumber })
      .returning({ id: buses.id });
    expect(bus).toBeTruthy();

    const card = await openJobCard(admin!, {
      storeId: store!.id,
      busId: bus!.id,
      businessDate: "2026-09-04",
      complaint: "Lifecycle sale gate",
    });

    await expect(markBusSold(admin!, bus!.id)).rejects.toThrow(
      BusLifecycleError,
    );
    await expect(markBusSold(admin!, bus!.id)).rejects.toThrow(
      /unresolved job card/,
    );

    await cancelJobCard(admin!, card.id);

    const sold = await markBusSold(admin!, bus!.id, "End of service");
    expect(sold.status).toBe("SOLD");
    expect(sold.soldAt).toBeTruthy();

    await expect(
      openJobCard(admin!, {
        storeId: store!.id,
        busId: bus!.id,
        businessDate: "2026-09-04",
        complaint: "Should not open on sold bus",
      }),
    ).rejects.toThrow(/has been sold/);

    await expect(activateBus(admin!, bus!.id)).rejects.toThrow(/sold/i);
    await expect(restoreSoldBus(admin!, bus!.id, false)).rejects.toThrow(
      /Confirm restore/,
    );
    await expect(
      restoreSoldBus({ ...admin!, role: "OPERATOR" }, bus!.id, true),
    ).rejects.toThrow(/administrators/);

    const soldOptions = await getJobCardFormOptions(admin!);
    expect(soldOptions.buses.some((row) => row.id === bus!.id)).toBe(false);
    const soldStock = await getTransactionOptions(admin!);
    expect(soldStock.buses.some((row) => row.id === bus!.id)).toBe(false);

    const restored = await restoreSoldBus(admin!, bus!.id, true);
    expect(restored.status).toBe("ACTIVE");

    await deactivateBus(admin!, bus!.id);
    await expect(
      openJobCard(admin!, {
        storeId: store!.id,
        busId: bus!.id,
        businessDate: "2026-09-04",
        complaint: "Should not open on inactive bus",
      }),
    ).rejects.toThrow(/not available/);

    const inactiveOptions = await getJobCardFormOptions(admin!);
    expect(inactiveOptions.buses.some((row) => row.id === bus!.id)).toBe(false);

    await activateBus(admin!, bus!.id);
    const activeOptions = await getJobCardFormOptions(admin!);
    expect(activeOptions.buses.some((row) => row.id === bus!.id)).toBe(true);
  }, 30_000);
});
