import type { Role } from "~/lib/auth/permissions";

export class NonAdminStoreError extends Error {
  constructor(
    message = "Non-admin users must keep at least one assigned store.",
  ) {
    super(message);
    this.name = "NonAdminStoreError";
  }
}

export function wouldLeaveZeroAdmins(
  activeAdminCount: number,
  targetIsActiveAdmin: boolean,
  next: { role?: Role; status?: "ACTIVE" | "DISABLED" },
) {
  if (!targetIsActiveAdmin) return false;
  const staysAdmin = next.role ? next.role === "ADMIN" : true;
  const staysActive = next.status ? next.status === "ACTIVE" : true;
  if (staysAdmin && staysActive) return false;
  return activeAdminCount <= 1;
}

export function assertNonAdminHasStore(
  role: Role | undefined,
  assignments: { storeId: string }[],
  exceptStoreId?: string,
) {
  if (!role || role === "ADMIN") return;
  const remaining = exceptStoreId
    ? assignments.filter((row) => row.storeId !== exceptStoreId)
    : assignments;
  if (remaining.length === 0) {
    throw new NonAdminStoreError(
      exceptStoreId
        ? "Non-admin users must keep at least one assigned store."
        : "Assign a store before changing this user away from admin.",
    );
  }
}
