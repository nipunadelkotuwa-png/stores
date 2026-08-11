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

const navigation = [
  ["/", "Dashboard"],
  ["/balances", "Balances"],
  ["/stock-in/new", "Stock in"],
  ["/issues/new", "Bus issue"],
  ["/purchases", "Purchases"],
  ["/alerts/low-stock", "Low stock"],
  ["/parts", "Parts"],
  ["/buses", "Buses"],
  ["/suppliers", "Suppliers"],
  ["/reports/movements", "Movements"],
  ["/reports/bus-usage", "Bus usage"],
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
          {navigation.map(([to, label]) => (
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
