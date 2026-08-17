import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { stores, users } from "./auth";
import { idColumn, timestamps } from "./common";
import { buses, parts } from "./master-data";

export const jobCardStatus = pgEnum("job_card_status", [
  "OPEN",
  "CLOSED",
  "CANCELLED",
]);

export const tyreLifecycleStage = pgEnum("tyre_lifecycle_stage", [
  "ORG",
  "DAG1",
  "DAG2",
  "DAG3",
  "REBUILD",
  "SCRAP",
]);

export const tyreAssetStatus = pgEnum("tyre_asset_status", [
  "IN_STORE",
  "FITTED",
  "AT_DAG",
  "IN_TRANSIT",
  "DISPOSED",
  "SCRAPPED",
]);

export const tyrePosition = pgEnum("tyre_position", [
  "FL",
  "FR",
  "RLI",
  "RLO",
  "RRI",
  "RRO",
  "SPARE",
]);

export const tyreEventType = pgEnum("tyre_event_type", [
  "REGISTER",
  "FIT",
  "REMOVE",
  "REPLACE",
  "SEND_DAG",
  "RECEIVE_DAG",
  "SCRAP",
  "DISPOSE",
  "TRANSFER_OUT",
  "TRANSFER_IN",
]);

export const jobCardSequences = pgTable(
  "job_card_sequences",
  {
    storeId: uuid("store_id")
      .references(() => stores.id)
      .notNull(),
    year: integer("year").notNull(),
    nextValue: integer("next_value").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("job_card_sequences_store_year_unique").on(
      table.storeId,
      table.year,
    ),
  ],
);

export const jobCards = pgTable(
  "job_cards",
  {
    id: idColumn(),
    jobNumber: text("job_number").notNull(),
    storeId: uuid("store_id")
      .references(() => stores.id)
      .notNull(),
    busId: uuid("bus_id")
      .references(() => buses.id)
      .notNull(),
    status: jobCardStatus("status").default("OPEN").notNull(),
    businessDate: text("business_date").notNull(),
    odometerKm: numeric("odometer_km", { precision: 14, scale: 1 }),
    complaint: text("complaint").notNull(),
    workDone: text("work_done"),
    mechanicName: text("mechanic_name"),
    notes: text("notes"),
    openedBy: uuid("opened_by")
      .references(() => users.id)
      .notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("job_cards_number_unique").on(table.jobNumber),
    uniqueIndex("job_cards_one_open_per_bus")
      .on(table.busId)
      .where(sql`${table.status} = 'OPEN'`),
    index("job_cards_store_date_idx").on(table.storeId, table.businessDate),
    index("job_cards_bus_idx").on(table.busId),
  ],
);

export const tyres = pgTable(
  "tyres",
  {
    id: idColumn(),
    serialNumber: text("serial_number").notNull(),
    partId: uuid("part_id")
      .references(() => parts.id)
      .notNull(),
    lifecycleStage: tyreLifecycleStage("lifecycle_stage")
      .default("ORG")
      .notNull(),
    status: tyreAssetStatus("status").default("IN_STORE").notNull(),
    storeId: uuid("store_id").references(() => stores.id),
    currentBusId: uuid("current_bus_id").references(() => buses.id),
    currentPosition: tyrePosition("current_position"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tyres_serial_unique").on(table.serialNumber),
    uniqueIndex("tyres_fitted_position_unique")
      .on(table.currentBusId, table.currentPosition)
      .where(sql`${table.status} = 'FITTED'`),
    index("tyres_store_status_idx").on(table.storeId, table.status),
    index("tyres_bus_idx").on(table.currentBusId),
    check(
      "tyres_fitted_has_position",
      sql`(${table.status} = 'FITTED' AND ${table.currentBusId} IS NOT NULL AND ${table.currentPosition} IS NOT NULL)
        OR (${table.status} <> 'FITTED' AND ${table.currentBusId} IS NULL AND ${table.currentPosition} IS NULL)`,
    ),
    check(
      "tyres_in_store_has_store",
      sql`${table.status} <> 'IN_STORE' OR ${table.storeId} IS NOT NULL`,
    ),
    check(
      "tyres_in_transit_has_store",
      sql`${table.status} <> 'IN_TRANSIT' OR ${table.storeId} IS NOT NULL`,
    ),
  ],
);

export const tyreEvents = pgTable(
  "tyre_events",
  {
    id: idColumn(),
    tyreId: uuid("tyre_id")
      .references(() => tyres.id, { onDelete: "restrict" })
      .notNull(),
    type: tyreEventType("type").notNull(),
    jobCardId: uuid("job_card_id").references(() => jobCards.id),
    stockDocumentId: uuid("stock_document_id"),
    storeId: uuid("store_id").references(() => stores.id),
    busId: uuid("bus_id").references(() => buses.id),
    fromPosition: tyrePosition("from_position"),
    toPosition: tyrePosition("to_position"),
    fromStage: tyreLifecycleStage("from_stage"),
    toStage: tyreLifecycleStage("to_stage"),
    odometerKm: numeric("odometer_km", { precision: 14, scale: 1 }),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tyre_events_tyre_time_idx").on(table.tyreId, table.occurredAt),
    index("tyre_events_job_card_idx").on(table.jobCardId),
    index("tyre_events_bus_time_idx").on(table.busId, table.occurredAt),
  ],
);

export const oilChanges = pgTable(
  "oil_changes",
  {
    id: idColumn(),
    jobCardId: uuid("job_card_id")
      .references(() => jobCards.id)
      .notNull(),
    busId: uuid("bus_id")
      .references(() => buses.id)
      .notNull(),
    partId: uuid("part_id")
      .references(() => parts.id)
      .notNull(),
    stockDocumentId: uuid("stock_document_id"),
    litres: numeric("litres", { precision: 14, scale: 3 }).notNull(),
    odometerKm: numeric("odometer_km", { precision: 14, scale: 1 }),
    businessDate: text("business_date").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("oil_changes_bus_idx").on(table.busId),
    index("oil_changes_job_card_idx").on(table.jobCardId),
    check("oil_changes_litres_positive", sql`${table.litres} > 0`),
  ],
);
