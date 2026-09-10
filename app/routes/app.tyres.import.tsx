import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { workshopActionResult } from "~/features/workshop/errors";
import { listCategoryParts } from "~/features/workshop/queries.server";
import { skuMatchesLifecycleStage } from "~/features/workshop/tyre-lifecycle";
import { importOrgTyres } from "~/features/workshop/tyres.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tyres.import";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "tyres.manage");
  const [options, tyreParts] = await Promise.all([
    getTransactionOptions(actor),
    listCategoryParts("TYRE"),
  ]);
  return {
    stores: options.stores,
    suppliers: options.suppliers,
    parts: tyreParts.filter((part) =>
      skuMatchesLifecycleStage(part.sku, "ORG"),
    ),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requirePermission(request, "tyres.manage");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  try {
    const result = await importOrgTyres(actor, {
      ...Object.fromEntries(formData),
      serials: String(formData.get("serials") ?? ""),
    });
    throw redirect(
      `/tyres/import?ok=1&receipt=${result.receiptId}&count=${
        "tyreIds" in result && result.tyreIds ? result.tyreIds.length : ""
      }`,
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    return workshopActionResult(error, "Unable to import tyres");
  }
}

export default function ImportTyresPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [key] = useState(() => crypto.randomUUID());
  const today = new Date().toISOString().slice(0, 10);
  const imported = params.get("ok") === "1";

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>Import new tyres</h1>
          <p className="muted">
            Receive ORG stock and register serials in one transaction. Stage is
            always ORG.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/tyres">
            View tyres
          </Link>
          <Link className="button button-secondary" to="/job-cards">
            Fit to bus
          </Link>
        </div>
      </div>

      <Form
        method="post"
        className="panel form-panel stack"
        style={{ maxWidth: "40rem" }}
      >
        <CsrfField />
        <input type="hidden" name="idempotencyKey" value={key} />
        {imported ? (
          <p className="muted">
            Tyres imported. <Link to="/tyres">View tyres</Link> or{" "}
            <Link to="/job-cards">fit to a bus</Link>.
          </p>
        ) : null}
        {actionData?.error ? (
          <p className="form-error">{actionData.error}</p>
        ) : null}
        <label>
          Store
          <select name="storeId" required>
            <option value="">Select store</option>
            {loaderData.stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.code} — {store.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier
          <select name="supplierId" required>
            <option value="">Select supplier</option>
            {loaderData.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} — {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Invoice / purchase reference
          <input name="invoiceReference" />
        </label>
        <label>
          Business date
          <input
            type="date"
            name="businessDate"
            defaultValue={today}
            required
          />
        </label>
        <label>
          ORG tyre SKU
          <select name="partId" required>
            <option value="">Select SKU</option>
            {loaderData.parts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.sku} — {part.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input type="number" name="quantity" min={1} step={1} required />
        </label>
        <label>
          Unit cost
          <input
            name="unitCost"
            inputMode="decimal"
            required
            placeholder="0.00"
          />
        </label>
        <label>
          Serial numbers (one per line, must match quantity)
          <textarea name="serials" rows={8} required />
        </label>
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        <button
          className="button button-primary"
          disabled={navigation.state !== "idle"}
        >
          {navigation.state === "submitting" ? "Importing…" : "Import tyres"}
        </button>
      </Form>
    </>
  );
}
