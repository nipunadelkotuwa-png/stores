import { data } from "react-router";
import { countPendingApprovals } from "~/features/inventory/queries.server";
import {
  listInbox,
  markAllNotificationsRead,
  markNotificationRead,
} from "~/lib/notifications.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.notifications";

async function inboxPayload(actor: Awaited<ReturnType<typeof requireUser>>) {
  const inbox = await listInbox(actor.id);
  const pendingApprovals =
    actor.role === "ADMIN" ? await countPendingApprovals(actor) : 0;
  return { ...inbox, pendingApprovals };
}

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  return inboxPayload(actor);
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "");
  if (intent === "read") {
    await markNotificationRead(actor.id, String(formData.get("id") ?? ""));
  } else if (intent === "read-all") {
    await markAllNotificationsRead(actor.id);
  }
  return data(await inboxPayload(actor));
}
