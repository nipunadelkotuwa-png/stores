import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import type { getTransactionOptions } from "~/features/inventory/queries.server";
import type { listOpenJobCards } from "~/features/workshop/queries.server";
import { PartSelector } from "./part-selector";

type Options = Awaited<ReturnType<typeof getTransactionOptions>>;
type OpenJobCards = Awaited<ReturnType<typeof listOpenJobCards>>;

export function StockForm({
  options,
  kind,
  actionData,
  initialPartId,
  initialStoreId,
  openJobCards = [],
  unusualCounts = [],
  unusualThreshold = 3,
}: {
  options: Options;
  kind: "receipt" | "issue" | "bus_return";
  actionData?: { error?: string };
  initialPartId?: string;
  initialStoreId?: string;
  openJobCards?: OpenJobCards;
  unusualCounts?: {
    partId: string;
    busId: string | null;
    issueCount: number;
  }[];
  unusualThreshold?: number;
}) {
  const navigation = useNavigation();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const fleetKinds = kind === "issue" || kind === "bus_return";
  const visibleCards = initialStoreId
    ? openJobCards.filter((card) => card.storeId === initialStoreId)
    : openJobCards;
  const defaultCard =
    visibleCards.length === 1
      ? visibleCards[0].id
      : (visibleCards.find((card) => card.storeId === initialStoreId)?.id ??
        "");
  const [jobCardId, setJobCardId] = useState(defaultCard);
  const [partId, setPartId] = useState(initialPartId ?? "");
  const selectedCard = visibleCards.find((card) => card.id === jobCardId);
  const unusualCount =
    kind === "issue" && partId && selectedCard
      ? (unusualCounts.find(
          (row) => row.partId === partId && row.busId === selectedCard.busId,
        )?.issueCount ?? 0)
      : 0;
  const unusualWarning = unusualCount >= unusualThreshold;

  const newCardQuery = new URLSearchParams();
  if (initialStoreId) newCardQuery.set("store", initialStoreId);
  if (initialPartId) newCardQuery.set("part", initialPartId);
  const newCardHref = `/job-cards/new${newCardQuery.size ? `?${newCardQuery}` : ""}`;

  return (
    <Form method="post" className="panel transaction-form">
      <CsrfField />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {fleetKinds ? (
        <>
          <input type="hidden" name="jobCardId" value={jobCardId} />
          <input
            type="hidden"
            name="storeId"
            value={selectedCard?.storeId ?? ""}
          />
          <input type="hidden" name="busId" value={selectedCard?.busId ?? ""} />
          <input
            type="hidden"
            name="businessDate"
            value={selectedCard?.businessDate ?? ""}
          />
        </>
      ) : null}
      <div className="form-grid">
        {fleetKinds ? (
          <label style={{ gridColumn: "1 / -1" }}>
            Open job card
            {visibleCards.length === 0 ? (
              <p className="form-error">
                Open a job card before issuing or returning parts.{" "}
                <Link to={newCardHref}>Open job card</Link>
              </p>
            ) : (
              <select
                value={jobCardId}
                onChange={(event) => setJobCardId(event.target.value)}
                required
              >
                <option value="">Select job card</option>
                {visibleCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.jobNumber} — {card.fleetNumber} ({card.storeCode})
                  </option>
                ))}
              </select>
            )}
          </label>
        ) : (
          <>
            <label>
              Store
              {options.stores.length === 0 ? (
                <p className="form-error">
                  You are not assigned to any stores.
                </p>
              ) : (
                <select name="storeId" required defaultValue={initialStoreId}>
                  <option value="">Select store</option>
                  {options.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              )}
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
          </>
        )}
        {selectedCard ? (
          <p className="muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
            {selectedCard.storeCode} · {selectedCard.fleetNumber}
            {selectedCard.registrationNumber
              ? ` — ${selectedCard.registrationNumber}`
              : ""}{" "}
            · {selectedCard.businessDate}
          </p>
        ) : null}
        <label>
          Part
          <PartSelector
            name="partId"
            parts={options.parts}
            defaultValue={initialPartId}
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
      {unusualWarning ? (
        <p className="form-error">
          Unusual request: this part has been issued to{" "}
          {selectedCard?.fleetNumber} {unusualCount} times in the last 30 days
          (threshold {unusualThreshold}).
        </p>
      ) : null}
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      <div className="form-actions">
        <button
          className="button button-primary"
          disabled={
            navigation.state !== "idle" ||
            (fleetKinds
              ? visibleCards.length === 0 || !jobCardId
              : options.stores.length === 0)
          }
        >
          {navigation.state === "submitting"
            ? kind === "issue"
              ? "Submitting…"
              : "Posting…"
            : kind === "issue"
              ? "Submit for approval"
              : kind === "bus_return"
                ? "Post bus return"
                : "Post stock receipt"}
        </button>
      </div>
    </Form>
  );
}
