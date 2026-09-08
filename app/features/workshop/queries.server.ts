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
  suppliers,
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
import { parseWorkshopNotes } from "./pending-notes";
import { reservedTyreIds } from "./tyre-lock.server";
import {
  getTyreLifecycleActions,
  type TyreLifecycleActions,
  type TyreLifecycleEvent,
} from "./tyre-lifecycle";

const LIST_LIMIT = 200;

async function lifecycleEventsForTyres(tyreIds: string[]) {
  if (tyreIds.length === 0) return [] as TyreLifecycleEvent[];
  return db
    .select({
      tyreId: tyreEvents.tyreId,
      type: tyreEvents.type,
      sequence: tyreEvents.sequence,
    })
    .from(tyreEvents)
    .where(inArray(tyreEvents.tyreId, tyreIds))
    .orderBy(asc(tyreEvents.sequence));
}

export async function attachLifecycleActions<
  T extends { id: string; stage: string; status: string },
>(rows: T[]): Promise<Array<T & { actions: TyreLifecycleActions }>> {
  const [events, reserved] = await Promise.all([
    lifecycleEventsForTyres(rows.map((row) => row.id)),
    reservedTyreIds(db),
  ]);
  return rows.map((row) => ({
    ...row,
    actions: getTyreLifecycleActions({
      tyreId: row.id,
      stage: row.stage,
      status: row.status,
      events,
      reserved: reserved.has(row.id),
    }),
  }));
}

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

export async function getPendingJobCards(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  return db
    .select({
      id: jobCards.id,
      jobNumber: jobCards.jobNumber,
      storeId: jobCards.storeId,
      store: stores.name,
      storeCode: stores.code,
      busId: jobCards.busId,
      fleetNumber: buses.fleetNumber,
      registrationNumber: buses.registrationNumber,
      businessDate: jobCards.businessDate,
      odometerKm: jobCards.odometerKm,
      complaint: jobCards.complaint,
      mechanicName: jobCards.mechanicName,
      createdBy: users.displayName,
      openedAt: jobCards.openedAt,
    })
    .from(jobCards)
    .innerJoin(stores, eq(jobCards.storeId, stores.id))
    .innerJoin(buses, eq(jobCards.busId, buses.id))
    .innerJoin(users, eq(jobCards.openedBy, users.id))
    .where(
      and(
        eq(jobCards.status, "PENDING_APPROVAL"),
        scopedStoreCondition(jobCards.storeId, ids),
      ),
    )
    .orderBy(desc(jobCards.openedAt));
}

export async function countPendingJobCards(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(jobCards)
    .where(
      and(
        eq(jobCards.status, "PENDING_APPROVAL"),
        scopedStoreCondition(jobCards.storeId, ids),
      ),
    );
  return Number(row?.count ?? 0);
}

export async function listJobCards(
  actor: Actor,
  filters?: {
    status?: "PENDING_APPROVAL" | "OPEN" | "REJECTED" | "CLOSED" | "CANCELLED";
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
          status: stockDocuments.status,
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
          tyreId: tyreEvents.tyreId,
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
          documentStatus: stockDocuments.status,
        })
        .from(oilChanges)
        .innerJoin(parts, eq(oilChanges.partId, parts.id))
        .leftJoin(
          stockDocuments,
          eq(oilChanges.stockDocumentId, stockDocuments.id),
        )
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

  const pendingFitNotes = await db
    .select({ notes: stockDocuments.notes })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.jobCardId, card.id),
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
      ),
    );
  const reserved = new Set(
    pendingFitNotes.flatMap((row) => {
      const payload = parseWorkshopNotes(row.notes);
      return payload?.kind === "TYRE_FIT" ? [payload.tyreId] : [];
    }),
  );

  const removedIds = [
    ...new Set(
      tyreRows.filter((row) => row.type === "REMOVE").map((row) => row.tyreId),
    ),
  ];
  const removedWarehouseRows =
    removedIds.length === 0
      ? []
      : await db
          .select({
            id: tyres.id,
            serialNumber: tyres.serialNumber,
            sku: parts.sku,
            stage: tyres.lifecycleStage,
            status: tyres.status,
          })
          .from(tyres)
          .innerJoin(parts, eq(tyres.partId, parts.id))
          .where(
            and(inArray(tyres.id, removedIds), eq(tyres.status, "IN_STORE")),
          );
  const removedWarehouse = await attachLifecycleActions(removedWarehouseRows);

  return {
    ...card,
    documents,
    tyreEvents: tyreRows,
    oilChanges: oilRows,
    storeTyres: storeTyres.filter((tyre) => !reserved.has(tyre.id)),
    oilParts,
    fitted,
    removedWarehouse,
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
  filters?: {
    status?: string;
    serial?: string;
    stage?: string;
    storeId?: string;
    busId?: string;
    sku?: string;
  },
) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
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
      busId: tyres.currentBusId,
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
              filters.status as
                | "IN_STORE"
                | "FITTED"
                | "AT_DAG"
                | "IN_TRANSIT"
                | "DISPOSED"
                | "SCRAPPED",
            )
          : undefined,
        filters?.stage
          ? eq(
              tyres.lifecycleStage,
              filters.stage as
                "ORG" | "DAG1" | "DAG2" | "DAG3" | "REBUILD" | "SCRAP",
            )
          : undefined,
        filters?.serial
          ? sql`${tyres.serialNumber} ilike ${`%${filters.serial}%`}`
          : undefined,
        filters?.storeId ? eq(tyres.storeId, filters.storeId) : undefined,
        filters?.busId ? eq(tyres.currentBusId, filters.busId) : undefined,
        filters?.sku
          ? sql`${parts.sku} ilike ${`%${filters.sku}%`}`
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
  return attachLifecycleActions(rows);
}

export async function getTyreRegisterCounts(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
    .select({
      stage: tyres.lifecycleStage,
      status: tyres.status,
      count: sql<number>`count(*)::int`,
    })
    .from(tyres)
    .where(
      ids === null
        ? undefined
        : ids.length === 0
          ? sql`false`
          : or(inArray(tyres.storeId, ids), eq(tyres.status, "FITTED")),
    )
    .groupBy(tyres.lifecycleStage, tyres.status);

  const counts = {
    totalActive: 0,
    ORG: 0,
    DAG1: 0,
    DAG2: 0,
    DAG3: 0,
    atDag: 0,
    disposed: 0,
  };
  for (const row of rows) {
    const n = Number(row.count);
    if (row.status === "DISPOSED" || row.status === "SCRAPPED") {
      counts.disposed += n;
      continue;
    }
    counts.totalActive += n;
    if (row.status === "AT_DAG") {
      counts.atDag += n;
      continue;
    }
    if (row.stage === "ORG") counts.ORG += n;
    if (row.stage === "DAG1") counts.DAG1 += n;
    if (row.stage === "DAG2") counts.DAG2 += n;
    if (row.stage === "DAG3") counts.DAG3 += n;
  }
  return counts;
}

export async function getTyreDetail(actor: Actor, tyreId: string) {
  const ids = await getAuthorizedStoreIds(actor);
  const [tyre] = await db
    .select({
      id: tyres.id,
      serialNumber: tyres.serialNumber,
      sku: parts.sku,
      part: parts.name,
      stage: tyres.lifecycleStage,
      status: tyres.status,
      store: stores.name,
      storeCode: stores.code,
      storeId: tyres.storeId,
      fleetNumber: buses.fleetNumber,
      registrationNumber: buses.registrationNumber,
      busId: tyres.currentBusId,
      position: tyres.currentPosition,
      notes: tyres.notes,
      createdAt: tyres.createdAt,
    })
    .from(tyres)
    .innerJoin(parts, eq(tyres.partId, parts.id))
    .leftJoin(stores, eq(tyres.storeId, stores.id))
    .leftJoin(buses, eq(tyres.currentBusId, buses.id))
    .where(
      and(
        eq(tyres.id, tyreId),
        ids === null
          ? undefined
          : ids.length === 0
            ? sql`false`
            : or(inArray(tyres.storeId, ids), eq(tyres.status, "FITTED")),
      ),
    )
    .limit(1);
  if (!tyre) return null;

  const events = await db
    .select({
      id: tyreEvents.id,
      type: tyreEvents.type,
      sequence: tyreEvents.sequence,
      occurredAt: tyreEvents.occurredAt,
      fromStage: tyreEvents.fromStage,
      toStage: tyreEvents.toStage,
      fromPosition: tyreEvents.fromPosition,
      toPosition: tyreEvents.toPosition,
      odometerKm: tyreEvents.odometerKm,
      notes: tyreEvents.notes,
      store: stores.code,
      fleetNumber: buses.fleetNumber,
      documentNumber: stockDocuments.documentNumber,
      actor: users.displayName,
    })
    .from(tyreEvents)
    .leftJoin(stores, eq(tyreEvents.storeId, stores.id))
    .leftJoin(buses, eq(tyreEvents.busId, buses.id))
    .leftJoin(stockDocuments, eq(tyreEvents.stockDocumentId, stockDocuments.id))
    .innerJoin(users, eq(tyreEvents.createdBy, users.id))
    .where(eq(tyreEvents.tyreId, tyreId))
    .orderBy(asc(tyreEvents.sequence));

  const reserved = await reservedTyreIds(db);
  const actions = getTyreLifecycleActions({
    tyreId: tyre.id,
    stage: tyre.stage,
    status: tyre.status,
    events: events.map((event) => ({
      tyreId,
      type: event.type,
      sequence: event.sequence,
    })),
    reserved: reserved.has(tyre.id),
  });

  return { ...tyre, events, actions };
}

export async function listTyresAtDag(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
    .select({
      id: tyres.id,
      serialNumber: tyres.serialNumber,
      sku: parts.sku,
      part: parts.name,
      stage: tyres.lifecycleStage,
      store: stores.code,
      storeId: tyres.storeId,
    })
    .from(tyres)
    .innerJoin(parts, eq(tyres.partId, parts.id))
    .innerJoin(stores, eq(tyres.storeId, stores.id))
    .where(
      and(eq(tyres.status, "AT_DAG"), scopedStoreCondition(tyres.storeId, ids)),
    )
    .orderBy(asc(tyres.serialNumber));

  const enriched = await Promise.all(
    rows.map(async (tyre) => {
      const [send] = await db
        .select({
          documentId: stockDocuments.id,
          documentNumber: stockDocuments.documentNumber,
          supplier: suppliers.name,
          businessDate: stockDocuments.businessDate,
          fromStage: tyreEvents.fromStage,
        })
        .from(tyreEvents)
        .innerJoin(
          stockDocuments,
          eq(tyreEvents.stockDocumentId, stockDocuments.id),
        )
        .leftJoin(suppliers, eq(stockDocuments.supplierId, suppliers.id))
        .where(
          and(eq(tyreEvents.tyreId, tyre.id), eq(tyreEvents.type, "SEND_DAG")),
        )
        .orderBy(desc(tyreEvents.sequence))
        .limit(1);
      return {
        ...tyre,
        sendDocumentNumber: send?.documentNumber ?? null,
        sendDocumentId: send?.documentId ?? null,
        supplier: send?.supplier ?? null,
        sentDate: send?.businessDate ?? null,
        sentStage: send?.fromStage ?? tyre.stage,
      };
    }),
  );
  return enriched;
}

export async function listInStoreTyres(actor: Actor) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
    .select({
      id: tyres.id,
      serialNumber: tyres.serialNumber,
      sku: parts.sku,
      stage: tyres.lifecycleStage,
      status: tyres.status,
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
  return attachLifecycleActions(rows);
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
      .where(and(eq(buses.active, true), eq(buses.status, "ACTIVE")))
      .orderBy(asc(buses.fleetNumber)),
  ]);
  return { stores: storeRows, buses: busRows };
}

export async function getDagOutSummary(
  actor: Actor,
  filters?: {
    supplierId?: string;
    storeId?: string;
    sentFrom?: string;
    sentTo?: string;
  },
) {
  const ids = await getAuthorizedStoreIds(actor);
  const sendEvents = db
    .selectDistinctOn([tyreEvents.tyreId], {
      tyreId: tyreEvents.tyreId,
      occurredAt: tyreEvents.occurredAt,
      documentId: tyreEvents.stockDocumentId,
    })
    .from(tyreEvents)
    .where(eq(tyreEvents.type, "SEND_DAG"))
    .orderBy(tyreEvents.tyreId, desc(tyreEvents.occurredAt))
    .as("send_events");

  const rows = await db
    .select({
      tyreId: tyres.id,
      serialNumber: tyres.serialNumber,
      stage: tyres.lifecycleStage,
      sku: parts.sku,
      store: stores.code,
      storeId: tyres.storeId,
      supplierId: suppliers.id,
      supplier: suppliers.name,
      sentAt: sendEvents.occurredAt,
      documentId: sendEvents.documentId,
    })
    .from(tyres)
    .innerJoin(parts, eq(tyres.partId, parts.id))
    .innerJoin(stores, eq(tyres.storeId, stores.id))
    .innerJoin(sendEvents, eq(sendEvents.tyreId, tyres.id))
    .leftJoin(stockDocuments, eq(stockDocuments.id, sendEvents.documentId))
    .leftJoin(suppliers, eq(stockDocuments.supplierId, suppliers.id))
    .where(
      and(
        eq(tyres.status, "AT_DAG"),
        scopedStoreCondition(tyres.storeId, ids),
        filters?.supplierId ? eq(suppliers.id, filters.supplierId) : undefined,
        filters?.storeId ? eq(tyres.storeId, filters.storeId) : undefined,
        filters?.sentFrom
          ? sql`${sendEvents.occurredAt}::date >= ${filters.sentFrom}`
          : undefined,
        filters?.sentTo
          ? sql`${sendEvents.occurredAt}::date <= ${filters.sentTo}`
          : undefined,
      ),
    )
    .orderBy(asc(suppliers.name), asc(tyres.serialNumber));

  const bySupplier = new Map<
    string,
    {
      supplierId: string | null;
      supplier: string;
      count: number;
      tyres: typeof rows;
    }
  >();
  for (const row of rows) {
    const key = row.supplierId ?? "unassigned";
    const current = bySupplier.get(key) ?? {
      supplierId: row.supplierId,
      supplier: row.supplier ?? "No supplier",
      count: 0,
      tyres: [],
    };
    current.count += 1;
    current.tyres.push(row);
    bySupplier.set(key, current);
  }
  return { groups: [...bySupplier.values()], total: rows.length };
}

export async function getTyreStockReport(
  actor: Actor,
  filters?: {
    storeId?: string;
    stage?: string;
    status?: string;
    sku?: string;
    supplierId?: string;
  },
) {
  const ids = await getAuthorizedStoreIds(actor);
  const rows = await db
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
      busId: tyres.currentBusId,
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
              filters.status as
                | "IN_STORE"
                | "FITTED"
                | "AT_DAG"
                | "IN_TRANSIT"
                | "DISPOSED"
                | "SCRAPPED",
            )
          : undefined,
        filters?.stage
          ? eq(
              tyres.lifecycleStage,
              filters.stage as
                "ORG" | "DAG1" | "DAG2" | "DAG3" | "REBUILD" | "SCRAP",
            )
          : undefined,
        filters?.storeId ? eq(tyres.storeId, filters.storeId) : undefined,
        filters?.sku
          ? sql`${parts.sku} ilike ${`%${filters.sku}%`}`
          : undefined,
        ids === null
          ? undefined
          : ids.length === 0
            ? sql`false`
            : or(inArray(tyres.storeId, ids), eq(tyres.status, "FITTED")),
      ),
    )
    .orderBy(asc(tyres.serialNumber));

  let filtered = rows;

  if (filters?.supplierId) {
    const latestSend = db
      .selectDistinctOn([tyreEvents.tyreId], {
        tyreId: tyreEvents.tyreId,
        supplierId: stockDocuments.supplierId,
      })
      .from(tyreEvents)
      .innerJoin(
        stockDocuments,
        eq(tyreEvents.stockDocumentId, stockDocuments.id),
      )
      .where(eq(tyreEvents.type, "SEND_DAG"))
      .orderBy(tyreEvents.tyreId, desc(tyreEvents.occurredAt))
      .as("latest_send");

    const matches = await db
      .select({ tyreId: latestSend.tyreId })
      .from(latestSend)
      .where(eq(latestSend.supplierId, filters.supplierId));
    const supplierTyreIds = new Set(matches.map((row) => row.tyreId));
    filtered = filtered.filter((row) => supplierTyreIds.has(row.id));
  }

  const kpis = {
    active: 0,
    warehouse: 0,
    onBuses: 0,
    atDag: 0,
    disposed: 0,
  };
  const stageTotals: Record<string, number> = {
    ORG: 0,
    DAG1: 0,
    DAG2: 0,
    DAG3: 0,
  };
  const matrix: Record<
    string,
    { warehouse: number; onBus: number; atDag: number; total: number }
  > = {};
  for (const stage of ["ORG", "DAG1", "DAG2", "DAG3"]) {
    matrix[stage] = { warehouse: 0, onBus: 0, atDag: 0, total: 0 };
  }

  for (const row of filtered) {
    if (row.status === "DISPOSED" || row.status === "SCRAPPED") {
      kpis.disposed += 1;
      continue;
    }
    kpis.active += 1;
    if (row.status === "IN_STORE") kpis.warehouse += 1;
    if (row.status === "FITTED") kpis.onBuses += 1;
    if (row.status === "AT_DAG") kpis.atDag += 1;
    if (row.stage in stageTotals) {
      stageTotals[row.stage] += 1;
    }
    if (matrix[row.stage]) {
      if (row.status === "IN_STORE") matrix[row.stage].warehouse += 1;
      if (row.status === "FITTED") matrix[row.stage].onBus += 1;
      if (row.status === "AT_DAG") matrix[row.stage].atDag += 1;
      if (
        row.status === "IN_STORE" ||
        row.status === "FITTED" ||
        row.status === "AT_DAG"
      ) {
        matrix[row.stage].total += 1;
      }
    }
  }

  const tyreIds = filtered.map((row) => row.id);
  const lastByTyre = new Map<string, { type: string; occurredAt: Date }>();
  if (tyreIds.length > 0) {
    const lastEvents = await db
      .selectDistinctOn([tyreEvents.tyreId], {
        tyreId: tyreEvents.tyreId,
        type: tyreEvents.type,
        occurredAt: tyreEvents.occurredAt,
      })
      .from(tyreEvents)
      .where(inArray(tyreEvents.tyreId, tyreIds))
      .orderBy(tyreEvents.tyreId, desc(tyreEvents.occurredAt));
    for (const event of lastEvents) {
      lastByTyre.set(event.tyreId, event);
    }
  }

  const detail = filtered.map((row) => {
    const last = lastByTyre.get(row.id);
    return {
      ...row,
      lastMovement: last
        ? `${last.type} · ${new Date(last.occurredAt).toLocaleDateString()}`
        : "—",
    };
  });

  return { kpis, stageTotals, matrix, detail };
}
