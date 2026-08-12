import { redirect, useActionData, useSearchParams } from "react-router";
import { StockForm } from "~/components/stock-form";
import {
  inventoryActionError,
  postStock,
} from "~/features/inventory/posting.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.issues.new";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  return getTransactionOptions(actor);
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
  const part = params.get("part");

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet usage</p>
          <h1>Issue parts to bus</h1>
          <p className="muted">
            Stock cannot fall below zero. The bus and resulting balance are
            recorded permanently.
          </p>
        </div>
      </div>
      <StockForm
        options={loaderData}
        kind="issue"
        actionData={actionData}
        initialPartId={part || undefined}
      />
    </>
  );
}
