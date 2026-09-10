/**
 * Tyre lifecycle against local DATABASE_URL. Skips when unset.
 * These tests post many serializable workshop transactions, so they need a
 * long timeout against a remote or high-latency database.
 */
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("tyre lifecycle", () => {
  it("imports atomically, resets service after DAG receive, and disposes only after DAG3 service", async () => {
    const { db } = await import("../../app/db/client.server");
    const {
      buses,
      inventoryBalances,
      parts,
      stockDocuments,
      stores,
      suppliers,
      tyreEvents,
      tyres,
      users,
    } = await import("../../app/db/schema");
    const { approvePendingIssue } =
      await import("../../app/features/inventory/posting.server");
    const { approveJobCard, openJobCard } =
      await import("../../app/features/workshop/job-cards.server");
    const { getTyreLifecycleActions } =
      await import("../../app/features/workshop/tyre-lifecycle");
    const { WorkshopConflictError } =
      await import("../../app/features/workshop/errors");
    const {
      disposeTyre,
      fitOrReplaceTyre,
      importOrgTyres,
      receiveTyreFromDag,
      sendTyreToDag,
    } = await import("../../app/features/workshop/tyres.server");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.active, true))
      .limit(1);
    const [orgPart] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-ORG-295"))
      .limit(1);
    const [dag1Part] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-DAG1-295"))
      .limit(1);
    const [dag2Part] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-DAG2-295"))
      .limit(1);
    const [dag3Part] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-DAG3-295"))
      .limit(1);
    expect(
      admin && store && supplier && orgPart && dag1Part && dag2Part && dag3Part,
    ).toBeTruthy();

    async function onHand(partId: string) {
      const [row] = await db
        .select({ onHand: inventoryBalances.onHand })
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.storeId, store!.id),
            eq(inventoryBalances.partId, partId),
          ),
        )
        .limit(1);
      return Number(row?.onHand ?? 0);
    }

    async function tyreActions(tyreId: string) {
      const [tyre] = await db.select().from(tyres).where(eq(tyres.id, tyreId));
      const events = await db
        .select({
          tyreId: tyreEvents.tyreId,
          type: tyreEvents.type,
          sequence: tyreEvents.sequence,
        })
        .from(tyreEvents)
        .where(eq(tyreEvents.tyreId, tyreId));
      return {
        tyre: tyre!,
        actions: getTyreLifecycleActions({
          tyreId,
          stage: tyre!.lifecycleStage,
          status: tyre!.status,
          events,
        }),
      };
    }

    const tag = crypto.randomUUID().slice(0, 8);
    const lifeSerial = `it-life-${tag}`;
    const swapSerial = `it-swap-${tag}`;
    const orgBefore = await onHand(orgPart!.id);
    const dag1Before = await onHand(dag1Part!.id);

    const imported = await importOrgTyres(admin!, {
      storeId: store!.id,
      supplierId: supplier!.id,
      businessDate: "2026-09-08",
      partId: orgPart!.id,
      quantity: 2,
      unitCost: "1000.00",
      serials: `${lifeSerial}\n${swapSerial}`,
      idempotencyKey: `import-${tag}-aaaaaaaa`,
    });
    expect(imported.created).toBe(true);
    expect(imported.tyreIds).toHaveLength(2);
    expect(await onHand(orgPart!.id)).toBe(orgBefore + 2);
    expect(await onHand(dag1Part!.id)).toBe(dag1Before);

    const replay = await importOrgTyres(admin!, {
      storeId: store!.id,
      supplierId: supplier!.id,
      businessDate: "2026-09-08",
      partId: orgPart!.id,
      quantity: 2,
      unitCost: "1000.00",
      serials: `${swapSerial}\n ${lifeSerial} `,
      idempotencyKey: `import-${tag}-aaaaaaaa`,
    });
    expect(replay.created).toBe(false);
    expect(replay.receiptId).toBe(imported.receiptId);
    expect(await onHand(orgPart!.id)).toBe(orgBefore + 2);

    await expect(
      importOrgTyres(admin!, {
        storeId: store!.id,
        supplierId: supplier!.id,
        businessDate: "2026-09-08",
        partId: orgPart!.id,
        quantity: 1,
        unitCost: "5.00",
        serials: `it-other-${tag}`,
        idempotencyKey: `import-${tag}-aaaaaaaa`,
      }),
    ).rejects.toBeInstanceOf(WorkshopConflictError);

    await expect(
      importOrgTyres(admin!, {
        storeId: store!.id,
        supplierId: supplier!.id,
        businessDate: "2026-09-08",
        partId: orgPart!.id,
        quantity: 2,
        unitCost: "1000.00",
        serials: `${lifeSerial}\nit-new-${tag}`,
        idempotencyKey: `import-fail-${tag}-bbbbbbbb`,
      }),
    ).rejects.toThrow();
    expect(await onHand(orgPart!.id)).toBe(orgBefore + 2);
    expect(await onHand(dag1Part!.id)).toBe(dag1Before);

    const [life] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.serialNumber, lifeSerial));
    const [swap] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.serialNumber, swapSerial));
    expect(life?.lifecycleStage).toBe("ORG");
    expect(life?.status).toBe("IN_STORE");
    expect((await tyreActions(life!.id)).actions).toEqual({
      canFit: true,
      canSendToDag: false,
      canDispose: false,
    });

    const [bus] = await db
      .insert(buses)
      .values({ fleetNumber: `IT-TYRE-${tag}` })
      .returning();
    let card = await openJobCard(admin!, {
      storeId: store!.id,
      busId: bus!.id,
      businessDate: "2026-09-08",
      complaint: "Tyre lifecycle integration",
    });
    const approvedCard = await approveJobCard(admin!, card.id);
    card = { ...card, ...approvedCard };

    async function fit(tyreId: string) {
      const pending = await fitOrReplaceTyre(admin!, {
        jobCardId: card.id,
        tyreId,
        position: "FL",
        idempotencyKey: `fit-${tyreId}-${crypto.randomUUID()}`,
      });
      await approvePendingIssue(admin!, pending.documentId);
    }

    async function cycleToNext(
      fromPartId: string,
      toPartId: string,
      nextStage: "DAG1" | "DAG2" | "DAG3",
    ) {
      await fit(life!.id);
      await fit(swap!.id);
      const serviced = await tyreActions(life!.id);
      expect(serviced.tyre.status).toBe("IN_STORE");
      expect(serviced.actions.canSendToDag).toBe(true);
      const beforeFrom = await onHand(fromPartId);
      const beforeTo = await onHand(toPartId);
      await sendTyreToDag(admin!, {
        tyreId: life!.id,
        supplierId: supplier!.id,
        businessDate: "2026-09-08",
        idempotencyKey: `dag-send-${nextStage}-${tag}-aaaaaaaa`,
      });
      expect((await tyreActions(life!.id)).tyre.status).toBe("AT_DAG");
      await receiveTyreFromDag(admin!, {
        tyreId: life!.id,
        targetPartId: toPartId,
        businessDate: "2026-09-08",
        idempotencyKey: `dag-recv-${nextStage}-${tag}-aaaaaaaa`,
      });
      const received = await tyreActions(life!.id);
      expect(received.tyre.serialNumber).toBe(lifeSerial);
      expect(received.tyre.lifecycleStage).toBe(nextStage);
      expect(received.tyre.status).toBe("IN_STORE");
      expect(received.actions).toEqual({
        canFit: true,
        canSendToDag: false,
        canDispose: false,
      });
      expect(await onHand(fromPartId)).toBe(beforeFrom - 1);
      expect(await onHand(toPartId)).toBe(beforeTo + 1);
    }

    await cycleToNext(orgPart!.id, dag1Part!.id, "DAG1");
    await cycleToNext(dag1Part!.id, dag2Part!.id, "DAG2");
    await cycleToNext(dag2Part!.id, dag3Part!.id, "DAG3");

    const freshDag3 = await tyreActions(life!.id);
    expect(freshDag3.actions.canFit).toBe(true);
    expect(freshDag3.actions.canSendToDag).toBe(false);
    expect(freshDag3.actions.canDispose).toBe(false);

    await expect(
      sendTyreToDag(admin!, {
        tyreId: life!.id,
        supplierId: supplier!.id,
        businessDate: "2026-09-08",
        idempotencyKey: `dag4-${tag}-aaaaaaaa`,
      }),
    ).rejects.toThrow(/DAG3|not eligible|lifecycle changed/i);

    await fit(life!.id);
    await fit(swap!.id);
    const final = await tyreActions(life!.id);
    expect(final.tyre.lifecycleStage).toBe("DAG3");
    expect(final.actions.canSendToDag).toBe(false);
    expect(final.actions.canDispose).toBe(true);

    await disposeTyre(admin!, {
      tyreId: life!.id,
      businessDate: "2026-09-08",
      idempotencyKey: `dispose-${tag}-aaaaaaaa`,
    });
    expect((await tyreActions(life!.id)).tyre.status).toBe("DISPOSED");
    expect((await tyreActions(life!.id)).tyre.serialNumber).toBe(lifeSerial);

    const dagSends = await db
      .select({ id: stockDocuments.id })
      .from(stockDocuments)
      .where(eq(stockDocuments.type, "TYRE_DAG_SEND"));
    expect(dagSends.length).toBeGreaterThanOrEqual(3);
  }, 360_000);

  it("allows only one of concurrent DAG send and dispose to succeed", async () => {
    const { db } = await import("../../app/db/client.server");
    const { buses, parts, stores, suppliers, tyres, users } =
      await import("../../app/db/schema");
    const { approvePendingIssue } =
      await import("../../app/features/inventory/posting.server");
    const { approveJobCard, openJobCard } =
      await import("../../app/features/workshop/job-cards.server");
    const { disposeTyre, fitOrReplaceTyre, importOrgTyres, sendTyreToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { WorkshopConflictError } =
      await import("../../app/features/workshop/errors");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.active, true))
      .limit(1);
    const [orgPart] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-ORG-295"))
      .limit(1);
    expect(admin && store && supplier && orgPart).toBeTruthy();

    const tag = crypto.randomUUID().slice(0, 8);
    const lifeSerial = `it-race-${tag}-a`;
    const swapSerial = `it-race-${tag}-b`;
    await importOrgTyres(admin!, {
      storeId: store!.id,
      supplierId: supplier!.id,
      businessDate: "2026-09-08",
      partId: orgPart!.id,
      quantity: 2,
      unitCost: "1.00",
      serials: `${lifeSerial}\n${swapSerial}`,
      idempotencyKey: `import-race-${tag}-aaaaaaaa`,
    });
    const [life] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.serialNumber, lifeSerial));
    const [swap] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.serialNumber, swapSerial));
    const [bus] = await db
      .insert(buses)
      .values({ fleetNumber: `IT-RACE-${tag}` })
      .returning();
    let card = await openJobCard(admin!, {
      storeId: store!.id,
      busId: bus!.id,
      businessDate: "2026-09-08",
      complaint: "Concurrent tyre mutation",
    });
    card = { ...card, ...(await approveJobCard(admin!, card.id)) };

    const pendingFit = await fitOrReplaceTyre(admin!, {
      jobCardId: card.id,
      tyreId: life!.id,
      position: "FL",
      idempotencyKey: `fit-a-${tag}-aaaaaaaaaaaa`,
    });
    await approvePendingIssue(admin!, pendingFit.documentId);
    const pendingSwap = await fitOrReplaceTyre(admin!, {
      jobCardId: card.id,
      tyreId: swap!.id,
      position: "FL",
      idempotencyKey: `fit-b-${tag}-aaaaaaaaaaaa`,
    });
    await approvePendingIssue(admin!, pendingSwap.documentId);

    const raced = await Promise.allSettled([
      sendTyreToDag(admin!, {
        tyreId: life!.id,
        supplierId: supplier!.id,
        businessDate: "2026-09-08",
        idempotencyKey: `race-send-${tag}-aaaaaaaa`,
      }),
      disposeTyre(admin!, {
        tyreId: life!.id,
        businessDate: "2026-09-08",
        idempotencyKey: `race-disp-${tag}-aaaaaaaa`,
      }),
    ]);
    const won = raced.filter((row) => row.status === "fulfilled");
    const lost = raced.filter((row) => row.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    const [after] = await db.select().from(tyres).where(eq(tyres.id, life!.id));
    expect(["AT_DAG", "DISPOSED"]).toContain(after?.status);
    expect(lost[0]?.status).toBe("rejected");
    if (lost[0]?.status === "rejected") {
      expect(lost[0].reason).toBeInstanceOf(WorkshopConflictError);
    }
  }, 360_000);

  async function servicedPair(label: string) {
    const { db } = await import("../../app/db/client.server");
    const { buses, parts, stores, suppliers, tyreEvents, tyres, users } =
      await import("../../app/db/schema");
    const { approvePendingIssue } =
      await import("../../app/features/inventory/posting.server");
    const { approveJobCard, openJobCard } =
      await import("../../app/features/workshop/job-cards.server");
    const { fitOrReplaceTyre, importOrgTyres } =
      await import("../../app/features/workshop/tyres.server");
    const { WorkshopConflictError } =
      await import("../../app/features/workshop/errors");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.active, true))
      .limit(1);
    const [orgPart] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-ORG-295"))
      .limit(1);
    expect(admin && store && supplier && orgPart).toBeTruthy();

    const tag = crypto.randomUUID().slice(0, 8);
    const lifeSerial = `it-${label}-${tag}-a`;
    const swapSerial = `it-${label}-${tag}-b`;
    await importOrgTyres(admin!, {
      storeId: store!.id,
      supplierId: supplier!.id,
      businessDate: "2026-09-08",
      partId: orgPart!.id,
      quantity: 2,
      unitCost: "1.00",
      serials: `${lifeSerial}\n${swapSerial}`,
      idempotencyKey: `import-${label}-${tag}-aaaaaaaa`,
    });
    const [life] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.serialNumber, lifeSerial));
    const [swap] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.serialNumber, swapSerial));
    const [bus] = await db
      .insert(buses)
      .values({ fleetNumber: `IT-${label}-${tag}` })
      .returning();
    let card = await openJobCard(admin!, {
      storeId: store!.id,
      busId: bus!.id,
      businessDate: "2026-09-08",
      complaint: `Concurrent ${label}`,
    });
    card = { ...card, ...(await approveJobCard(admin!, card.id)) };
    const pendingFit = await fitOrReplaceTyre(admin!, {
      jobCardId: card.id,
      tyreId: life!.id,
      position: "FL",
      idempotencyKey: `fit-a-${label}-${tag}-aaaaaaaa`,
    });
    await approvePendingIssue(admin!, pendingFit.documentId);
    const pendingSwap = await fitOrReplaceTyre(admin!, {
      jobCardId: card.id,
      tyreId: swap!.id,
      position: "FL",
      idempotencyKey: `fit-b-${label}-${tag}-aaaaaaaa`,
    });
    await approvePendingIssue(admin!, pendingSwap.documentId);
    return {
      admin: admin!,
      supplier: supplier!,
      life: life!,
      card,
      db,
      tyreEvents,
      tyres,
      WorkshopConflictError,
      tag,
    };
  }

  it("allows only one of concurrent DAG send and fit to succeed", async () => {
    const { approvePendingIssue } =
      await import("../../app/features/inventory/posting.server");
    const { fitOrReplaceTyre, sendTyreToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { stockDocuments } = await import("../../app/db/schema");
    const {
      admin,
      supplier,
      life,
      card,
      db,
      tyres,
      WorkshopConflictError,
      tag,
    } = await servicedPair("sendfit");

    const raced = await Promise.allSettled([
      sendTyreToDag(admin, {
        tyreId: life.id,
        supplierId: supplier.id,
        businessDate: "2026-09-08",
        idempotencyKey: `race-sendfit-${tag}-aaaaaaaa`,
      }),
      fitOrReplaceTyre(admin, {
        jobCardId: card.id,
        tyreId: life.id,
        position: "FL",
        idempotencyKey: `race-fit-${tag}-aaaaaaaaaaaa`,
      }),
    ]);
    const won = raced.filter((row) => row.status === "fulfilled");
    const lost = raced.filter((row) => row.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    if (lost[0]?.status === "rejected") {
      expect(lost[0].reason).toBeInstanceOf(WorkshopConflictError);
    }

    const [after] = await db.select().from(tyres).where(eq(tyres.id, life.id));
    const pending = await db
      .select({ id: stockDocuments.id, notes: stockDocuments.notes })
      .from(stockDocuments)
      .where(eq(stockDocuments.status, "PENDING_APPROVAL"));
    const reservedFit = pending.some((row) => row.notes?.includes(life.id));
    if (after?.status === "AT_DAG") {
      expect(reservedFit).toBe(false);
    } else {
      expect(after?.status).toBe("IN_STORE");
      expect(reservedFit).toBe(true);
      const pendingRow = pending.find((row) => row.notes?.includes(life.id));
      if (pendingRow) await approvePendingIssue(admin, pendingRow.id);
    }
  }, 360_000);

  it("allows only one of concurrent dispose and fit to succeed", async () => {
    const { fitOrReplaceTyre, disposeTyre } =
      await import("../../app/features/workshop/tyres.server");
    const { stockDocuments } = await import("../../app/db/schema");
    const { admin, life, card, db, tyres, WorkshopConflictError, tag } =
      await servicedPair("dispfit");

    const raced = await Promise.allSettled([
      disposeTyre(admin, {
        tyreId: life.id,
        businessDate: "2026-09-08",
        idempotencyKey: `race-dispfit-${tag}-aaaaaaaa`,
      }),
      fitOrReplaceTyre(admin, {
        jobCardId: card.id,
        tyreId: life.id,
        position: "FL",
        idempotencyKey: `race-dfit-${tag}-aaaaaaaaaaaa`,
      }),
    ]);
    const won = raced.filter((row) => row.status === "fulfilled");
    const lost = raced.filter((row) => row.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    if (lost[0]?.status === "rejected") {
      expect(lost[0].reason).toBeInstanceOf(WorkshopConflictError);
    }
    const [after] = await db.select().from(tyres).where(eq(tyres.id, life.id));
    const pending = await db
      .select({ notes: stockDocuments.notes })
      .from(stockDocuments)
      .where(eq(stockDocuments.status, "PENDING_APPROVAL"));
    const reservedFit = pending.some((row) => row.notes?.includes(life.id));
    if (after?.status === "DISPOSED") {
      expect(reservedFit).toBe(false);
    } else {
      expect(after?.status).toBe("IN_STORE");
      expect(reservedFit).toBe(true);
    }
  }, 360_000);

  it("allows only one concurrent DAG send", async () => {
    const { sendTyreToDag } =
      await import("../../app/features/workshop/tyres.server");
    const {
      admin,
      supplier,
      life,
      db,
      tyreEvents,
      tyres,
      WorkshopConflictError,
      tag,
    } = await servicedPair("sendsend");

    const raced = await Promise.allSettled([
      sendTyreToDag(admin, {
        tyreId: life.id,
        supplierId: supplier.id,
        businessDate: "2026-09-08",
        idempotencyKey: `race-send1-${tag}-aaaaaaaa`,
      }),
      sendTyreToDag(admin, {
        tyreId: life.id,
        supplierId: supplier.id,
        businessDate: "2026-09-08",
        idempotencyKey: `race-send2-${tag}-aaaaaaaa`,
      }),
    ]);
    expect(raced.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter((row) => row.status === "rejected")).toHaveLength(1);
    const lost = raced.find((row) => row.status === "rejected");
    if (lost?.status === "rejected") {
      expect(lost.reason).toBeInstanceOf(WorkshopConflictError);
    }
    const [after] = await db.select().from(tyres).where(eq(tyres.id, life.id));
    expect(after?.status).toBe("AT_DAG");
    const sends = await db
      .select({ id: tyreEvents.id })
      .from(tyreEvents)
      .where(
        and(eq(tyreEvents.tyreId, life.id), eq(tyreEvents.type, "SEND_DAG")),
      );
    expect(sends).toHaveLength(1);
  }, 360_000);

  async function servicedLives(label: string, count: number) {
    const { db } = await import("../../app/db/client.server");
    const { buses, parts, stockDocuments, stores, suppliers, tyres, users } =
      await import("../../app/db/schema");
    const { approvePendingIssue } =
      await import("../../app/features/inventory/posting.server");
    const { approveJobCard, openJobCard } =
      await import("../../app/features/workshop/job-cards.server");
    const { fitOrReplaceTyre, importOrgTyres } =
      await import("../../app/features/workshop/tyres.server");

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    const [store] = await db.select().from(stores).limit(1);
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.active, true))
      .limit(1);
    const [orgPart] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-ORG-295"))
      .limit(1);
    expect(admin && store && supplier && orgPart).toBeTruthy();

    const tag = crypto.randomUUID().slice(0, 8);
    const serials = Array.from(
      { length: count + 1 },
      (_, index) => `it-${label}-${tag}-${index}`,
    );
    await importOrgTyres(admin!, {
      storeId: store!.id,
      supplierId: supplier!.id,
      businessDate: "2026-09-08",
      partId: orgPart!.id,
      quantity: count + 1,
      unitCost: "1.00",
      serials: serials.join("\n"),
      idempotencyKey: `import-${label}-${tag}-aaaaaaaa`,
    });
    const tyreRows = [];
    for (const serial of serials) {
      const [row] = await db
        .select()
        .from(tyres)
        .where(eq(tyres.serialNumber, serial));
      tyreRows.push(row!);
    }
    const lives = tyreRows.slice(0, count);
    const mule = tyreRows[count]!;
    const [bus] = await db
      .insert(buses)
      .values({ fleetNumber: `IT-${label}-${tag}` })
      .returning();
    let card = await openJobCard(admin!, {
      storeId: store!.id,
      busId: bus!.id,
      businessDate: "2026-09-08",
      complaint: `Batch ${label}`,
    });
    card = { ...card, ...(await approveJobCard(admin!, card.id)) };
    for (const [index, life] of lives.entries()) {
      const pendingFit = await fitOrReplaceTyre(admin!, {
        jobCardId: card.id,
        tyreId: life.id,
        position: "FL",
        idempotencyKey: `fit-${label}-${tag}-${index}-a`.padEnd(16, "a"),
      });
      await approvePendingIssue(admin!, pendingFit.documentId);
      const pendingSwap = await fitOrReplaceTyre(admin!, {
        jobCardId: card.id,
        tyreId: mule.id,
        position: "FL",
        idempotencyKey: `fit-${label}-${tag}-${index}-b`.padEnd(16, "a"),
      });
      await approvePendingIssue(admin!, pendingSwap.documentId);
    }
    return {
      admin: admin!,
      supplier: supplier!,
      lives,
      mule,
      db,
      tyres,
      stockDocuments,
      tag,
    };
  }

  it("posts no DAG OUT documents when any serial in the batch is invalid", async () => {
    const { sendTyresToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { WorkshopError } =
      await import("../../app/features/workshop/errors");
    const { dagDocumentIdempotencyKey } =
      await import("../../app/features/workshop/dag-batch");
    const { admin, supplier, lives, db, tyres, stockDocuments } =
      await servicedLives("batchout", 1);
    const batchKey = crypto.randomUUID();
    const missing = crypto.randomUUID();

    await expect(
      sendTyresToDag(admin, {
        tyreIds: [lives[0]!.id, missing],
        supplierId: supplier.id,
        businessDate: "2026-09-08",
        batchKey,
      }),
    ).rejects.toBeInstanceOf(WorkshopError);

    try {
      await sendTyresToDag(admin, {
        tyreIds: [lives[0]!.id, missing],
        supplierId: supplier.id,
        businessDate: "2026-09-08",
        batchKey,
      });
    } catch (error) {
      expect((error as Error).message).toContain("Cannot send DAG batch.");
      expect((error as Error).message).toContain(missing);
    }

    const docs = await db
      .select({ id: stockDocuments.id })
      .from(stockDocuments)
      .where(
        eq(
          stockDocuments.idempotencyKey,
          dagDocumentIdempotencyKey("DAG_OUT", batchKey, lives[0]!.id),
        ),
      );
    expect(docs).toHaveLength(0);
    const [after] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.id, lives[0]!.id));
    expect(after?.status).toBe("IN_STORE");
  }, 360_000);

  it("lists every invalid serial and posts zero documents for a five-tyre DAG batch", async () => {
    const { sendTyresToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { WorkshopError } =
      await import("../../app/features/workshop/errors");
    const { admin, supplier, lives, db, stockDocuments } =
      await servicedLives("batch5", 3);
    const batchKey = crypto.randomUUID();
    const invalidA = crypto.randomUUID();
    const invalidB = crypto.randomUUID();

    await expect(
      sendTyresToDag(admin, {
        tyreIds: [...lives.map((row) => row.id), invalidA, invalidB],
        supplierId: supplier.id,
        businessDate: "2026-09-08",
        batchKey,
      }),
    ).rejects.toBeInstanceOf(WorkshopError);

    try {
      await sendTyresToDag(admin, {
        tyreIds: [...lives.map((row) => row.id), invalidA, invalidB],
        supplierId: supplier.id,
        businessDate: "2026-09-08",
        batchKey,
      });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("Cannot send DAG batch.");
      expect(message).toContain(invalidA);
      expect(message).toContain(invalidB);
    }

    const posted = await db
      .select({
        id: stockDocuments.id,
        idempotencyKey: stockDocuments.idempotencyKey,
      })
      .from(stockDocuments);
    expect(
      posted.filter((row) => row.idempotencyKey?.includes(batchKey)),
    ).toHaveLength(0);
  }, 360_000);

  it("replays the same DAG OUT batch without duplicating documents", async () => {
    const { sendTyresToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { dagDocumentIdempotencyKey } =
      await import("../../app/features/workshop/dag-batch");
    const { admin, supplier, lives, db, tyres, stockDocuments } =
      await servicedLives("batchid", 1);
    const batchKey = crypto.randomUUID();
    const payload = {
      tyreIds: [lives[0]!.id],
      supplierId: supplier.id,
      businessDate: "2026-09-08",
      batchKey,
    };

    await sendTyresToDag(admin, payload);
    await sendTyresToDag(admin, payload);

    const docs = await db
      .select({ id: stockDocuments.id })
      .from(stockDocuments)
      .where(
        eq(
          stockDocuments.idempotencyKey,
          dagDocumentIdempotencyKey("DAG_OUT", batchKey, lives[0]!.id),
        ),
      );
    expect(docs).toHaveLength(1);
    const [after] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.id, lives[0]!.id));
    expect(after?.status).toBe("AT_DAG");
  }, 360_000);

  it("lets only one of two users send the same tyre to DAG", async () => {
    const { sendTyreToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { admin, supplier, lives, db, tyres, tag } =
      await servicedLives("twouser", 1);
    const { users } = await import("../../app/db/schema");
    const [other] = await db
      .insert(users)
      .values({
        email: `dag-user-${tag}@test.local`,
        displayName: "Other DAG admin",
        role: "ADMIN",
        passwordHash: admin.passwordHash,
        mustChangePassword: false,
      })
      .returning();

    try {
      const raced = await Promise.allSettled([
        sendTyreToDag(admin, {
          tyreId: lives[0]!.id,
          supplierId: supplier.id,
          businessDate: "2026-09-08",
          idempotencyKey: `two-a-${tag}-aaaaaaaa`,
        }),
        sendTyreToDag(other!, {
          tyreId: lives[0]!.id,
          supplierId: supplier.id,
          businessDate: "2026-09-08",
          idempotencyKey: `two-b-${tag}-aaaaaaaa`,
        }),
      ]);
      expect(raced.filter((row) => row.status === "fulfilled")).toHaveLength(1);
      expect(raced.filter((row) => row.status === "rejected")).toHaveLength(1);
      const [after] = await db
        .select()
        .from(tyres)
        .where(eq(tyres.id, lives[0]!.id));
      expect(after?.status).toBe("AT_DAG");
    } finally {
      try {
        await db.delete(users).where(eq(users.id, other!.id));
      } catch {
        await db
          .update(users)
          .set({ status: "DISABLED" })
          .where(eq(users.id, other!.id));
      }
    }
  }, 360_000);

  it("posts no DAG IN documents when a serial cannot be received", async () => {
    const { receiveTyresFromDag, sendTyresToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { WorkshopError } =
      await import("../../app/features/workshop/errors");
    const { dagDocumentIdempotencyKey } =
      await import("../../app/features/workshop/dag-batch");
    const { admin, supplier, lives, db, tyres, stockDocuments } =
      await servicedLives("batchin", 2);
    const outKey = crypto.randomUUID();
    await sendTyresToDag(admin, {
      tyreIds: lives.map((row) => row.id),
      supplierId: supplier.id,
      businessDate: "2026-09-08",
      batchKey: outKey,
    });

    const inKey = crypto.randomUUID();
    await receiveTyresFromDag(admin, {
      tyreIds: [lives[0]!.id],
      businessDate: "2026-09-08",
      batchKey: inKey,
    });

    const secondKey = crypto.randomUUID();
    await expect(
      receiveTyresFromDag(admin, {
        tyreIds: lives.map((row) => row.id),
        businessDate: "2026-09-08",
        batchKey: secondKey,
      }),
    ).rejects.toBeInstanceOf(WorkshopError);

    try {
      await receiveTyresFromDag(admin, {
        tyreIds: lives.map((row) => row.id),
        businessDate: "2026-09-08",
        batchKey: secondKey,
      });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("Cannot receive DAG batch.");
      expect(message).toContain(lives[0]!.serialNumber);
      expect(message).toMatch(/already received/);
    }

    const docs = await db
      .select({
        id: stockDocuments.id,
        idempotencyKey: stockDocuments.idempotencyKey,
      })
      .from(stockDocuments);
    expect(
      docs.filter((row) =>
        row.idempotencyKey?.includes(
          dagDocumentIdempotencyKey("DAG_IN", secondKey, lives[1]!.id),
        ),
      ),
    ).toHaveLength(0);
    const [stillOut] = await db
      .select()
      .from(tyres)
      .where(eq(tyres.id, lives[1]!.id));
    expect(stillOut?.status).toBe("AT_DAG");
  }, 360_000);

  it("names every serial when DAG IN return SKUs are ambiguous", async () => {
    const { receiveTyresFromDag, sendTyresToDag } =
      await import("../../app/features/workshop/tyres.server");
    const { WorkshopError } =
      await import("../../app/features/workshop/errors");
    const { admin, supplier, lives, db, stockDocuments } =
      await servicedLives("ambsku", 2);
    const { parts } = await import("../../app/db/schema");
    const [dag1] = await db
      .select()
      .from(parts)
      .where(eq(parts.sku, "TR-DAG1-295"))
      .limit(1);
    expect(dag1).toBeTruthy();

    const outKey = crypto.randomUUID();
    await sendTyresToDag(admin, {
      tyreIds: lives.map((row) => row.id),
      supplierId: supplier.id,
      businessDate: "2026-09-08",
      batchKey: outKey,
    });

    const [extra] = await db
      .insert(parts)
      .values({
        sku: `TR-DAG1-AMB-${crypto.randomUUID().slice(0, 8)}`,
        name: "Ambiguous DAG1 return",
        categoryId: dag1!.categoryId,
      })
      .returning({ id: parts.id });

    const inKey = crypto.randomUUID();
    try {
      await expect(
        receiveTyresFromDag(admin, {
          tyreIds: lives.map((row) => row.id),
          businessDate: "2026-09-08",
          batchKey: inKey,
        }),
      ).rejects.toBeInstanceOf(WorkshopError);
      try {
        await receiveTyresFromDag(admin, {
          tyreIds: lives.map((row) => row.id),
          businessDate: "2026-09-08",
          batchKey: inKey,
        });
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("Cannot receive DAG batch.");
        expect(message).toContain(lives[0]!.serialNumber);
        expect(message).toContain(lives[1]!.serialNumber);
        expect(message).toMatch(/more than one DAG return SKU/);
      }
      const posted = await db
        .select({ idempotencyKey: stockDocuments.idempotencyKey })
        .from(stockDocuments);
      expect(
        posted.filter((row) => row.idempotencyKey?.includes(inKey)),
      ).toHaveLength(0);
    } finally {
      if (extra) await db.delete(parts).where(eq(parts.id, extra.id));
    }
  }, 360_000);
});
