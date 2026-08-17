import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import {
  buses,
  jobCards,
  oilChanges,
  partCategories,
  parts,
  stockDocumentLines,
  stockDocuments,
  stores,
  tyreEvents,
  tyres,
  users,
} from "~/db/schema";
import {
  getAuthorizedStoreIds,
  scopedStoreCondition,
  type Actor,
} from "~/lib/auth/authorization.server";
import { TYRE_POSITIONS, type TyrePosition } from "./constants";
import { nextDagStage } from "./tyre-lifecycle";

const LIST_LIMIT = 200;

export async function listOpenJobCards(
  actor: Actor,
  filters?: { storeId?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: jobCards.id,
      jobNumber: jobCards.jobNumber,
      storeId: jobCards.storeId,
      storeCode: stores.code,
      storeName: stores.name,
      busId: jobCards.busId,
      fleetNumber: buses.fleetNumber,
      registrationNumber: buses.registrationNumber,
      businessDate: jobCards.businessDate,
      odometerKm: jobCards.odometerKm,
    })
    .from(jobCards)
    .innerJoin(stores, eq(jobCards.storeId, stores.id))
    .innerJoin(buses, eq(jobCards.busId, buses.id))
    .where(
      and(
        eq(jobCards.status, "OPEN"),
        scopedStoreCondition(jobCards.storeId, ids),
        filters?.storeId ? eq(jobCards.storeId, filters.storeId) : undefined,
      ),
    )
    .orderBy(desc(jobCards.openedAt));
}

export async function listJobCards(
  actor: Actor,
  filters?: {
    status?: "OPEN" | "CLOSED" | "CANCELLED";
    bus?: string;
    start?: string;
    end?: string;
  },
) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
    .select({
      id: jobCards.id,
      jobNumber: jobCards.jobNumber,
      status: jobCards.status,
      store: stores.name,
      storeCode: stores.code,
      fleetNumber: buses.fleetNumber,
      registrationNumber: buses.registrationNumber,
      businessDate: jobCards.businessDate,
      complaint: jobCards.complaint,
      mechanicName: jobCards.mechanicName,
    })
    .from(jobCards)
    .innerJoin(stores, eq(jobCards.storeId, stores.id))
    .innerJoin(buses, eq(jobCards.busId, buses.id))
    .where(
      and(
        scopedStoreCondition(jobCards.storeId, ids),
        filters?.status ? eq(jobCards.status, filters.status) : undefined,
        filters?.bus ? eq(buses.fleetNumber, filters.bus) : undefined,
        filters?.start
          ? sql`${jobCards.businessDate} >= ${filters.start}`
          : undefined,
        filters?.end
          ? sql`${jobCards.businessDate} <= ${filters.end}`
          : undefined,
      ),
    )
    .orderBy(desc(jobCards.businessDate), desc(jobCards.openedAt))
    .limit(LIST_LIMIT);
  return rows;
}

export async function getJobCardDetail(actor: Actor, id: string) {
  const ids = await getAuthorizedStoreIds(actor);
  const [card] = await db
    .select({
      id: jobCards.id,
      jobNumber: jobCards.jobNumber,
      status: jobCards.status,
      storeId: jobCards.storeId,
      store: stores.name,
      storeCode: stores.code,
      busId: jobCards.busId,
      fleetNumber: buses.fleetNumber,
      registrationNumber: buses.registrationNumber,
      make: buses.make,
      model: buses.model,
      businessDate: jobCards.businessDate,
      odometerKm: jobCards.odometerKm,
      complaint: jobCards.complaint,
      workDone: jobCards.workDone,
      mechanicName: jobCards.mechanicName,
      notes: jobCards.notes,
      openedAt: jobCards.openedAt,
      openedBy: users.displayName,
      closedAt: jobCards.closedAt,
    })
    .from(jobCards)
    .innerJoin(stores, eq(jobCards.storeId, stores.id))
    .innerJoin(buses, eq(jobCards.busId, buses.id))
    .innerJoin(users, eq(jobCards.openedBy, users.id))
    .where(
      and(eq(jobCards.id, id), scopedStoreCondition(jobCards.storeId, ids)),
    )
    .limit(1);
  if (!card) return null;

  const [documents, tyreRows, oilRows, storeTyres, oilParts, fitted] =
    await Promise.all([
      db
        .select({
          id: stockDocuments.id,
          number: stockDocuments.documentNumber,
          type: stockDocuments.type,
          date: stockDocuments.businessDate,
          sku: parts.sku,
          part: parts.name,
          quantity: stockDocumentLines.quantity,
        })
        .from(stockDocumentLines)
        .innerJoin(
          stockDocuments,
          eq(stockDocumentLines.documentId, stockDocuments.id),
        )
        .innerJoin(parts, eq(stockDocumentLines.partId, parts.id))
        .where(eq(stockDocuments.jobCardId, card.id))
        .orderBy(asc(stockDocuments.postedAt)),
      db
        .select({
          id: tyreEvents.id,
          type: tyreEvents.type,
          serialNumber: tyres.serialNumber,
          occurredAt: tyreEvents.occurredAt,
          fromPosition: tyreEvents.fromPosition,
          toPosition: tyreEvents.toPosition,
        })
        .from(tyreEvents)
        .innerJoin(tyres, eq(tyreEvents.tyreId, tyres.id))
        .where(eq(tyreEvents.jobCardId, card.id))
        .orderBy(asc(tyreEvents.occurredAt)),
      db
        .select({
          id: oilChanges.id,
          litres: oilChanges.litres,
          sku: parts.sku,
          part: parts.name,
          odometerKm: oilChanges.odometerKm,
        })
        .from(oilChanges)
        .innerJoin(parts, eq(oilChanges.partId, parts.id))
        .where(eq(oilChanges.jobCardId, card.id)),
      db
        .select({
          id: tyres.id,
          serialNumber: tyres.serialNumber,
          sku: parts.sku,
          stage: tyres.lifecycleStage,
        })
        .from(tyres)
        .innerJoin(parts, eq(tyres.partId, parts.id))
        .where(
          and(eq(tyres.storeId, card.storeId), eq(tyres.status, "IN_STORE")),
        )
        .orderBy(asc(tyres.serialNumber)),
      listCategoryParts("OIL"),
      getFittedTyres(card.busId),
    ]);

  return {
    ...card,
    documents,
    tyreEvents: tyreRows,
    oilChanges: oilRows,
    storeTyres,
    oilParts,
    fitted,
  };
}

export async function listCategoryParts(code: "TYRE" | "OIL") {
  return db
    .select({
      id: parts.id,
      sku: parts.sku,
      name: parts.name,
      unit: parts.unit,
    })
    .from(parts)
    .innerJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .where(and(eq(partCategories.code, code), eq(parts.active, true)))
    .orderBy(asc(parts.sku));
}

export async function listTyres(
  actor: Actor,
  filters?: { status?: string; serial?: string },
) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: tyres.id,
      serialNumber: tyres.serialNumber,
      sku: parts.sku,
      part: parts.name,
      stage: tyres.lifecycleStage,
      status: tyres.status,
      store: stores.code,
      storeId: tyres.storeId,
      fleetNumber: buses.fleetNumber,
      position: tyres.currentPosition,
    })
    .from(tyres)
    .innerJoin(parts, eq(tyres.partId, parts.id))
    .leftJoin(stores, eq(tyres.storeId, stores.id))
    .leftJoin(buses, eq(tyres.currentBusId, buses.id))
    .where(
      and(
        filters?.status
          ? eq(
              tyres.status,
              filters.status as "IN_STORE" | "FITTED" | "AT_DAG" | "SCRAPPED",
            )
          : undefined,
        filters?.serial
          ? sql`${tyres.serialNumber} ilike ${`%${filters.serial}%`}`
          : undefined,
        ids === null
          ? undefined
          : ids.length === 0
            ? sql`false`
            : or(inArray(tyres.storeId, ids), eq(tyres.status, "FITTED")),
      ),
    )
    .orderBy(asc(tyres.serialNumber))
    .limit(LIST_LIMIT);
}

export async function listTyresAtDag(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: tyres.id,
      serialNumber: tyres.serialNumber,
      sku: parts.sku,
      part: parts.name,
      stage: tyres.lifecycleStage,
      nextStage: sql<string>`${tyres.lifecycleStage}`,
      store: stores.code,
      storeId: tyres.storeId,
    })
    .from(tyres)
    .innerJoin(parts, eq(tyres.partId, parts.id))
    .innerJoin(stores, eq(tyres.storeId, stores.id))
    .where(
      and(eq(tyres.status, "AT_DAG"), scopedStoreCondition(tyres.storeId, ids)),
    )
    .orderBy(asc(tyres.serialNumber))
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        nextStage: nextDagStage(row.stage),
      })),
    );
}

export async function listInStoreTyres(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: tyres.id,
      serialNumber: tyres.serialNumber,
      sku: parts.sku,
      stage: tyres.lifecycleStage,
      storeId: tyres.storeId,
      store: stores.code,
    })
    .from(tyres)
    .innerJoin(parts, eq(tyres.partId, parts.id))
    .innerJoin(stores, eq(tyres.storeId, stores.id))
    .where(
      and(
        eq(tyres.status, "IN_STORE"),
        scopedStoreCondition(tyres.storeId, ids),
      ),
    )
    .orderBy(asc(tyres.serialNumber));
}

export async function getFittedTyres(busId: string) {
  const rows = await db
    .select({
      id: tyres.id,
      serialNumber: tyres.serialNumber,
      sku: parts.sku,
      part: parts.name,
      stage: tyres.lifecycleStage,
      position: tyres.currentPosition,
    })
    .from(tyres)
    .innerJoin(parts, eq(tyres.partId, parts.id))
    .where(and(eq(tyres.currentBusId, busId), eq(tyres.status, "FITTED")));

  const byPosition = new Map<TyrePosition, (typeof rows)[number] | undefined>();
  for (const position of TYRE_POSITIONS) byPosition.set(position, undefined);
  for (const row of rows) {
    if (row.position) byPosition.set(row.position, row);
  }
  return TYRE_POSITIONS.map((position) => ({
    position,
    tyre: byPosition.get(position) ?? null,
  }));
}

export async function getJobCardFormOptions(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const [storeRows, busRows] = await Promise.all([
    db
      .select({
        id: stores.id,
        code: stores.code,
        name: stores.name,
      })
      .from(stores)
      .where(and(eq(stores.active, true), scopedStoreCondition(stores.id, ids)))
      .orderBy(asc(stores.code)),
    db
      .select({
        id: buses.id,
        fleetNumber: buses.fleetNumber,
        registrationNumber: buses.registrationNumber,
      })
      .from(buses)
      .where(eq(buses.active, true))
      .orderBy(asc(buses.fleetNumber)),
  ]);
  return { stores: storeRows, buses: busRows };
}
