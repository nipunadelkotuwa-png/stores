import { Form, NavLink, Outlet, useLocation } from "react-router";

import { NotificationBell } from "~/components/notification-bell";
import { countPendingApprovals } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { getSessionRecord } from "~/lib/auth/session.server";
import { readDashboardMode } from "~/lib/dashboard-mode.server";
import type { Route } from "./+types/app";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const record = await getSessionRecord(request);
  if (!record) throw new Response(null, { status: 401 });
  const pendingApprovals =
    user.role === "ADMIN" ? await countPendingApprovals(user) : 0;
  const dashboardMode = await readDashboardMode(request, user.role);
  return {
    user: { displayName: user.displayName, role: user.role },
    csrf: record.session.csrfSecret,
    pendingApprovals,
    dashboardMode,
  };
}

const operationsNav = [
  ["/", "Dashboard"],
  ["/pos/issue", "Issue (POS)"],
  ["/balances", "Balances"],
  ["/scan", "Scan Barcode"],
  ["/stock-in/new", "Stock in"],
  ["/issues/new", "Bus issue"],
  ["/returns/bus", "Bus Return"],
  ["/returns", "Returns & Reversals"],
  ["/transfers", "Transfers"],
  ["/tires/conversion", "Tire Conversion"],
  ["/purchases", "Purchases"],
  ["/alerts/low-stock", "Low stock"],
] as const;

const workshopNav = [
  ["/job-cards", "Job cards"],
  ["/tyres", "Tyres"],
  ["/tyres/dag", "DAG"],
] as const;

const masterDataNav = [
  ["/parts", "Parts"],
  ["/categories", "Categories"],
  ["/buses", "Buses"],
  ["/suppliers", "Suppliers"],
] as const;

const reportsNavigation = [
  ["/reports/movements", "Movements"],
  ["/reports/daily-movement", "Daily Movement"],
  ["/reports/daily-issues", "Daily Issues"],
  ["/reports/item-usage", "Item usage"],
  ["/reports/unusual-issues", "Unusual issues"],
  ["/reports/fast-moving", "Fast Moving Items"],
  ["/reports/bus-usage", "Bus usage"],
  ["/reports/dag-out", "DAG out"],
  ["/reports/transfers", "Transfers"],
  ["/reports/purchases", "Purchases"],
] as const;

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const nextMode = loaderData.dashboardMode === "pos" ? "classic" : "pos";

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">DG</div>
          <div>
            <strong>StoreOps</strong>
            <span>DS Gunasekara Group</span>
          </div>
        </div>
        <nav>
          <p className="nav-section">Operations</p>
          {operationsNav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/" || to === "/purchases"}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {label}
            </NavLink>
          ))}

          {loaderData.user.role === "ADMIN" ? (
            <NavLink
              to="/approvals"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Approvals
              {loaderData.pendingApprovals > 0 ? (
                <span className="badge danger" style={{ marginLeft: "0.4rem" }}>
                  {loaderData.pendingApprovals}
                </span>
              ) : null}
            </NavLink>
          ) : null}

          <p className="nav-section">Workshop</p>
          {workshopNav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {label}
            </NavLink>
          ))}

          <p className="nav-section">Master Data</p>
          {masterDataNav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {label}
            </NavLink>
          ))}

          <p className="nav-section">Reports</p>
          {reportsNavigation.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {label}
            </NavLink>
          ))}

          {loaderData.user.role === "ADMIN" ? (
            <>
              <p className="nav-section">Administration</p>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                Users
              </NavLink>
              <NavLink
                to="/admin/stores"
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                Stores
              </NavLink>
              <NavLink
                to="/admin/reorder"
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                Reorder levels
              </NavLink>
              <NavLink
                to="/admin/corrections"
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                Corrections
              </NavLink>
              <NavLink
                to="/admin/audit"
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                Audit log
              </NavLink>
            </>
          ) : null}
        </nav>
        <div className="sidebar-user">
          <div>
            <strong>{loaderData.user.displayName}</strong>
            <span>{loaderData.user.role}</span>
          </div>
          <Form method="post" action="/logout">
            <input type="hidden" name="csrf" value={loaderData.csrf} />
            <button className="text-button">Sign out</button>
          </Form>
        </div>
      </aside>
      <div className="page-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Fleet spare-parts control</p>
            <span className="muted">Secure · Audited · Location-aware</span>
          </div>
          <div className="topbar-actions">
            <Form
              method="post"
              action="/dashboard-mode"
              className="dashboard-mode-toggle"
            >
              <input type="hidden" name="csrf" value={loaderData.csrf} />
              <input type="hidden" name="mode" value={nextMode} />
              <input
                type="hidden"
                name="redirectTo"
                value={`${location.pathname}${location.search}`}
              />
              <button
                type="submit"
                className="button button-secondary"
                title={
                  loaderData.dashboardMode === "pos"
                    ? "Switch to classic analytics dashboard"
                    : "Switch to POS operations hub"
                }
              >
                {loaderData.dashboardMode === "pos"
                  ? "Classic view"
                  : "POS view"}
              </button>
            </Form>
            <NotificationBell csrf={loaderData.csrf} />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
