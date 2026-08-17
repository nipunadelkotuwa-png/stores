import { redirect, useActionData, useSearchParams } from "react-router";
import { StockForm } from "~/components/stock-form";
import {
  inventoryActionError,
  postStock,
} from "~/features/inventory/posting.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { listOpenJobCards } from "~/features/workshop/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.issues.new";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const storeId = url.searchParams.get("store") || undefined;
  const [options, openJobCards] = await Promise.all([
    getTransactionOptions(actor),
    listOpenJobCards(actor, { storeId }),
  ]);
  return { options, openJobCards };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const form = Object.fromEntries(formData);
  try {
    const result = await postStock(actor, "BUS_ISSUE", {
      ...form,
      lines: [{ partId: form.partId, quantity: form.quantity }],
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: inventoryActionError(error, "Unable to post issue"),
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
            Issues must be posted against an open job card. Stock cannot fall
            below zero.
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
      />
    </>
  );
}
