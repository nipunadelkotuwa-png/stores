import { redirect, useActionData, useSearchParams } from "react-router";
import { StockForm } from "~/components/stock-form";
import {
  inventoryActionError,
  submitIssueForApproval,
} from "~/features/inventory/posting.server";
import {
  getRepetitiveIssueCounts,
  getTransactionOptions,
} from "~/features/inventory/queries.server";
import { UNUSUAL_ISSUE_THRESHOLD } from "~/features/workshop/constants";
import { listOpenJobCards } from "~/features/workshop/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.issues.new";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const storeId = url.searchParams.get("store") || undefined;
  const [options, openJobCards, unusualCounts] = await Promise.all([
    getTransactionOptions(actor),
    listOpenJobCards(actor, { storeId }),
    getRepetitiveIssueCounts(actor),
  ]);
  return {
    options,
    openJobCards,
    unusualCounts,
    unusualThreshold: UNUSUAL_ISSUE_THRESHOLD,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const form = Object.fromEntries(formData);
  try {
    const result = await submitIssueForApproval(actor, {
      ...form,
      lines: [{ partId: form.partId, quantity: form.quantity }],
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: inventoryActionError(error, "Unable to submit issue"),
    };
  }
}

export default function IssuePage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const [params] = useSearchParams();
  const part = params.get("part") || undefined;
  const store = params.get("store") || undefined;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet usage</p>
          <h1>Issue parts to bus</h1>
          <p className="muted">
            Issues must be posted against an open job card. An administrator
            must approve this issue before stock is deducted. Parts issued from
            a job card still post immediately.
          </p>
        </div>
      </div>
      <StockForm
        options={loaderData.options}
        kind="issue"
        actionData={actionData}
        initialPartId={part}
        initialStoreId={store}
        openJobCards={loaderData.openJobCards}
        unusualCounts={loaderData.unusualCounts}
        unusualThreshold={loaderData.unusualThreshold}
      />
    </>
  );
}
