import { destroyUserSession } from "~/lib/auth/session.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/auth.logout";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  return destroyUserSession(request);
}

export async function loader() {
  throw new Response("Method Not Allowed", { status: 405 });
}
