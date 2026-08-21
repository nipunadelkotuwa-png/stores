import { redirect } from "react-router";

import {
  parseDashboardMode,
  toggleDashboardMode,
  type DashboardMode,
} from "~/lib/dashboard-mode";
import {
  dashboardModeSetCookieHeader,
  readDashboardMode,
} from "~/lib/dashboard-mode.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.dashboard-mode";

function safeRedirectTo(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "/").trim() || "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);

  const requested = parseDashboardMode(formData.get("mode"));
  const current = await readDashboardMode(request, actor.role);
  const next: DashboardMode = requested ?? toggleDashboardMode(current);
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await dashboardModeSetCookieHeader(next),
    },
  });
}

export async function loader() {
  throw new Response("Method Not Allowed", { status: 405 });
}
