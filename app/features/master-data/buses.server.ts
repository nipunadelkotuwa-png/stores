import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db/client.server";
import { auditEvents, buses, jobCards } from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { assertPermission } from "~/lib/auth/authorization.server";
import { BusLifecycleError, unresolvedJobCardsMessage } from "./bus-lifecycle";

const busIdSchema = z.string().uuid();

function requireBusAdmin(actor: Actor) {
  assertPermission(
    actor,
    "masterData.write",
    "Only administrators can change bus fleet status.",
  );
}

async function loadBus(busId: string) {
  if (!busIdSchema.safeParse(busId).success) {
    throw new BusLifecycleError("Invalid bus.");
  }
  const [bus] = await db
    .select({
      id: buses.id,
      status: buses.status,
      active: buses.active,
      fleetNumber: buses.fleetNumber,
    })
    .from(buses)
    .where(eq(buses.id, busId))
    .limit(1);
  if (!bus) throw new BusLifecycleError("Bus not found.");
  return bus;
}

export async function deactivateBus(actor: Actor, busId: string) {
  requireBusAdmin(actor);
  const bus = await loadBus(busId);
  if (bus.status === "SOLD") {
    throw new BusLifecycleError(
      "This bus has been sold. Use Restore to fleet instead of Activate/Deactivate.",
    );
  }
  if (bus.status === "INACTIVE") return bus;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(buses)
      .set({
        status: "INACTIVE",
        active: false,
      })
      .where(eq(buses.id, bus.id))
      .returning({ id: buses.id, status: buses.status });
    if (!updated) throw new BusLifecycleError("Unable to deactivate bus.");

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "BUS_DEACTIVATED",
      entityType: "bus",
      entityId: bus.id,
      metadata: { fleetNumber: bus.fleetNumber },
    });
    return updated;
  });
}

export async function activateBus(actor: Actor, busId: string) {
  requireBusAdmin(actor);
  const bus = await loadBus(busId);
  if (bus.status === "SOLD") {
    throw new BusLifecycleError(
      "This bus has been sold. Use Restore to fleet to return it to operations.",
    );
  }
  if (bus.status === "ACTIVE") return bus;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(buses)
      .set({
        status: "ACTIVE",
        active: true,
        soldAt: null,
        soldReason: null,
        soldByUserId: null,
      })
      .where(eq(buses.id, bus.id))
      .returning({ id: buses.id, status: buses.status });
    if (!updated) throw new BusLifecycleError("Unable to activate bus.");

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "BUS_ACTIVATED",
      entityType: "bus",
      entityId: bus.id,
      metadata: { fleetNumber: bus.fleetNumber },
    });
    return updated;
  });
}

export async function markBusSold(
  actor: Actor,
  busId: string,
  soldReason?: string,
) {
  requireBusAdmin(actor);
  const bus = await loadBus(busId);
  if (bus.status === "SOLD") {
    throw new BusLifecycleError("This bus is already marked as sold.");
  }

  const reason = soldReason?.trim() || null;

  return db.transaction(async (tx) => {
    const openCards = await tx
      .select({ jobNumber: jobCards.jobNumber })
      .from(jobCards)
      .where(
        and(
          eq(jobCards.busId, bus.id),
          inArray(jobCards.status, ["OPEN", "PENDING_APPROVAL"]),
        ),
      );
    if (openCards.length > 0) {
      throw new BusLifecycleError(
        unresolvedJobCardsMessage(openCards.map((card) => card.jobNumber)),
      );
    }

    const [updated] = await tx
      .update(buses)
      .set({
        status: "SOLD",
        active: false,
        soldAt: new Date(),
        soldReason: reason,
        soldByUserId: actor.id,
      })
      .where(eq(buses.id, bus.id))
      .returning({
        id: buses.id,
        status: buses.status,
        soldAt: buses.soldAt,
      });
    if (!updated) throw new BusLifecycleError("Unable to mark bus as sold.");

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "BUS_MARKED_SOLD",
      entityType: "bus",
      entityId: bus.id,
      metadata: { fleetNumber: bus.fleetNumber, soldReason: reason },
    });
    return updated;
  });
}

export async function restoreSoldBus(
  actor: Actor,
  busId: string,
  confirm: boolean,
) {
  requireBusAdmin(actor);
  if (!confirm) {
    throw new BusLifecycleError(
      "Confirm restore to fleet before returning a sold bus to operations.",
    );
  }
  const bus = await loadBus(busId);
  if (bus.status !== "SOLD") {
    throw new BusLifecycleError(
      "Only a sold bus can be restored to the fleet.",
    );
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(buses)
      .set({
        status: "ACTIVE",
        active: true,
        soldAt: null,
        soldReason: null,
        soldByUserId: null,
      })
      .where(eq(buses.id, bus.id))
      .returning({ id: buses.id, status: buses.status });
    if (!updated) throw new BusLifecycleError("Unable to restore bus.");

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "BUS_RESTORED",
      entityType: "bus",
      entityId: bus.id,
      metadata: { fleetNumber: bus.fleetNumber },
    });
    return updated;
  });
}
