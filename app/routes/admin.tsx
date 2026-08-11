import { Outlet } from "react-router";

import { requireAdmin } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/admin";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export default function AdminLayout() {
  return <Outlet />;
}
