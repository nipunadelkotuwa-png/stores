import { Form, Link, NavLink, useLocation } from "react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  adminQuickNavConfig,
  buildNavSections,
  buildPrimaryNav,
  isNavItemActive,
  navItemEnd,
  type NavItemConfig,
  type NavSectionConfig,
} from "~/lib/app-navigation";
import { roleLabel, type Role } from "~/lib/auth/permissions";

const STORAGE_KEY = "storeops.sidebar.sections";

type AppSidebarProps = {
  displayName: string;
  role: Role;
  csrf: string;
  pendingApprovals: number;
  mobileOpen: boolean;
  collapsed: boolean;
  onMobileClose: () => void;
};

type NavItemView = NavItemConfig & {
  icon: ReactNode;
  badge?: number;
};

function readSectionState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

function writeSectionState(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function IssueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function StockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V8M8 12l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 11h16M8 17v2M16 17v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 14 4 9l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h11M7 7l3-3M7 7l3 3M17 17H6M17 17l-3 3M17 17l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.3 4.5 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.5a1.5 1.5 0 0 0-2.6 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ApprovalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LabelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h10v10H7z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 18 10 12l4 4 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={open ? "sidebar-chevron open" : "sidebar-chevron"}
    >
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ICONS: Record<string, ReactNode> = {
  "/": <DashboardIcon />,
  "/pos/issue": <IssueIcon />,
  "/scan": <ScanIcon />,
  "/approvals": <ApprovalIcon />,
  "/balances": <GridIcon />,
  "/stock-in/new": <StockIcon />,
  "/issues/new": <BusIcon />,
  "/returns/bus": <ReturnIcon />,
  "/returns": <ReturnIcon />,
  "/transfers": <TransferIcon />,
  "/purchases": <StockIcon />,
  "/alerts/low-stock": <AlertIcon />,
  "/job-cards": <WrenchIcon />,
  "/tyres/import": <StockIcon />,
  "/tyres": <WrenchIcon />,
  "/tyres/dag": <TransferIcon />,
  "/parts": <DatabaseIcon />,
  "/parts/print-labels": <LabelIcon />,
  "/categories": <DatabaseIcon />,
  "/buses": <BusIcon />,
  "/suppliers": <DatabaseIcon />,
  "/reports/movements": <ChartIcon />,
  "/reports/daily-movement": <TrendIcon />,
  "/reports/daily-issues": <ChartIcon />,
  "/reports/item-usage": <TrendIcon />,
  "/reports/unusual-issues": <AlertIcon />,
  "/reports/fast-moving": <TrendIcon />,
  "/reports/bus-usage": <BusIcon />,
  "/reports/dag-out": <TransferIcon />,
  "/reports/tyre-stock": <WrenchIcon />,
  "/reports/transfers": <TransferIcon />,
  "/reports/purchases": <StockIcon />,
  "/admin/users": <SettingsIcon />,
  "/admin/stores": <SettingsIcon />,
  "/admin/reorder": <AlertIcon />,
  "/admin/corrections": <SettingsIcon />,
  "/admin/audit": <ChartIcon />,
};

function withIcons(
  items: NavItemConfig[],
  pendingApprovals: number,
): NavItemView[] {
  return items.map((item) => ({
    ...item,
    icon: NAV_ICONS[item.to] ?? <GridIcon />,
    badge:
      item.to === adminQuickNavConfig.to && pendingApprovals > 0
        ? pendingApprovals
        : undefined,
  }));
}

function SidebarNavLink({
  item,
  onNavigate,
}: {
  item: NavItemView;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={navItemEnd(item)}
        onClick={onNavigate}
        title={item.label}
        aria-label={item.label}
        className={({ isActive }) =>
          isActive ? "sidebar-nav-link active" : "sidebar-nav-link"
        }
      >
        <span className="sidebar-nav-icon">{item.icon}</span>
        <span className="sidebar-nav-label">{item.label}</span>
        {item.badge ? (
          <span className="sidebar-nav-badge" aria-label={`${item.badge} pending`}>
            {item.badge}
          </span>
        ) : null}
      </NavLink>
    </li>
  );
}

function SidebarSection({
  section,
  open,
  onToggle,
  onNavigate,
}: {
  section: NavSectionConfig;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const items = withIcons(section.items, 0);
  const hasActiveChild = items.some((item) =>
    isNavItemActive(location.pathname, item),
  );

  return (
    <div className={`sidebar-section${hasActiveChild ? " has-active" : ""}`}>
      <button
        type="button"
        className="sidebar-section-toggle"
        aria-expanded={open}
        aria-controls={`sidebar-section-${section.id}`}
        title={section.label}
        aria-label={section.label}
        onClick={onToggle}
      >
        <span>{section.label}</span>
        <ChevronIcon open={open} />
      </button>
      <ul
        id={`sidebar-section-${section.id}`}
        className="sidebar-section-items"
        hidden={!open}
      >
        {items.map((item) => (
          <SidebarNavLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
}

export function SidebarMenuButton({
  onClick,
  expanded = false,
  label,
}: {
  onClick: () => void;
  expanded?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className="sidebar-menu-button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls="app-sidebar"
      onClick={onClick}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {expanded ? (
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function AppSidebar({
  displayName,
  role,
  csrf,
  pendingApprovals,
  mobileOpen,
  collapsed,
  onMobileClose,
}: AppSidebarProps) {
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
  const isMobile = useMobileViewport();
  const sections = useMemo(() => buildNavSections(role), [role]);
  const primaryNav = useMemo(
    () => withIcons(buildPrimaryNav(role), pendingApprovals),
    [role, pendingApprovals],
  );
  const roleCopy = roleLabel(role);
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      sections.map((section) => [section.id, section.defaultOpen ?? false]),
    ),
  );

  useEffect(() => {
    const stored = readSectionState();
    setSectionOpen((current) => {
      const next = { ...current };
      for (const section of sections) {
        if (stored[section.id] !== undefined) {
          next[section.id] = stored[section.id];
        }
      }
      return next;
    });
  }, [sections]);

  const toggleSection = (id: string) => {
    setSectionOpen((current) => {
      const next = { ...current, [id]: !current[id] };
      writeSectionState(next);
      return next;
    });
  };

  useEffect(() => {
    setSectionOpen((current) => {
      const next = { ...current };
      let changed = false;
      for (const section of sections) {
        const hasActiveChild = section.items.some((item) =>
          isNavItemActive(location.pathname, item),
        );
        if (hasActiveChild && !next[section.id]) {
          next[section.id] = true;
          changed = true;
        }
      }
      if (changed) writeSectionState(next);
      return changed ? next : current;
    });
  }, [location.pathname, sections]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const root = sidebarRef.current;
    if (!root) return;

    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [mobileOpen, isMobile]);

  const sidebarInert = isMobile && !mobileOpen;

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={onMobileClose}
        />
      ) : null}
      <aside
        ref={sidebarRef}
        id="app-sidebar"
        className={`sidebar${mobileOpen ? " mobile-open" : ""}${collapsed ? " collapsed" : ""}`}
        aria-label="Main navigation"
        aria-hidden={sidebarInert ? true : undefined}
        {...(sidebarInert ? { inert: true } : {})}
      >
        <div className="sidebar-brand">
          <Link
            to="/"
            className="sidebar-brand-link"
            onClick={onMobileClose}
            title="StoreOps"
            aria-label="StoreOps dashboard"
          >
            <div className="brand-mark small brand-mark-so">SO</div>
            <div className="sidebar-brand-copy">
              <strong>StoreOps</strong>
              <span>Store desk</span>
            </div>
          </Link>
          <button
            type="button"
            className="sidebar-close-button"
            aria-label="Close navigation menu"
            onClick={onMobileClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-nav-heading">Quick access</p>
          <ul className="sidebar-primary-list">
            {primaryNav.map((item) => (
              <SidebarNavLink
                key={item.to}
                item={item}
                onNavigate={onMobileClose}
              />
            ))}
          </ul>

          {sections.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              open={
                collapsed ||
                (sectionOpen[section.id] ?? section.defaultOpen ?? false)
              }
              onToggle={() => toggleSection(section.id)}
              onNavigate={onMobileClose}
            />
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-identity">
            <span className="sidebar-user-avatar" aria-hidden="true">
              {initials || "U"}
            </span>
            <div>
              <strong>{displayName}</strong>
              <span className="sidebar-role-badge">{roleCopy}</span>
            </div>
          </div>
          <Form method="post" action="/logout">
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit" className="sidebar-signout" title="Sign out">
              Sign out
            </button>
          </Form>
        </div>
      </aside>
    </>
  );
}
