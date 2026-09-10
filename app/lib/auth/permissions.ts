export const USER_ROLES = [
  "ADMIN",
  "OPERATOR",
  "STORE_KEEPER",
  "WORKSHOP",
  "VIEWER",
] as const;

export type Role = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  "dashboard.read",
  "balances.read",
  "reports.read",
  "masterData.read",
  "masterData.write",
  "stockIn.create",
  "purchases.create",
  "transfers.create",
  "issues.create",
  "returns.create",
  "scan.use",
  "jobCards.read",
  "jobCards.create",
  "jobCards.update",
  "tyres.read",
  "tyres.manage",
  "dag.send",
  "dag.receive",
  "dag.reject",
  "adjustments.create",
  "approvals.manage",
  "reversals.manage",
  "users.manage",
  "stores.manage",
  "reorder.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READS = [
  "dashboard.read",
  "balances.read",
  "reports.read",
  "masterData.read",
] as const satisfies readonly Permission[];

const OPERATOR_GRANTS: readonly Permission[] = [
  ...READS,
  "stockIn.create",
  "purchases.create",
  "transfers.create",
  "issues.create",
  "returns.create",
  "scan.use",
  "jobCards.read",
  "jobCards.create",
  "jobCards.update",
  "tyres.read",
  "tyres.manage",
  "dag.send",
  "dag.receive",
];

const STORE_KEEPER_GRANTS: readonly Permission[] = [
  ...READS,
  "stockIn.create",
  "purchases.create",
  "transfers.create",
  "issues.create",
  "returns.create",
  "scan.use",
  "jobCards.read",
];

const WORKSHOP_GRANTS: readonly Permission[] = [
  ...READS,
  "issues.create",
  "returns.create",
  "scan.use",
  "jobCards.read",
  "jobCards.create",
  "jobCards.update",
  "tyres.read",
  "tyres.manage",
  "dag.send",
  "dag.receive",
];

const VIEWER_GRANTS: readonly Permission[] = [...READS];

const ROLE_GRANTS: Record<Exclude<Role, "ADMIN">, ReadonlySet<Permission>> = {
  OPERATOR: new Set(OPERATOR_GRANTS),
  STORE_KEEPER: new Set(STORE_KEEPER_GRANTS),
  WORKSHOP: new Set(WORKSHOP_GRANTS),
  VIEWER: new Set(VIEWER_GRANTS),
};

export function can(role: Role, permission: Permission) {
  if (role === "ADMIN") return true;
  return ROLE_GRANTS[role]?.has(permission) ?? false;
}

export function roleLabel(role: Role) {
  if (role === "ADMIN") return "Admin";
  if (role === "OPERATOR") return "Operator";
  if (role === "STORE_KEEPER") return "Store keeper";
  if (role === "WORKSHOP") return "Workshop";
  return "Viewer";
}

export function defaultDashboardMode(role: Role): "pos" | "classic" {
  if (role === "OPERATOR" || role === "STORE_KEEPER" || role === "WORKSHOP") {
    return "pos";
  }
  return "classic";
}

export const FORBIDDEN_MESSAGE =
  "You do not have permission to perform this action.";
