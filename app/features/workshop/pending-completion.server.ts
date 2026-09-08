import { and, eq } from "drizzle-orm";

import { auditEvents, oilChanges, tyreEvents, tyres } from "~/db/schema";
import {
  getReturnableQuantitiesByPart,
  postStockInTransaction,
  prepareStockCommand,
  type Transaction,
} from "~/features/inventory/posting.server";
import type { Actor } from "~/lib/auth/authorization.server";
import {
  LIFECYCLE_CONFLICT,
  WorkshopConflictError,
  WorkshopError,
} from "./errors";
import { parseWorkshopNotes } from "./pending-notes";
import { lockTyre, loadTyreLifecycleEvents } from "./tyre-lock.server";
import { getTyreLifecycleActions } from "./tyre-lifecycle";

export async function revertPendingWorkshopIssue(
  tx: Transaction,
  documentId: string,
) {
  await tx.delete(oilChanges).where(eq(oilChanges.stockDocumentId, documentId));
}

export async function completePendingWorkshopIssue(
  tx: Transaction,
  actor: Actor,
  document: {
    id: string;
    notes: string | null;
    storeId: string;
    busId: string | null;
    jobCardId: string | null;
    businessDate: string;
  },
) {
  const payload = parseWorkshopNotes(document.notes);
  if (!payload || payload.kind !== "TYRE_FIT") return;
  if (!document.jobCardId || !document.busId) {
    throw new WorkshopError("Pending tyre fit is missing job card details");
  }

  const incoming = await lockTyre(tx, payload.tyreId);
  if (!incoming) throw new WorkshopError("Tyre not found");
  const incomingEvents = await loadTyreLifecycleEvents(tx, incoming.id);
  if (
    !getTyreLifecycleActions({
      tyreId: incoming.id,
      stage: incoming.lifecycleStage,
      status: incoming.status,
      events: incomingEvents,
    }).canFit
  ) {
    throw new WorkshopConflictError(LIFECYCLE_CONFLICT);
  }
  if (incoming.storeId !== document.storeId) {
    throw new WorkshopError(
      "Reserved tyre is no longer in stock at this store",
    );
  }

  let occupantId = payload.occupantId;
  if (!occupantId) {
    const [occupant] = await tx
      .select()
      .from(tyres)
      .where(
        and(
          eq(tyres.currentBusId, document.busId),
          eq(tyres.currentPosition, payload.position),
          eq(tyres.status, "FITTED"),
        ),
      )
      .limit(1);
    occupantId = occupant?.id;
  }

  let removedDocumentId: string | undefined;
  if (occupantId) {
    const occupant = await lockTyre(tx, occupantId);
    if (!occupant) throw new WorkshopError("Occupant tyre not found");

    const returnable = await getReturnableQuantitiesByPart(
      tx,
      document.jobCardId,
    );
    const available = returnable.get(occupant.partId)?.available;
    const canReturnStock =
      available != null && available.greaterThanOrEqualTo(1);

    if (canReturnStock) {
      const returned = await postStockInTransaction(
        tx,
        actor,
        "BUS_RETURN",
        prepareStockCommand("BUS_RETURN", {
          storeId: document.storeId,
          busId: document.busId,
          jobCardId: document.jobCardId,
          businessDate: document.businessDate,
          notes: `Tyre ${occupant.serialNumber} removed from ${payload.position}`,
          idempotencyKey: `${document.id}-remove`,
          lines: [{ partId: occupant.partId, quantity: "1" }],
        }),
      );
      removedDocumentId = returned.id;
    }

    await tx
      .update(tyres)
      .set({
        status: "IN_STORE",
        storeId: document.storeId,
        currentBusId: null,
        currentPosition: null,
      })
      .where(eq(tyres.id, occupant.id));
    await tx.insert(tyreEvents).values({
      tyreId: occupant.id,
      type: "REMOVE",
      jobCardId: document.jobCardId,
      stockDocumentId: removedDocumentId || null,
      storeId: document.storeId,
      busId: document.busId,
      fromPosition: payload.position,
      fromStage: occupant.lifecycleStage,
      notes: canReturnStock
        ? null
        : "Serial returned to warehouse; stock already returned on this job card",
      createdBy: actor.id,
    });
  }

  await tx
    .update(tyres)
    .set({
      status: "FITTED",
      storeId: null,
      currentBusId: document.busId,
      currentPosition: payload.position,
    })
    .where(eq(tyres.id, incoming.id));

  await tx.insert(tyreEvents).values({
    tyreId: incoming.id,
    type: occupantId ? "REPLACE" : "FIT",
    jobCardId: document.jobCardId,
    stockDocumentId: document.id,
    storeId: document.storeId,
    busId: document.busId,
    toPosition: payload.position,
    toStage: incoming.lifecycleStage,
    notes: occupantId ? `Replaced occupant ${occupantId}` : null,
    createdBy: actor.id,
  });

  await tx.insert(auditEvents).values({
    actorId: actor.id,
    eventType: occupantId ? "TYRE_REPLACED" : "TYRE_FITTED",
    entityType: "tyre",
    entityId: incoming.id,
    storeId: document.storeId,
    metadata: {
      serialNumber: incoming.serialNumber,
      position: payload.position,
      documentId: document.id,
      removedDocumentId,
    },
  });
}
