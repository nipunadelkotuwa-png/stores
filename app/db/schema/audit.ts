import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { idColumn } from "./common";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: idColumn(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    requestId: text("request_id"),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    storeId: uuid("store_id"),
    outcome: text("outcome").default("SUCCESS").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").default({}).notNull(),
  },
  (table) => [
    index("audit_events_actor_time_idx").on(table.actorId, table.occurredAt),
    index("audit_events_entity_time_idx").on(
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
  ],
);
