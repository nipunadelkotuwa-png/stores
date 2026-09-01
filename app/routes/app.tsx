import { Form, Outlet, useLocation, useNavigation } from "react-router";
import { useEffect, useState } from "react";

import { AppFooter } from "~/components/app-footer";
import { AppSidebar, SidebarMenuButton } from "~/components/app-sidebar";
import { NotificationBell } from "~/components/notification-bell";
import { TopbarSearch } from "~/components/topbar-search";
import { countPendingApprovals } from "~/features/inventory/queries.server";
import { requireUserWithSession } from "~/lib/auth/authorization.server";
import { appLayoutShouldRevalidate } from "~/lib/app-layout-revalidation";
import { readDashboardMode } from "~/lib/dashboard-mode.server";
import type { Route } from "./+types/app";

export type AppOutletContext = {
  pendingApprovals: number;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { user, csrf } = await requireUserWithSession(request);
  const pendingApprovals =
    user.role === "ADMIN" ? await countPendingApprovals(user) : 0;
  const dashboardMode = await readDashboardMode(request, user.role);
  return {
    user: { displayName: user.displayName, role: user.role },
    csrf,
    pendingApprovals,
    dashboardMode,
  };
}

export function shouldRevalidate({
  formAction,
  defaultShouldRevalidate,
  currentUrl,
  nextUrl,
}: {
  formAction?: string;
  defaultShouldRevalidate: boolean;
  currentUrl: URL;
  nextUrl: URL;
}) {
  return appLayoutShouldRevalidate({
    formAction,
    defaultShouldRevalidate,
    currentUrl,
    nextUrl,
  });
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigation = useNavigation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(
    loaderData.pendingApprovals,
  );
  const isSwitchingView =
    navigation.state !== "idle" &&
    navigation.formAction?.includes("/dashboard-mode");
  const nextMode = loaderData.dashboardMode === "pos" ? "classic" : "pos";
  const initials = loaderData.user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const roleLabel =
    loaderData.user.role === "ADMIN" ? "Admin" : "Operator";

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setPendingApprovals(loaderData.pendingApprovals);
  }, [loaderData.pendingApprovals]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppSidebar
        displayName={loaderData.user.displayName}
        role={loaderData.user.role}
        csrf={loaderData.csrf}
        pendingApprovals={pendingApprovals}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />
      <div className="page-shell">
        <header className="topbar">
          <div className="topbar-leading">
            <SidebarMenuButton
              onClick={() => setSidebarOpen((open) => !open)}
              expanded={sidebarOpen}
            />
            <TopbarSearch mode={loaderData.dashboardMode} />
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
                className="button button-secondary topbar-mode-btn"
                disabled={isSwitchingView}
                title={
                  loaderData.dashboardMode === "pos"
                    ? "Switch to classic analytics dashboard"
                    : "Switch to POS operations hub"
                }
              >
                {isSwitchingView
                  ? "Switching…"
                  : loaderData.dashboardMode === "pos"
                    ? "Classic view"
                    : "POS view"}
              </button>
            </Form>
            <NotificationBell
              csrf={loaderData.csrf}
              onPendingApprovalsChange={setPendingApprovals}
            />
            <div className="topbar-user">
              <span className="topbar-avatar">{initials || "U"}</span>
              <div className="topbar-user-copy">
                <strong>{loaderData.user.displayName}</strong>
                <span>{roleLabel}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="content" id="main-content">
          <Outlet context={{ pendingApprovals } satisfies AppOutletContext} />
          <AppFooter />
        </main>
      </div>
    </div>
  );
}
