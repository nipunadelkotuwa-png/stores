import { Form, redirect, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import {
  inventoryActionError,
  postConversion,
} from "~/features/inventory/posting.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tires.conversion";
import { randomUUID } from "node:crypto";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const options = await getTransactionOptions(actor);
  options.parts = options.parts.filter(
    (p) =>
      p.name.toLowerCase().includes("tire") ||
      p.sku.toLowerCase().startsWith("tr-"),
  );
  return options;
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const form = Object.fromEntries(formData);

  const sourcePartId = String(form.sourcePartId);
  const targetPartId = String(form.targetPartId);
  const quantity = String(form.quantity);
  const businessDate = String(form.businessDate);
  const storeId = String(form.storeId);

  if (sourcePartId === targetPartId) {
    return { error: "Source and destination parts must be different" };
  }

  try {
    const result = await postConversion(actor, {
      storeId,
      businessDate,
      sourcePartId,
      targetPartId,
      quantity,
      idempotencyKey: randomUUID(),
    });

    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: inventoryActionError(error, "Unable to convert tires"),
    };
  }
}

export default function TireConversionPage({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const options = loaderData;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Lifecycle</p>
          <h1>Tire Conversion</h1>
          <p className="muted">
            Convert tires from one lifecycle stage to another (e.g., ORG to
            DAG1) after retreading.
          </p>
        </div>
      </div>
      <Form method="post" className="panel form-stack max-w-md">
        <CsrfField />
        {actionData?.error ? (
          <p className="form-error">{actionData.error}</p>
        ) : null}

        <label>
          Store
          <select name="storeId" required>
            {options.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Business date
          <input
            type="date"
            name="businessDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </label>

        <label>
          Original Part (Source)
          <select name="sourcePartId" required>
            <option value="">Select source tire...</option>
            {options.parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Retreaded Part (Destination)
          <select name="targetPartId" required>
            <option value="">Select destination tire...</option>
            {options.parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Quantity
          <input type="number" name="quantity" min="1" step="1" required />
        </label>

        <div className="form-actions">
          <button
            className="button button-primary"
            disabled={
              navigation.state !== "idle" || options.stores.length === 0
            }
          >
            {navigation.state === "submitting"
              ? "Converting…"
              : "Convert Tires"}
          </button>
        </div>
      </Form>
    </>
  );
}
