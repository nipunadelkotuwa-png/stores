import type { ReactNode } from "react";

export type NavItemConfig = {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
  /** When true, only exact path match (avoids /returns matching /returns/bus). */
  exact?: boolean;
};

export type NavSectionConfig = {
  id: string;
  label: string;
  items: NavItemConfig[];
  defaultOpen?: boolean;
  adminOnly?: boolean;
};

export const primaryNavConfig: NavItemConfig[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/pos/issue", label: "Issue (POS)" },
  { to: "/scan", label: "Scan barcode" },
];

export const operationsNavConfig: NavItemConfig[] = [
  { to: "/balances", label: "Balances" },
  { to: "/stock-in/new", label: "Stock in" },
  { to: "/issues/new", label: "Bus issue" },
  { to: "/returns/bus", label: "Bus return" },
  { to: "/returns", label: "Returns & reversals", exact: true, adminOnly: true },
  { to: "/transfers", label: "Transfers" },
  { to: "/tires/conversion", label: "Tyre conversion", adminOnly: true },
  { to: "/purchases", label: "Purchases" },
  { to: "/alerts/low-stock", label: "Low stock" },
];

export const workshopNavConfig: NavItemConfig[] = [
  { to: "/job-cards", label: "Job cards" },
  { to: "/tyres", label: "Tyres", exact: true },
  { to: "/tyres/dag", label: "DAG" },
];

export const masterDataNavConfig: NavItemConfig[] = [
  { to: "/parts", label: "Parts" },
  { to: "/parts/print-labels", label: "Print labels" },
  { to: "/categories", label: "Categories" },
  { to: "/buses", label: "Buses" },
  { to: "/suppliers", label: "Suppliers" },
];

export const reportNavConfig: NavItemConfig[] = [
  { to: "/reports/movements", label: "Movements" },
  { to: "/reports/daily-movement", label: "Daily movement" },
  { to: "/reports/daily-issues", label: "Daily issues" },
  { to: "/reports/item-usage", label: "Item usage" },
  { to: "/reports/unusual-issues", label: "Unusual issues" },
  { to: "/reports/fast-moving", label: "Fast moving" },
  { to: "/reports/bus-usage", label: "Bus usage" },
  { to: "/reports/dag-out", label: "DAG out" },
  { to: "/reports/tyre-stock", label: "Tyre stock" },
  { to: "/reports/transfers", label: "Transfers" },
  { to: "/reports/purchases", label: "Purchases" },
];

export const adminNavConfig: NavItemConfig[] = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/stores", label: "Stores" },
  { to: "/admin/reorder", label: "Reorder levels" },
  { to: "/admin/corrections", label: "Corrections" },
  { to: "/admin/audit", label: "Audit log" },
];

export const adminQuickNavConfig: NavItemConfig = {
  to: "/approvals",
  label: "Approvals",
  adminOnly: true,
};

/** NavLink `end` prop derived from config (exact match routes). */
export function navItemEnd(item: NavItemConfig): boolean | undefined {
  if (item.end !== undefined) return item.end;
  if (item.exact) return true;
  return undefined;
}

export function isNavItemActive(pathname: string, item: NavItemConfig): boolean {
  if (item.to === "/") return pathname === "/";
  if (item.exact || item.end) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function visibleNavItems(
  items: NavItemConfig[],
  role: "ADMIN" | "OPERATOR",
): NavItemConfig[] {
  return items.filter((item) => !item.adminOnly || role === "ADMIN");
}

export function buildNavSections(
  role: "ADMIN" | "OPERATOR",
): NavSectionConfig[] {
  const sections: NavSectionConfig[] = [
    {
      id: "operations",
      label: "Operations",
      items: visibleNavItems(operationsNavConfig, role),
      defaultOpen: true,
    },
    {
      id: "workshop",
      label: "Workshop",
      items: visibleNavItems(workshopNavConfig, role),
      defaultOpen: true,
    },
    {
      id: "master-data",
      label: "Master data",
      items: visibleNavItems(masterDataNavConfig, role),
      defaultOpen: false,
    },
    {
      id: "reports",
      label: "Reports",
      items: visibleNavItems(reportNavConfig, role),
      defaultOpen: false,
    },
  ];

  if (role === "ADMIN") {
    sections.push({
      id: "administration",
      label: "Administration",
      items: adminNavConfig,
      defaultOpen: false,
      adminOnly: true,
    });
  }

  return sections;
}

export function buildPrimaryNav(
  role: "ADMIN" | "OPERATOR",
): NavItemConfig[] {
  if (role !== "ADMIN") return primaryNavConfig;
  return [...primaryNavConfig, adminQuickNavConfig];
}

/** Flat list of all sidebar paths for completeness checks / search hints. */
export function allNavPaths(role: "ADMIN" | "OPERATOR"): string[] {
  return [
    ...buildPrimaryNav(role).map((item) => item.to),
    ...buildNavSections(role).flatMap((section) =>
      section.items.map((item) => item.to),
    ),
  ];
}

export type NavItemWithIcon = NavItemConfig & { icon: ReactNode; badge?: number };
