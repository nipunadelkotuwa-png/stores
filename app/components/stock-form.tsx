import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { StockLineItems } from "~/components/stock-line-items";
import type {
  getReturnableJobCardItems,
  getTransactionOptions,
} from "~/features/inventory/queries.server";
import type { listOpenJobCards } from "~/features/workshop/queries.server";

type Options = Awaited<ReturnType<typeof getTransactionOptions>>;
type OpenJobCards = Awaited<ReturnType<typeof listOpenJobCards>>;
type ReturnableItems = Awaited<ReturnType<typeof getReturnableJobCardItems>>;

export function StockForm({
  options,
  kind,
  actionData,
  initialPartId,
  initialStoreId,
  openJobCards = [],
  returnableByJobCard = {},
  unusualCounts = [],
  unusualThreshold = 3,
}: {
  options: Options;
  kind: "receipt" | "issue" | "bus_return";
  actionData?: { error?: string; lineErrors?: Record<number, string> };
  initialPartId?: string;
  initialStoreId?: string;
  openJobCards?: OpenJobCards;
  returnableByJobCard?: Record<string, ReturnableItems>;
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
  const [partIds, setPartIds] = useState<string[]>(
    initialPartId ? [initialPartId] : [],
  );
  const selectedCard = visibleCards.find((card) => card.id === jobCardId);
  const returnableItems =
    kind === "bus_return" && jobCardId
      ? (returnableByJobCard[jobCardId] ?? [])
      : [];
  const returnableParts = returnableItems.map((item) => ({
    id: item.partId,
    sku: item.sku,
    name: `${item.name} (avail ${item.available})`,
    barcode: null as string | null,
    categoryId: null as string | null,
    categoryName: null as string | null,
    categoryCode: null as string | null,
    unit: item.unit,
  }));
  const maxQuantityByPartId =
    kind === "bus_return"
      ? Object.fromEntries(
          returnableItems.map((item) => [item.partId, Number(item.available)]),
        )
      : undefined;
  const lineParts = kind === "bus_return" ? returnableParts : options.parts;
  const unusualParts =
    kind === "issue" && selectedCard
      ? partIds.flatMap((partId) => {
          if (!partId) return [];
          const count =
            unusualCounts.find(
              (row) =>
                row.partId === partId && row.busId === selectedCard.busId,
            )?.issueCount ?? 0;
          if (count < unusualThreshold) return [];
          const part = options.parts.find((row) => row.id === partId);
          return [
            {
              label: part ? `${part.sku} — ${part.name}` : partId,
              count,
            },
          ];
        })
      : [];

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
      </div>
      {kind === "bus_return" && jobCardId && returnableItems.length === 0 ? (
        <p className="muted">
          No returnable parts on this job card. Only posted issued quantities
          that have not yet been returned can be selected.
        </p>
      ) : (
        <StockLineItems
          key={kind === "bus_return" ? jobCardId : "default"}
          parts={lineParts}
          initialPartId={
            kind === "bus_return" &&
            initialPartId &&
            returnableItems.some((item) => item.partId === initialPartId)
              ? initialPartId
              : kind === "bus_return"
                ? undefined
                : initialPartId
          }
          onLinesChange={(rows) => setPartIds(rows.map((row) => row.partId))}
          lineErrors={actionData?.lineErrors}
          maxQuantityByPartId={maxQuantityByPartId}
          cost={
            kind === "receipt"
              ? { name: "unitCost", label: "Unit cost (LKR)" }
              : undefined
          }
        />
      )}
      {kind === "bus_return" && returnableItems.length > 0 ? (
        <div className="table-wrap" style={{ marginBottom: "1rem" }}>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>Issued</th>
                <th>Returned</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {returnableItems.map((item) => (
                <tr key={item.partId}>
                  <td className="mono">{item.sku}</td>
                  <td>{item.name}</td>
                  <td className="quantity">{item.issued}</td>
                  <td className="quantity">{item.returned}</td>
                  <td className="quantity">{item.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <label>
        Notes
        <textarea
          name="notes"
          rows={3}
          placeholder="Optional reference or comments"
        />
      </label>
      {unusualParts.length > 0 ? (
        <p className="form-error">
          Unusual request:{" "}
          {unusualParts
            .map(
              (row) =>
                `${row.label} has been issued to ${selectedCard?.fleetNumber} ${row.count} times in the last 30 days`,
            )
            .join("; ")}{" "}
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
              ? visibleCards.length === 0 ||
                !jobCardId ||
                (kind === "bus_return" && returnableItems.length === 0)
              : options.stores.length === 0)
          }
        >
          {navigation.state === "submitting"
            ? kind === "issue"
              ? "Submitting…"
              : "Posting…"
            : kind === "issue"
              ? "Submit for verification"
              : kind === "bus_return"
                ? "Post bus return"
                : "Post stock receipt"}
        </button>
      </div>
    </Form>
  );
}
