import { Form, NavLink, Outlet } from "react-router";

import { requireUser } from "~/lib/auth/authorization.server";
import { getSessionRecord } from "~/lib/auth/session.server";
import type { Route } from "./+types/app";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const record = await getSessionRecord(request);
  if (!record) throw new Response(null, { status: 401 });
  return {
    user: { displayName: user.displayName, role: user.role },
    csrf: record.session.csrfSecret,
  };
}

const operationsNav = [
  ["/", "Dashboard"],
  ["/balances", "Balances"],
  ["/scan", "Scan Barcode"],
  ["/stock-in/new", "Stock in"],
  ["/issues/new", "Bus issue"],
  ["/returns/bus", "Bus Return"],
  ["/returns", "Returns & Reversals"],
  ["/tires/conversion", "Tire Conversion"],
  ["/purchases", "Purchases"],
  ["/alerts/low-stock", "Low stock"],
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
  ["/reports/fast-moving", "Fast Moving Items"],
  ["/reports/bus-usage", "Bus usage"],
  ["/reports/purchases", "Purchases"],
] as const;

export default function AppLayout({ loaderData }: Route.ComponentProps) {
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
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
