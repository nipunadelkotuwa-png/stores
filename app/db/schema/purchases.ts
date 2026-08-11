import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { stores, users } from "./auth";
import { documentStatus, stockDocuments } from "./inventory";
import { parts, suppliers } from "./master-data";
import { idColumn, timestamps } from "./common";

export const localPurchases = pgTable(
  "local_purchases",
  {
    id: idColumn(),
    purchaseNumber: text("purchase_number").notNull(),
    storeId: uuid("store_id")
      .references(() => stores.id)
      .notNull(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id)
      .notNull(),
    receiptDocumentId: uuid("receipt_document_id").references(
      () => stockDocuments.id,
    ),
    supplierNameSnapshot: text("supplier_name_snapshot").notNull(),
    supplierInvoiceReference: text("supplier_invoice_reference"),
    businessDate: text("business_date").notNull(),
    currency: text("currency").default("LKR").notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    tax: numeric("tax", { precision: 14, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    status: documentStatus("status").default("DRAFT").notNull(),
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
    uniqueIndex("local_purchases_number_unique").on(table.purchaseNumber),
    uniqueIndex("local_purchases_receipt_unique").on(table.receiptDocumentId),
    uniqueIndex("local_purchases_idempotency_unique").on(
      table.createdBy,
      table.idempotencyKey,
    ),
    index("local_purchases_store_date_idx").on(
      table.storeId,
      table.businessDate,
    ),
  ],
);

export const localPurchaseLines = pgTable(
  "local_purchase_lines",
  {
    id: idColumn(),
    purchaseId: uuid("purchase_id")
      .references(() => localPurchases.id, { onDelete: "restrict" })
      .notNull(),
    lineNumber: integer("line_number").notNull(),
    partId: uuid("part_id")
      .references(() => parts.id)
      .notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    skuSnapshot: text("sku_snapshot").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    unitSnapshot: text("unit_snapshot").notNull(),
  },
  (table) => [
    uniqueIndex("local_purchase_lines_purchase_line_unique").on(
      table.purchaseId,
      table.lineNumber,
    ),
    check("local_purchase_lines_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "local_purchase_lines_price_nonnegative",
      sql`${table.unitPrice} >= 0`,
    ),
  ],
);
