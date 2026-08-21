import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";

import { CameraBarcodeScan } from "~/components/camera-barcode-scan";
import { CsrfField } from "~/components/csrf-field";
import { matchesScan } from "~/features/inventory/scan";
import type {
  getBalances,
  getTransactionOptions,
} from "~/features/inventory/queries.server";
import type { listOpenJobCards } from "~/features/workshop/queries.server";

type Options = Awaited<ReturnType<typeof getTransactionOptions>>;
type OpenJobCards = Awaited<ReturnType<typeof listOpenJobCards>>;
type Balances = Awaited<ReturnType<typeof getBalances>>;

type CartLine = {
  partId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
};

type PosIssueCartProps = {
  options: Options;
  openJobCards: OpenJobCards;
  balances: Balances;
  unusualCounts: {
    partId: string;
    busId: string | null;
    issueCount: number;
  }[];
  unusualThreshold: number;
  initialPartId?: string;
  initialStoreId?: string;
  actionData?: { error?: string; lineErrors?: Record<number, string> };
};

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function PosIssueCart({
  options,
  openJobCards,
  balances,
  unusualCounts,
  unusualThreshold,
  initialPartId,
  initialStoreId,
  actionData,
}: PosIssueCartProps) {
  const navigation = useNavigation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [query, setQuery] = useState("");
  const [storeFilterId, setStoreFilterId] = useState(initialStoreId ?? "");
  const [jobCardId, setJobCardId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const selectedCard = openJobCards.find((card) => card.id === jobCardId);
  const storeId = selectedCard?.storeId ?? storeFilterId;

  const visibleCards = useMemo(() => {
    if (!storeFilterId) return openJobCards;
    return openJobCards.filter((card) => card.storeId === storeFilterId);
  }, [openJobCards, storeFilterId]);

  useEffect(() => {
    if (!jobCardId) return;
    if (visibleCards.some((card) => card.id === jobCardId)) return;
    setJobCardId("");
  }, [visibleCards, jobCardId]);

  useEffect(() => {
    if (jobCardId) return;
    if (visibleCards.length === 1) setJobCardId(visibleCards[0].id);
  }, [visibleCards, jobCardId]);

  const unitFor = useCallback(
    (partId: string) => {
      const row = balances.find((balance) => balance.partId === partId);
      return row?.unit ?? "EA";
    },
    [balances],
  );

  const onHandFor = useCallback(
    (partId: string) => {
      if (!storeId) return null;
      const row = balances.find(
        (balance) => balance.partId === partId && balance.storeId === storeId,
      );
      return row ? Number(row.onHand) : 0;
    },
    [balances, storeId],
  );

  useEffect(() => {
    if (!initialPartId || cart.length > 0) return;
    const part = options.parts.find((row) => row.id === initialPartId);
    if (!part) return;
    setCart([
      {
        partId: part.id,
        sku: part.sku,
        name: part.name,
        unit: unitFor(part.id),
        quantity: 1,
      },
    ]);
  }, [initialPartId, options.parts, cart.length, unitFor]);

  useEffect(() => {
    if (!storeId) return;
    let changed = false;
    const next = cart.flatMap((line) => {
      const onHand = onHandFor(line.partId);
      if (onHand == null || line.quantity <= onHand) return [line];
      changed = true;
      if (onHand <= 0) return [];
      return [{ ...line, quantity: onHand }];
    });
    if (!changed) return;
    setFeedback("Quantities adjusted to on-hand for the selected store.");
    setCart(next);
  }, [storeId, onHandFor, cart]);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    focus();
    const id = window.setInterval(() => {
      if (document.activeElement === searchRef.current) return;
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLButtonElement
      ) {
        return;
      }
      focus();
    }, 1200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (navigation.state !== "idle" || !actionData?.error) return;
    if (lastErrorRef.current === actionData.error) return;
    lastErrorRef.current = actionData.error;
    setIdempotencyKey(crypto.randomUUID());
  }, [navigation.state, actionData?.error]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return options.parts
      .filter(
        (part) =>
          part.sku.toLowerCase().includes(q) ||
          part.name.toLowerCase().includes(q) ||
          (part.barcode != null && part.barcode.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [options.parts, query]);

  const setLineQty = useCallback(
    (partId: string, nextQty: number) => {
      const onHand = onHandFor(partId);
      let qty = roundQty(nextQty);
      if (qty <= 0) {
        setCart((current) => current.filter((row) => row.partId !== partId));
        return;
      }
      if (onHand != null && qty > onHand) {
        qty = onHand;
        setFeedback(
          onHand <= 0
            ? "No stock on hand for this store."
            : `Limited to on-hand (${onHand}).`,
        );
      }
      setCart((current) =>
        current.map((row) =>
          row.partId === partId ? { ...row, quantity: qty } : row,
        ),
      );
    },
    [onHandFor],
  );

  const addPart = useCallback(
    (partId: string) => {
      const part = options.parts.find((row) => row.id === partId);
      if (!part) {
        setFeedback("Part not found.");
        return;
      }
      const onHand = onHandFor(part.id);
      if (onHand != null && onHand <= 0) {
        setFeedback(`No stock on hand for ${part.sku}.`);
        return;
      }
      setCart((current) => {
        const existing = current.find((line) => line.partId === part.id);
        if (existing) {
          const next = roundQty(existing.quantity + 1);
          if (onHand != null && next > onHand) {
            setFeedback(`Limited to on-hand (${onHand}).`);
            return current.map((line) =>
              line.partId === part.id ? { ...line, quantity: onHand } : line,
            );
          }
          return current.map((line) =>
            line.partId === part.id ? { ...line, quantity: next } : line,
          );
        }
        return [
          ...current,
          {
            partId: part.id,
            sku: part.sku,
            name: part.name,
            unit: unitFor(part.id),
            quantity: 1,
          },
        ];
      });
      setQuery("");
      setFeedback(`Added ${part.sku}`);
      searchRef.current?.focus();
    },
    [options.parts, unitFor, onHandFor],
  );

  function applyScanOrSearch(raw = query) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const exact = options.parts.find((part) => matchesScan(part, trimmed));
    if (exact) {
      addPart(exact.id);
      return;
    }
    const matches = options.parts.filter(
      (part) =>
        part.sku.toLowerCase().includes(trimmed.toLowerCase()) ||
        part.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        (part.barcode != null &&
          part.barcode.toLowerCase().includes(trimmed.toLowerCase())),
    );
    if (matches.length === 1) {
      addPart(matches[0].id);
      return;
    }
    setQuery(trimmed);
    setFeedback(
      matches.length === 0
        ? "No matching part."
        : "Multiple matches — pick one from the list.",
    );
  }

  const unusualParts =
    selectedCard == null
      ? []
      : cart.flatMap((line) => {
          const count =
            unusualCounts.find(
              (row) =>
                row.partId === line.partId && row.busId === selectedCard.busId,
            )?.issueCount ?? 0;
          if (count < unusualThreshold) return [];
          return [{ label: `${line.sku} — ${line.name}`, count }];
        });

  const overIssueLines = cart.filter((line) => {
    const onHand = onHandFor(line.partId);
    return onHand != null && line.quantity > onHand;
  });

  const canSubmit =
    Boolean(jobCardId) &&
    cart.length > 0 &&
    overIssueLines.length === 0 &&
    navigation.state === "idle";

  const newCardQuery = new URLSearchParams();
  if (storeFilterId) newCardQuery.set("store", storeFilterId);
  if (initialPartId) newCardQuery.set("part", initialPartId);
  const newCardHref = `/job-cards/new${newCardQuery.size ? `?${newCardQuery}` : ""}`;

  return (
    <div className="pos-issue">
      <div className="page-heading">
        <div>
          <p className="eyebrow">POS</p>
          <h1>Issue parts</h1>
          <p className="muted">
            Scan or search, adjust quantities, then submit against an open job
            card. <Link to="/issues/new">Classic issue form</Link>
          </p>
        </div>
      </div>

      <div className="pos-issue-layout">
        <section className="panel pos-issue-left">
          <div className="pos-filters">
            <label>
              Store
              <select
                value={storeFilterId}
                onChange={(event) => {
                  setStoreFilterId(event.target.value);
                  setJobCardId("");
                }}
              >
                <option value="">All stores</option>
                {options.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.code} — {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pos-job-select">
              Open job card
              {visibleCards.length === 0 ? (
                <p className="form-error">
                  Open a job card before issuing parts.{" "}
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
          </div>
          {selectedCard ? (
            <p className="muted" style={{ marginTop: 0 }}>
              {selectedCard.storeCode} · {selectedCard.fleetNumber}
              {selectedCard.registrationNumber
                ? ` — ${selectedCard.registrationNumber}`
                : ""}{" "}
              · {selectedCard.businessDate}
            </p>
          ) : null}

          <form
            className="pos-scan-form"
            onSubmit={(event) => {
              event.preventDefault();
              applyScanOrSearch();
            }}
          >
            <label>
              Scan or search
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFeedback(null);
                }}
                placeholder="Barcode, SKU, or part name"
                autoComplete="off"
                autoFocus
              />
            </label>
            <button type="submit" className="button button-secondary">
              Add
            </button>
          </form>
          <CameraBarcodeScan
            onDetected={(value) => {
              setQuery(value);
              applyScanOrSearch(value);
            }}
          />
          {feedback ? <p className="muted">{feedback}</p> : null}

          {suggestions.length > 0 && query.trim() ? (
            <ul className="pos-suggest-list">
              {suggestions.map((part) => {
                const onHand = onHandFor(part.id);
                return (
                  <li key={part.id}>
                    <button
                      type="button"
                      className="pos-suggest-item"
                      onClick={() => addPart(part.id)}
                    >
                      <span>
                        <strong className="mono">{part.sku}</strong>
                        <small>{part.name}</small>
                      </span>
                      <span className="quantity">
                        {onHand == null ? "—" : `${onHand} on hand`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="panel pos-issue-cart">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Cart</p>
              <h2>
                {cart.length} line{cart.length === 1 ? "" : "s"}
              </h2>
            </div>
            {cart.length > 0 ? (
              <button
                type="button"
                className="text-button"
                onClick={() => setCart([])}
              >
                Clear
              </button>
            ) : null}
          </div>

          {cart.length === 0 ? (
            <div className="empty-state">
              <strong>Cart is empty</strong>
              <p>Scan a barcode or search for a part to begin.</p>
            </div>
          ) : (
            <ul className="pos-cart-list">
              {cart.map((line, index) => {
                const onHand = onHandFor(line.partId);
                const over = onHand != null && line.quantity > onHand;
                const atMax = onHand != null && line.quantity >= onHand;
                const lineError = actionData?.lineErrors?.[index];
                return (
                  <li
                    key={line.partId}
                    className={over || lineError ? "has-error" : ""}
                  >
                    <div>
                      <strong className="mono">{line.sku}</strong>
                      <small>{line.name}</small>
                      <span className={`muted${over ? " danger-text" : ""}`}>
                        {onHand == null
                          ? "Select a store or job card to see on-hand"
                          : `On hand ${onHand}${over ? " — exceeds stock" : ""}`}
                      </span>
                      {lineError ? (
                        <span className="form-error">{lineError}</span>
                      ) : null}
                    </div>
                    <div className="pos-qty-controls">
                      <button
                        type="button"
                        className="button button-secondary"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          setLineQty(line.partId, roundQty(line.quantity - 1))
                        }
                      >
                        −
                      </button>
                      <input
                        className="pos-qty-input"
                        type="number"
                        min="0.001"
                        step="any"
                        value={line.quantity}
                        aria-label={`Quantity for ${line.sku}`}
                        onChange={(event) => {
                          const raw = Number(event.target.value);
                          if (!Number.isFinite(raw)) return;
                          setLineQty(line.partId, raw);
                        }}
                      />
                      <button
                        type="button"
                        className="button button-secondary"
                        aria-label="Increase quantity"
                        disabled={atMax}
                        onClick={() =>
                          setLineQty(line.partId, roundQty(line.quantity + 1))
                        }
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Form method="post" className="pos-issue-submit">
            <CsrfField />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="jobCardId" value={jobCardId} />
            <input
              type="hidden"
              name="storeId"
              value={selectedCard?.storeId ?? ""}
            />
            <input
              type="hidden"
              name="busId"
              value={selectedCard?.busId ?? ""}
            />
            <input
              type="hidden"
              name="businessDate"
              value={selectedCard?.businessDate ?? ""}
            />
            {cart.map((line) => (
              <span key={line.partId}>
                <input type="hidden" name="partId" value={line.partId} />
                <input
                  type="hidden"
                  name="quantity"
                  value={String(line.quantity)}
                />
              </span>
            ))}
            <label>
              Notes
              <textarea name="notes" rows={2} placeholder="Optional" />
            </label>
            {overIssueLines.length > 0 ? (
              <p className="form-error">
                Reduce quantities that exceed on-hand before submitting.
              </p>
            ) : null}
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
            <button
              className="button button-primary pos-submit-btn"
              disabled={!canSubmit}
            >
              {navigation.state === "submitting"
                ? "Submitting…"
                : "Submit for approval"}
            </button>
          </Form>
        </section>
      </div>
    </div>
  );
}
