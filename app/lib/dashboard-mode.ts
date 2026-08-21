export type DashboardMode = "pos" | "classic";

export const DASHBOARD_MODE_COOKIE = "ds_dashboard_mode";

export function parseDashboardMode(value: unknown): DashboardMode | null {
  if (value === "pos" || value === "classic") return value;
  return null;
}

export function resolveDashboardMode(
  cookieValue: unknown,
  role: "ADMIN" | "OPERATOR",
): DashboardMode {
  return (
    parseDashboardMode(cookieValue) ?? (role === "OPERATOR" ? "pos" : "classic")
  );
}

export function toggleDashboardMode(current: DashboardMode): DashboardMode {
  return current === "pos" ? "classic" : "pos";
}
