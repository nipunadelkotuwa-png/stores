import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./common";

export const userRole = pgEnum("user_role", ["ADMIN", "OPERATOR"]);
export const userStatus = pgEnum("user_status", ["ACTIVE", "DISABLED"]);

export const stores = pgTable(
  "stores",
  {
    id: idColumn(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    timeZone: text("time_zone").default("Asia/Colombo").notNull(),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("stores_code_unique").on(table.code)],
);

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    status: userStatus("status").default("ACTIVE").notNull(),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const userStoreAssignments = pgTable(
  "user_store_assignments",
  {
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    storeId: uuid("store_id")
      .references(() => stores.id, { onDelete: "cascade" })
      .notNull(),
    assignedBy: uuid("assigned_by")
      .references(() => users.id)
      .notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.storeId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: idColumn(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    csrfSecret: text("csrf_secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  storeAssignments: many(userStoreAssignments, {
    relationName: "assignedUser",
  }),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  userAssignments: many(userStoreAssignments),
}));
