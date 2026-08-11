import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { data, redirect } from "react-router";

import { db } from "~/db/client.server";
import { userStoreAssignments } from "~/db/schema";
import { getSessionRecord } from "./session.server";

export type Actor = NonNullable<
  Awaited<ReturnType<typeof getSessionRecord>>
>["user"];

export async function requireUser(request: Request) {
  const record = await getSessionRecord(request);
  if (!record)
    throw redirect(
      `/login?redirectTo=${encodeURIComponent(new URL(request.url).pathname)}`,
    );
  if (
    record.user.mustChangePassword &&
    new URL(request.url).pathname !== "/change-password"
  ) {
    throw redirect("/change-password");
  }
  return record.user;
}

export async function requireAdmin(request: Request) {
  const actor = await requireUser(request);
  if (actor.role !== "ADMIN") {
    throw data(
      {
        message:
          "Administrator access is required for this page. Return to the dashboard or ask an admin for help.",
      },
      { status: 403 },
    );
  }
  return actor;
}

/** `null` = Admin (all stores). `[]` = Operator with no assignments. */
export async function getAuthorizedStoreIds(actor: Actor) {
  if (actor.role === "ADMIN") return null;
  const rows = await db
    .select({ storeId: userStoreAssignments.storeId })
    .from(userStoreAssignments)
    .where(eq(userStoreAssignments.userId, actor.id));
  return rows.map((row) => row.storeId);
}

export function scopedStoreCondition(
  column: AnyPgColumn,
  storeIds: string[] | null,
): SQL | undefined {
  if (storeIds === null) return undefined;
  if (storeIds.length === 0) return sql`false`;
  return inArray(column, storeIds);
}

export async function requireStoreAccess(actor: Actor, storeId: string) {
  if (actor.role === "ADMIN") return;
  const ids = await getAuthorizedStoreIds(actor);
  if (!ids?.includes(storeId)) {
    throw data(
      { message: "You do not have access to that store." },
      { status: 403 },
    );
  }
}
