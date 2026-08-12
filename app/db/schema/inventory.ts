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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { stores, users } from "./auth";
import { buses, parts, suppliers } from "./master-data";
import { idColumn, timestamps } from "./common";

export const stockDocumentType = pgEnum("stock_document_type", [
  "STOCK_RECEIPT",
  "BUS_ISSUE",
  "BUS_RETURN",
  "ADJUSTMENT",
  "REVERSAL",
]);

export const documentStatus = pgEnum("document_status", ["DRAFT", "POSTED"]);

export const documentSequences = pgTable(
  "document_sequences",
  {
    storeId: uuid("store_id")
      .references(() => stores.id)
      .notNull(),
    documentType: stockDocumentType("document_type").notNull(),
    year: integer("year").notNull(),
    nextValue: integer("next_value").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("document_sequences_key_unique").on(
      table.storeId,
      table.documentType,
      table.year,
    ),
  ],
);

export const stockDocuments = pgTable(
  "stock_documents",
  {
    id: idColumn(),
    documentNumber: text("document_number").notNull(),
    type: stockDocumentType("type").notNull(),
    status: documentStatus("status").default("DRAFT").notNull(),
    storeId: uuid("store_id")
      .references(() => stores.id)
      .notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    busId: uuid("bus_id").references(() => buses.id),
    reversesDocumentId: uuid("reverses_document_id").references(
      (): AnyPgColumn => stockDocuments.id,
    ),
    businessDate: text("business_date").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reason: text("reason"),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    postedBy: uuid("posted_by").references(() => users.id),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stock_documents_number_unique").on(table.documentNumber),
    uniqueIndex("stock_documents_idempotency_unique").on(
      table.createdBy,
      table.idempotencyKey,
    ),
    uniqueIndex("stock_documents_reversal_unique").on(table.reversesDocumentId),
    check(
      "bus_issue_requires_bus",
      sql`${table.type} <> 'BUS_ISSUE' OR ${table.busId} IS NOT NULL`,
    ),
    check(
      "reversal_requires_original",
      sql`${table.type} <> 'REVERSAL' OR ${table.reversesDocumentId} IS NOT NULL`,
    ),
  ],
);

export const stockDocumentLines = pgTable(
  "stock_document_lines",
  {
    id: idColumn(),
    documentId: uuid("document_id")
      .references(() => stockDocuments.id, { onDelete: "restrict" })
      .notNull(),
    lineNumber: integer("line_number").notNull(),
    partId: uuid("part_id")
      .references(() => parts.id)
      .notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    skuSnapshot: text("sku_snapshot").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    unitSnapshot: text("unit_snapshot").notNull(),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("stock_document_lines_line_unique").on(
      table.documentId,
      table.lineNumber,
    ),
    check("stock_document_lines_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: idColumn(),
    documentId: uuid("document_id")
      .references(() => stockDocuments.id, { onDelete: "restrict" })
      .notNull(),
    documentLineId: uuid("document_line_id")
      .references(() => stockDocumentLines.id, { onDelete: "restrict" })
      .notNull(),
    storeId: uuid("store_id")
      .references(() => stores.id)
      .notNull(),
    partId: uuid("part_id")
      .references(() => parts.id)
      .notNull(),
    quantityDelta: numeric("quantity_delta", {
      precision: 14,
      scale: 3,
    }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 14,
      scale: 3,
    }).notNull(),
    reversesMovementId: uuid("reverses_movement_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stock_movements_store_part_time_idx").on(
      table.storeId,
      table.partId,
      table.occurredAt,
    ),
    index("stock_movements_document_idx").on(table.documentId),
    check("stock_movements_nonzero", sql`${table.quantityDelta} <> 0`),
  ],
);

export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    storeId: uuid("store_id")
      .references(() => stores.id, { onDelete: "restrict" })
      .notNull(),
    partId: uuid("part_id")
      .references(() => parts.id, { onDelete: "restrict" })
      .notNull(),
    onHand: numeric("on_hand", { precision: 14, scale: 3 })
      .default("0")
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("inventory_balances_store_part_unique").on(
      table.storeId,
      table.partId,
    ),
    check("inventory_balances_nonnegative", sql`${table.onHand} >= 0`),
  ],
);
