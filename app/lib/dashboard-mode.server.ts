import { createCookie } from "react-router";

import { getEnv } from "~/config/env.server";
import {
  DASHBOARD_MODE_COOKIE,
  parseDashboardMode,
  resolveDashboardMode,
  type DashboardMode,
} from "~/lib/dashboard-mode";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

function modeCookie() {
  const env = getEnv();
  return createCookie(DASHBOARD_MODE_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production",
    maxAge: YEAR_SECONDS,
  });
}

export async function readDashboardMode(
  request: Request,
  role: "ADMIN" | "OPERATOR",
): Promise<DashboardMode> {
  const raw = await modeCookie().parse(request.headers.get("Cookie"));
  return resolveDashboardMode(raw, role);
}

export async function dashboardModeSetCookieHeader(
  mode: DashboardMode,
): Promise<string> {
  const parsed = parseDashboardMode(mode);
  if (!parsed) throw new Error("Invalid dashboard mode");
  return modeCookie().serialize(parsed);
}
