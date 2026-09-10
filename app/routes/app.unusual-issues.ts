import { getRepetitiveIssueCounts } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.unusual-issues";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "issues.create");
  const jobCardId = new URL(request.url).searchParams.get("jobCard") ?? "";
  return {
    jobCardId,
    counts: await getRepetitiveIssueCounts(actor),
  };
}
