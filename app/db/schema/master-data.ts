import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { stores } from "./auth";
import { idColumn, timestamps } from "./common";

export const partCategories = pgTable("part_categories", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const parts = pgTable(
  "parts",
  {
    id: idColumn(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => partCategories.id),
    unit: text("unit").default("EA").notNull(),
    brand: text("brand"),
    compatibleModels: text("compatible_models"),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("parts_sku_unique").on(table.sku)],
);

export const storePartSettings = pgTable(
  "store_part_settings",
  {
    storeId: uuid("store_id")
      .references(() => stores.id, { onDelete: "cascade" })
      .notNull(),
    partId: uuid("part_id")
      .references(() => parts.id, { onDelete: "cascade" })
      .notNull(),
    reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 })
      .default("0")
      .notNull(),
    binLocation: text("bin_location"),
    active: boolean("active").default(true).notNull(),
  },
  (table) => [primaryKey({ columns: [table.storeId, table.partId] })],
);

export const buses = pgTable(
  "buses",
  {
    id: idColumn(),
    fleetNumber: text("fleet_number").notNull(),
    registrationNumber: text("registration_number"),
    make: text("make"),
    model: text("model"),
    status: text("status").default("ACTIVE").notNull(),
    homeStoreId: uuid("home_store_id").references(() => stores.id),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("buses_fleet_number_unique").on(table.fleetNumber),
    uniqueIndex("buses_registration_unique").on(table.registrationNumber),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: idColumn(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    registrationReference: text("registration_reference"),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("suppliers_code_unique").on(table.code),
    index("suppliers_name_idx").on(table.name),
  ],
);

export const partsRelations = relations(parts, ({ one, many }) => ({
  category: one(partCategories, {
    fields: [parts.categoryId],
    references: [partCategories.id],
  }),
  storeSettings: many(storePartSettings),
}));
