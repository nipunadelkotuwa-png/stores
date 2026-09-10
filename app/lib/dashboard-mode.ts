import { defaultDashboardMode, type Role } from "~/lib/auth/permissions";

export type DashboardMode = "pos" | "classic";

export const DASHBOARD_MODE_COOKIE = "ds_dashboard_mode";

export function parseDashboardMode(value: unknown): DashboardMode | null {
  if (value === "pos" || value === "classic") return value;
  return null;
}

export function resolveDashboardMode(
  cookieValue: unknown,
  role: Role,
): DashboardMode {
  return parseDashboardMode(cookieValue) ?? defaultDashboardMode(role);
}

export function toggleDashboardMode(current: DashboardMode): DashboardMode {
  return current === "pos" ? "classic" : "pos";
}
