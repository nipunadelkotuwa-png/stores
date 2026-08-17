import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { PartSelector } from "~/components/part-selector";
import { workshopActionError } from "~/features/workshop/errors";
import { listInStoreTyres } from "~/features/workshop/queries.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { sendStoreTransfer } from "~/features/inventory/transfers.server";
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
  try {
    const result = await sendStoreTransfer(actor, {
      ...form,
      tyreIds: formData.getAll("tyreIds"),
      lines: [{ partId: form.partId, quantity: form.quantity }],
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: workshopActionError(error, "Unable to send transfer") };
  }
}

export default function NewTransferPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [partId, setPartId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const selected = loaderData.options.parts.find((part) => part.id === partId);
  const isTyre = selected?.categoryCode === "TYRE";
  const serials = loaderData.inStoreTyres.filter(
    (tyre) =>
      tyre.sku === selected?.sku && (!storeId || tyre.storeId === storeId),
  );

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
          <label>
            Part
            <PartSelector
              name="partId"
              parts={loaderData.options.parts}
              required
              onChange={(id) => setPartId(id ?? "")}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              name="quantity"
              min="0.001"
              step="0.001"
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
        </div>
        {isTyre ? (
          <fieldset className="stack">
            <legend>Tyre serials (required)</legend>
            {serials.length === 0 ? (
              <p className="form-error">
                Register in-store serials for this SKU before transferring.
              </p>
            ) : (
              serials.map((tyre) => (
                <label key={tyre.id} style={{ display: "flex", gap: "0.5rem" }}>
                  <input type="checkbox" name="tyreIds" value={tyre.id} />
                  {tyre.serialNumber} ({tyre.store})
                </label>
              ))
            )}
          </fieldset>
        ) : null}
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
