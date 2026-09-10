import type { ReactNode } from "react";

import { can, type Permission, type Role } from "~/lib/auth/permissions";

export type NavItemConfig = {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
  permission?: Permission;
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
  { to: "/", label: "Dashboard", end: true, permission: "dashboard.read" },
  { to: "/pos/issue", label: "Issue (POS)", permission: "issues.create" },
  { to: "/scan", label: "Scan barcode", permission: "scan.use" },
];

export const operationsNavConfig: NavItemConfig[] = [
  { to: "/balances", label: "Balances", permission: "balances.read" },
  { to: "/stock-in/new", label: "Stock in", permission: "stockIn.create" },
  { to: "/issues/new", label: "Bus issue", permission: "issues.create" },
  { to: "/returns/bus", label: "Bus return", permission: "returns.create" },
  {
    to: "/returns",
    label: "Returns & reversals",
    exact: true,
    adminOnly: true,
    permission: "reversals.manage",
  },
  { to: "/transfers", label: "Transfers", permission: "reports.read" },
  { to: "/purchases", label: "Purchases", permission: "reports.read" },
  { to: "/alerts/low-stock", label: "Low stock", permission: "balances.read" },
];

export const workshopNavConfig: NavItemConfig[] = [
  { to: "/job-cards", label: "Job cards", permission: "jobCards.read" },
  {
    to: "/tyres/import",
    label: "Import new tyres",
    permission: "tyres.manage",
  },
  { to: "/tyres", label: "Tyres", exact: true, permission: "tyres.read" },
  { to: "/tyres/dag", label: "DAG", permission: "dag.send" },
];

export const masterDataNavConfig: NavItemConfig[] = [
  { to: "/parts", label: "Parts", permission: "masterData.read" },
  {
    to: "/parts/print-labels",
    label: "Print labels",
    permission: "masterData.read",
  },
  { to: "/categories", label: "Categories", permission: "masterData.read" },
  { to: "/buses", label: "Buses", permission: "masterData.read" },
  { to: "/suppliers", label: "Suppliers", permission: "masterData.read" },
];

export const reportNavConfig: NavItemConfig[] = [
  { to: "/reports/movements", label: "Movements", permission: "reports.read" },
  {
    to: "/reports/daily-movement",
    label: "Daily movement",
    permission: "reports.read",
  },
  {
    to: "/reports/daily-issues",
    label: "Daily issues",
    permission: "reports.read",
  },
  { to: "/reports/item-usage", label: "Item usage", permission: "reports.read" },
  {
    to: "/reports/unusual-issues",
    label: "Unusual issues",
    permission: "reports.read",
  },
  {
    to: "/reports/fast-moving",
    label: "Fast moving",
    permission: "reports.read",
  },
  { to: "/reports/bus-usage", label: "Bus usage", permission: "reports.read" },
  { to: "/reports/dag-out", label: "DAG out", permission: "reports.read" },
  { to: "/reports/tyre-stock", label: "Tyre stock", permission: "reports.read" },
  { to: "/reports/transfers", label: "Transfers", permission: "reports.read" },
  { to: "/reports/purchases", label: "Purchases", permission: "reports.read" },
];

export const adminNavConfig: NavItemConfig[] = [
  { to: "/admin/users", label: "Users & Roles", permission: "users.manage" },
  { to: "/admin/stores", label: "Stores", permission: "stores.manage" },
  { to: "/admin/reorder", label: "Reorder levels", permission: "reorder.manage" },
  {
    to: "/admin/corrections",
    label: "Corrections",
    permission: "adjustments.create",
  },
  { to: "/admin/audit", label: "Audit log", permission: "audit.read" },
];

export const adminQuickNavConfig: NavItemConfig = {
  to: "/approvals",
  label: "Approvals",
  adminOnly: true,
  permission: "approvals.manage",
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

function visibleNavItems(items: NavItemConfig[], role: Role): NavItemConfig[] {
  return items.filter((item) => {
    if (item.permission) return can(role, item.permission);
    return !item.adminOnly || role === "ADMIN";
  });
}

export function buildNavSections(role: Role): NavSectionConfig[] {
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

  const adminItems = visibleNavItems(adminNavConfig, role);
  if (adminItems.length > 0) {
    sections.push({
      id: "administration",
      label: "Administration",
      items: adminItems,
      defaultOpen: false,
      adminOnly: true,
    });
  }

  return sections.filter((section) => section.items.length > 0);
}

export function buildPrimaryNav(role: Role): NavItemConfig[] {
  return visibleNavItems(
    [...primaryNavConfig, adminQuickNavConfig],
    role,
  );
}

/** Flat list of all sidebar paths for completeness checks / search hints. */
export function allNavPaths(role: Role): string[] {
  return [
    ...buildPrimaryNav(role).map((item) => item.to),
    ...buildNavSections(role).flatMap((section) =>
      section.items.map((item) => item.to),
    ),
  ];
}

export type NavItemWithIcon = NavItemConfig & { icon: ReactNode; badge?: number };
