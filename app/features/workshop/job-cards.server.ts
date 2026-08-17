import { and, eq, sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import {
  auditEvents,
  buses,
  jobCardSequences,
  jobCards,
  oilChanges,
  stockDocuments,
  stores,
  tyreEvents,
} from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { requireStoreAccess } from "~/lib/auth/authorization.server";
import type { Transaction } from "~/features/inventory/posting.server";
import { WorkshopError } from "./errors";
import { closeJobCardSchema, openJobCardSchema } from "./schemas";

async function nextJobNumber(
  tx: Transaction,
  storeId: string,
  businessDate: string,
) {
  const year = Number(businessDate.slice(0, 4));
  const [store] = await tx
    .select({ code: stores.code })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  if (!store) throw new WorkshopError("Store no longer exists");

  const numberPrefix = `JC-${store.code}-${year}-`;
  const [aggregate] = await tx
    .select({
      maxSeq: sql<number>`coalesce(max(cast(substring(${jobCards.jobNumber} from '[0-9]+$') as integer)), 0)`,
    })
    .from(jobCards)
    .where(
      and(
        eq(jobCards.storeId, storeId),
        sql`${jobCards.jobNumber} like ${`${numberPrefix}%`}`,
      ),
    );
  const startAt = Number(aggregate?.maxSeq ?? 0) + 1;

  await tx
    .insert(jobCardSequences)
    .values({ storeId, year, nextValue: startAt })
    .onConflictDoNothing();

  const [sequence] = await tx
    .update(jobCardSequences)
    .set({
      nextValue: sql`greatest(${jobCardSequences.nextValue}, ${startAt}) + 1`,
    })
    .where(
      and(
        eq(jobCardSequences.storeId, storeId),
        eq(jobCardSequences.year, year),
      ),
    )
    .returning({ value: sql<number>`${jobCardSequences.nextValue} - 1` });
  if (!sequence) throw new WorkshopError("Unable to allocate job card number");

  return `${numberPrefix}${String(sequence.value).padStart(6, "0")}`;
}

export async function loadOpenJobCard(tx: Transaction, jobCardId: string) {
  const [card] = await tx
    .select()
    .from(jobCards)
    .where(eq(jobCards.id, jobCardId))
    .limit(1);
  if (!card) throw new WorkshopError("Job card not found");
  if (card.status !== "OPEN") {
    throw new WorkshopError("Job card must be open");
  }
  return card;
}

export async function openJobCard(actor: Actor, input: unknown) {
  const command = openJobCardSchema.parse(input);
  await requireStoreAccess(actor, command.storeId);

  const [bus] = await db
    .select({ id: buses.id, active: buses.active })
    .from(buses)
    .where(eq(buses.id, command.busId))
    .limit(1);
  if (!bus || !bus.active) throw new WorkshopError("Bus is not available");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const [openExisting] = await tx
      .select({ id: jobCards.id, jobNumber: jobCards.jobNumber })
      .from(jobCards)
      .where(
        and(eq(jobCards.busId, command.busId), eq(jobCards.status, "OPEN")),
      )
      .limit(1);
    if (openExisting) {
      throw new WorkshopError(
        `Bus already has an open job card (${openExisting.jobNumber})`,
      );
    }

    const jobNumber = await nextJobNumber(
      tx,
      command.storeId,
      command.businessDate,
    );
    const [card] = await tx
      .insert(jobCards)
      .values({
        jobNumber,
        storeId: command.storeId,
        busId: command.busId,
        status: "OPEN",
        businessDate: command.businessDate,
        odometerKm: command.odometerKm,
        complaint: command.complaint,
        mechanicName: command.mechanicName || null,
        notes: command.notes || null,
        openedBy: actor.id,
      })
      .returning({
        id: jobCards.id,
        jobNumber: jobCards.jobNumber,
        storeId: jobCards.storeId,
      });

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "JOB_CARD_OPENED",
      entityType: "job_card",
      entityId: card.id,
      storeId: command.storeId,
      metadata: { jobNumber: card.jobNumber },
    });
    return card;
  });
}

export async function closeJobCard(actor: Actor, input: unknown) {
  const command = closeJobCardSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const card = await loadOpenJobCard(tx, command.jobCardId);
    await requireStoreAccess(actor, card.storeId);

    const [pending] = await tx
      .select({ id: stockDocuments.id })
      .from(stockDocuments)
      .where(
        and(
          eq(stockDocuments.jobCardId, card.id),
          eq(stockDocuments.status, "PENDING_APPROVAL"),
        ),
      )
      .limit(1);
    if (pending) {
      throw new WorkshopError(
        "Cannot close while a bus issue is awaiting approval",
      );
    }

    const [updated] = await tx
      .update(jobCards)
      .set({
        status: "CLOSED",
        workDone: command.workDone,
        closedBy: actor.id,
        closedAt: new Date(),
      })
      .where(and(eq(jobCards.id, card.id), eq(jobCards.status, "OPEN")))
      .returning({ id: jobCards.id, jobNumber: jobCards.jobNumber });
    if (!updated) throw new WorkshopError("Job card could not be closed");

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "JOB_CARD_CLOSED",
      entityType: "job_card",
      entityId: updated.id,
      storeId: card.storeId,
      metadata: { jobNumber: updated.jobNumber },
    });
    return updated;
  });
}

export async function cancelJobCard(actor: Actor, jobCardId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const card = await loadOpenJobCard(tx, jobCardId);
    await requireStoreAccess(actor, card.storeId);

    const [[stock], [tyre], [oil]] = await Promise.all([
      tx
        .select({ id: stockDocuments.id })
        .from(stockDocuments)
        .where(eq(stockDocuments.jobCardId, card.id))
        .limit(1),
      tx
        .select({ id: tyreEvents.id })
        .from(tyreEvents)
        .where(eq(tyreEvents.jobCardId, card.id))
        .limit(1),
      tx
        .select({ id: oilChanges.id })
        .from(oilChanges)
        .where(eq(oilChanges.jobCardId, card.id))
        .limit(1),
    ]);
    if (stock || tyre || oil) {
      throw new WorkshopError(
        "Job card has posted work and cannot be cancelled. Close it instead.",
      );
    }

    const [updated] = await tx
      .update(jobCards)
      .set({
        status: "CANCELLED",
        closedBy: actor.id,
        closedAt: new Date(),
      })
      .where(and(eq(jobCards.id, card.id), eq(jobCards.status, "OPEN")))
      .returning({ id: jobCards.id, jobNumber: jobCards.jobNumber });
    if (!updated) throw new WorkshopError("Job card could not be cancelled");

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "JOB_CARD_CANCELLED",
      entityType: "job_card",
      entityId: updated.id,
      storeId: card.storeId,
      metadata: { jobNumber: updated.jobNumber },
    });
    return updated;
  });
}
