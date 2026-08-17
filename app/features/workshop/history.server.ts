import { and, desc, eq } from "drizzle-orm";

import { db } from "~/db/client.server";
import {
  buses,
  jobCards,
  oilChanges,
  parts,
  stockDocumentLines,
  stockDocuments,
  stores,
  tyreEvents,
  tyres,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";
import { getFittedTyres } from "./queries.server";

export async function getBusHistory(actor: Actor, busId: string) {
  const ids = await getAuthorizedStoreIds(actor);
  const [bus] = await db
    .select({
      id: buses.id,
      fleetNumber: buses.fleetNumber,
      registrationNumber: buses.registrationNumber,
      make: buses.make,
      model: buses.model,
      status: buses.status,
      active: buses.active,
    })
    .from(buses)
    .where(eq(buses.id, busId))
    .limit(1);
  if (!bus) return null;

  const [fitted, cards, issues, tyreRows, oilRows] = await Promise.all([
    getFittedTyres(bus.id),
    db
      .select({
        id: jobCards.id,
        jobNumber: jobCards.jobNumber,
        status: jobCards.status,
        businessDate: jobCards.businessDate,
        odometerKm: jobCards.odometerKm,
        complaint: jobCards.complaint,
        store: stores.name,
      })
      .from(jobCards)
      .innerJoin(stores, eq(jobCards.storeId, stores.id))
      .where(
        and(
          eq(jobCards.busId, bus.id),
          scopedStoreCondition(jobCards.storeId, ids),
        ),
      )
      .orderBy(desc(jobCards.businessDate), desc(jobCards.openedAt)),
    db
      .select({
        id: stockDocuments.id,
        number: stockDocuments.documentNumber,
        type: stockDocuments.type,
        date: stockDocuments.businessDate,
        sku: parts.sku,
        part: parts.name,
        quantity: stockDocumentLines.quantity,
        jobCardId: stockDocuments.jobCardId,
      })
      .from(stockDocumentLines)
      .innerJoin(
        stockDocuments,
        eq(stockDocumentLines.documentId, stockDocuments.id),
      )
      .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
      .where(
        and(
          eq(stockDocuments.busId, bus.id),
          scopedStoreCondition(stockDocuments.storeId, ids),
        ),
      )
      .orderBy(desc(stockDocuments.businessDate)),
    db
      .select({
        id: tyreEvents.id,
        type: tyreEvents.type,
        serialNumber: tyres.serialNumber,
        occurredAt: tyreEvents.occurredAt,
        fromPosition: tyreEvents.fromPosition,
        toPosition: tyreEvents.toPosition,
        fromStage: tyreEvents.fromStage,
        toStage: tyreEvents.toStage,
        jobCardId: tyreEvents.jobCardId,
      })
      .from(tyreEvents)
      .innerJoin(tyres, eq(tyreEvents.tyreId, tyres.id))
      .where(eq(tyreEvents.busId, bus.id))
      .orderBy(desc(tyreEvents.occurredAt)),
    db
      .select({
        id: oilChanges.id,
        litres: oilChanges.litres,
        sku: parts.sku,
        part: parts.name,
        odometerKm: oilChanges.odometerKm,
        businessDate: oilChanges.businessDate,
        jobCardId: oilChanges.jobCardId,
      })
      .from(oilChanges)
      .innerJoin(parts, eq(oilChanges.partId, parts.id))
      .where(eq(oilChanges.busId, bus.id))
      .orderBy(desc(oilChanges.businessDate), desc(oilChanges.createdAt)),
  ]);

  const lastOil = oilRows[0] ?? null;
  const lastOdometer =
    cards.find((card) => card.odometerKm)?.odometerKm ?? null;

  const timeline = [
    ...cards.map((card) => ({
      sort: card.businessDate,
      kind: "job_card" as const,
      card,
    })),
    ...oilRows.map((row) => ({
      sort: row.businessDate,
      kind: "oil" as const,
      oil: row,
    })),
    ...tyreRows.map((row) => ({
      sort: row.occurredAt.toISOString().slice(0, 10),
      kind: "tyre" as const,
      tyre: row,
    })),
    ...issues.map((row) => ({
      sort: row.date,
      kind: "stock" as const,
      stock: row,
    })),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  return {
    bus,
    fitted,
    lastOil,
    lastOdometer,
    cards,
    timeline,
  };
}
