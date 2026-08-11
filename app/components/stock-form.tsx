import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import type { getTransactionOptions } from "~/features/inventory/queries.server";

type Options = Awaited<ReturnType<typeof getTransactionOptions>>;
export function StockForm({
  options,
  kind,
  actionData,
}: {
  options: Options;
  kind: "receipt" | "issue";
  actionData?: { error?: string };
}) {
  const navigation = useNavigation();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  return (
    <Form method="post" className="panel transaction-form">
      <CsrfField />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="form-grid">
        <label>
          Store
          <select name="storeId" required>
            <option value="">Select store</option>
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
        {kind === "issue" ? (
          <label>
            Bus
            <select name="busId" required>
              <option value="">Select bus</option>
              {options.buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fleetNumber}{" "}
                  {b.registrationNumber ? `— ${b.registrationNumber}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Supplier
            <select name="supplierId">
              <option value="">No supplier</option>
              {options.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Part
          <select name="partId" required>
            <option value="">Select spare part</option>
            {options.parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            name="quantity"
            min="0.001"
            step="0.001"
            required
          />
        </label>
        {kind === "receipt" ? (
          <label>
            Unit cost (LKR)
            <input type="number" name="unitCost" min="0" step="0.01" />
          </label>
        ) : null}
      </div>
      <label>
        Notes
        <textarea
          name="notes"
          rows={3}
          placeholder="Optional reference or comments"
        />
      </label>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      <div className="form-actions">
        <button
          className="button button-primary"
          disabled={navigation.state !== "idle"}
        >
          {navigation.state === "submitting"
            ? "Posting…"
            : kind === "issue"
              ? "Post bus issue"
              : "Post stock receipt"}
        </button>
      </div>
    </Form>
  );
}
