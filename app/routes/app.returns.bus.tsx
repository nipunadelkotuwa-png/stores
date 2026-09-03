import { redirect, useActionData } from "react-router";
import { StockForm } from "~/components/stock-form";
import {
  loadStockLines,
  stockLinesActionError,
} from "~/features/inventory/form-lines";
import {
  inventoryActionError,
  postStock,
} from "~/features/inventory/posting.server";
import {
  getReturnableItemsByJobCard,
  getTransactionOptions,
} from "~/features/inventory/queries.server";
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
  const returnableByJobCard = await getReturnableItemsByJobCard(
    actor,
    openJobCards.map((card) => card.id),
  );
  return { options, openJobCards, returnableByJobCard };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const form = Object.fromEntries(formData);
  const loaded = loadStockLines(formData);
  if (!loaded.ok) {
    return { error: loaded.error, lineErrors: loaded.lineErrors };
  }
  try {
    const result = await postStock(actor, "BUS_RETURN", {
      ...form,
      lines: loaded.lines,
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    const failure = stockLinesActionError(
      error,
      "Unable to post bus return",
      loaded.lines,
      inventoryActionError,
    );
    return { error: failure.error, lineErrors: failure.lineErrors };
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
            Return only parts that were issued on the selected open job card.
          </p>
        </div>
      </div>
      <StockForm
        options={loaderData.options}
        kind="bus_return"
        actionData={actionData}
        openJobCards={loaderData.openJobCards}
        returnableByJobCard={loaderData.returnableByJobCard}
      />
    </>
  );
}
