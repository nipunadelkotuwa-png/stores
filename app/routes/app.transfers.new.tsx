import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { StockLineItems } from "~/components/stock-line-items";
import {
  loadStockLines,
  stockLinesActionError,
} from "~/features/inventory/form-lines";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { sendStoreTransfer } from "~/features/inventory/transfers.server";
import { workshopActionError } from "~/features/workshop/errors";
import { listInStoreTyres } from "~/features/workshop/queries.server";
import { listStores } from "~/features/master-data/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.transfers.new";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const [options, allStores, inStoreTyres] = await Promise.all([
    getTransactionOptions(actor),
    listStores(),
    listInStoreTyres(actor),
  ]);
  return {
    options,
    destinations: allStores.filter((store) => store.active),
    inStoreTyres,
  };
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
    const result = await sendStoreTransfer(actor, {
      ...form,
      tyreIds: formData.getAll("tyreIds"),
      lines: loaded.lines,
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    const failure = stockLinesActionError(
      error,
      "Unable to send transfer",
      loaded.lines,
      workshopActionError,
    );
    return { error: failure.error, lineErrors: failure.lineErrors };
  }
}

export default function NewTransferPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [storeId, setStoreId] = useState("");
  const [drafts, setDrafts] = useState<{ partId: string; quantity: string }[]>(
    [],
  );
  const tyreParts = [
    ...new Map(
      drafts.flatMap((draft) => {
        const part = loaderData.options.parts.find(
          (row) => row.id === draft.partId,
        );
        return part?.categoryCode === "TYRE" ? [[part.id, part] as const] : [];
      }),
    ).values(),
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Locations</p>
          <h1>Send transfer</h1>
          <p className="muted">
            Deducts stock at the source immediately. The destination receives it
            in a second step.
          </p>
        </div>
        <Link className="button button-secondary" to="/transfers">
          In transit
        </Link>
      </div>

      <Form method="post" className="panel transaction-form">
        <CsrfField />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <div className="form-grid">
          <label>
            Source store
            <select
              name="storeId"
              required
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
            >
              <option value="">Select store</option>
              {loaderData.options.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code} — {store.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination store
            <select name="destinationStoreId" required>
              <option value="">Select destination</option>
              {loaderData.destinations.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code} — {store.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Business date
            <input
              type="date"
              name="businessDate"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
        </div>
        <StockLineItems
          parts={loaderData.options.parts}
          onLinesChange={setDrafts}
          lineErrors={actionData?.lineErrors}
        />
        {tyreParts.map((part) => {
          const expected = drafts
            .filter((draft) => draft.partId === part.id)
            .reduce((sum, draft) => sum + Number(draft.quantity || 0), 0);
          const needed = Number.isFinite(expected) ? expected : 0;
          const serials = loaderData.inStoreTyres.filter(
            (tyre) =>
              tyre.sku === part.sku && (!storeId || tyre.storeId === storeId),
          );
          const countLabel =
            needed > 0 ? `select ${needed}` : "select as many as the quantity";
          return (
            <fieldset key={part.id} className="stack">
              <legend>
                Tyre serials for {part.sku} ({countLabel})
              </legend>
              {serials.length === 0 ? (
                <p className="form-error">
                  Register in-store serials for this SKU before transferring.
                </p>
              ) : (
                serials.map((tyre) => (
                  <label
                    key={tyre.id}
                    style={{ display: "flex", gap: "0.5rem" }}
                  >
                    <input type="checkbox" name="tyreIds" value={tyre.id} />
                    {tyre.serialNumber} ({tyre.store})
                  </label>
                ))
              )}
            </fieldset>
          );
        })}
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        {actionData?.error ? (
          <p className="form-error">{actionData.error}</p>
        ) : null}
        <button
          className="button button-primary"
          disabled={navigation.state !== "idle"}
        >
          Send transfer
        </button>
      </Form>
    </>
  );
}
