import { and, asc, eq } from "drizzle-orm";

import { db } from "~/db/client.server";
import { auditEvents, userStoreAssignments, users } from "~/db/schema";
import type { Role } from "~/lib/auth/permissions";
import type { Actor } from "~/lib/auth/authorization.server";
import { wouldLeaveZeroAdmins } from "./last-admin";

export {
  wouldLeaveZeroAdmins,
  assertNonAdminHasStore,
  NonAdminStoreError,
} from "./last-admin";

export class LastAdminError extends Error {
  constructor() {
    super("Cannot demote or disable the last remaining administrator.");
    this.name = "LastAdminError";
  }
}

export async function lockActiveAdmins(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
) {
  return tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE")))
    .orderBy(asc(users.id))
    .for("update");
}

export async function lockUserAccess(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
) {
  const [user] = await tx
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  const assignments = await tx
    .select({ storeId: userStoreAssignments.storeId })
    .from(userStoreAssignments)
    .where(eq(userStoreAssignments.userId, userId))
    .orderBy(asc(userStoreAssignments.storeId))
    .for("update");
  return { user, assignments };
}

export async function assertNotLastActiveAdmin(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  next: { role?: Role; status?: "ACTIVE" | "DISABLED" },
) {
  const admins = await lockActiveAdmins(tx);
  if (
    wouldLeaveZeroAdmins(
      admins.length,
      admins.some((row) => row.id === userId),
      next,
    )
  ) {
    throw new LastAdminError();
  }
}

export async function auditAccessChange(
  actor: Actor,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(auditEvents).values({
    actorId: actor.id,
    eventType: "USER_ACCESS_CHANGED",
    entityType: "user",
    entityId: targetId,
    metadata,
  });
}
