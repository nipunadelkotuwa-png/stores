import { redirect, useActionData } from "react-router";
import { StockForm } from "~/components/stock-form";
import {
  inventoryActionError,
  postStock,
} from "~/features/inventory/posting.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { listOpenJobCards } from "~/features/workshop/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.returns.bus";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const [options, openJobCards] = await Promise.all([
    getTransactionOptions(actor),
    listOpenJobCards(actor),
  ]);
  return { options, openJobCards };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const form = Object.fromEntries(formData);
  try {
    const result = await postStock(actor, "BUS_RETURN", {
      ...form,
      lines: [{ partId: form.partId, quantity: form.quantity }],
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: inventoryActionError(error, "Unable to post bus return"),
    };
  }
}

export default function BusReturnPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet usage</p>
          <h1>Bus Return</h1>
          <p className="muted">
            Return unused parts or worn items from a bus against the open job
            card.
          </p>
        </div>
      </div>
      <StockForm
        options={loaderData.options}
        kind="bus_return"
        actionData={actionData}
        openJobCards={loaderData.openJobCards}
      />
    </>
  );
}
