import { redirect, useActionData, useSearchParams } from "react-router";
import { StockForm } from "~/components/stock-form";
import {
  inventoryActionError,
  postStock,
} from "~/features/inventory/posting.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.stock-in.new";

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
    const result = await postStock(actor, "STOCK_RECEIPT", {
      ...form,
      supplierId: form.supplierId || undefined,
      unitCost: undefined,
      lines: [
        {
          partId: form.partId,
          quantity: form.quantity,
          unitCost: form.unitCost || undefined,
        },
      ],
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: inventoryActionError(error, "Unable to post receipt"),
    };
  }
}

export default function StockInPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const [params] = useSearchParams();
  const part = params.get("part") || undefined;
  const store = params.get("store") || undefined;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Inventory movement</p>
          <h1>Record stock in</h1>
          <p className="muted">
            Post an auditable receipt into a store balance.
          </p>
        </div>
      </div>
      <StockForm
        options={loaderData}
        kind="receipt"
        actionData={actionData}
        initialPartId={part}
        initialStoreId={store}
      />
    </>
  );
}
