import { useEffect, useRef, useState } from "react";
import { MAX_STOCK_LINES } from "~/features/inventory/form-lines";
import { PartSelector, type PartOption } from "./part-selector";

export type StockLineDraft = {
  partId: string;
  quantity: string;
};

type LineRow = {
  key: string;
  partId: string;
  quantity: string;
  cost: string;
};

export function StockLineItems({
  parts,
  initialPartId,
  cost,
  lineErrors,
  onLinesChange,
}: {
  parts: PartOption[];
  initialPartId?: string;
  cost?: {
    name: "unitCost" | "unitPrice";
    label: string;
    required?: boolean;
  };
  lineErrors?: Record<number, string>;
  onLinesChange?: (lines: StockLineDraft[]) => void;
}) {
  const [lines, setLines] = useState<LineRow[]>(() => [
    {
      key: crypto.randomUUID(),
      partId: initialPartId ?? "",
      quantity: "",
      cost: "",
    },
  ]);
  const onLinesChangeRef = useRef(onLinesChange);
  onLinesChangeRef.current = onLinesChange;

  function emit(next: LineRow[]) {
    onLinesChangeRef.current?.(
      next.map((line) => ({ partId: line.partId, quantity: line.quantity })),
    );
  }

  function notify(next: LineRow[]) {
    setLines(next);
    emit(next);
  }

  useEffect(() => {
    emit(lines);
  }, []);

  return (
    <div className="stock-lines">
      <div className="stock-lines-heading">
        <p className="eyebrow">Items</p>
      </div>
      {lines.map((line, index) => {
        const filled = Boolean(line.partId || line.quantity || line.cost);
        const rowRequired = index === 0 || filled;
        const takenIds = lines
          .filter((row) => row.key !== line.key && row.partId)
          .map((row) => row.partId);
        const rowError = lineErrors?.[index];
        return (
          <div
            key={line.key}
            className={`stock-line-row${cost ? " has-cost" : ""}${rowError ? " has-error" : ""}`}
          >
            <label>
              Part
              <PartSelector
                name="partId"
                parts={parts}
                defaultValue={line.partId || undefined}
                required={rowRequired}
                menuZIndex={20 + (lines.length - index)}
                disabledPartIds={takenIds}
                onChange={(partId) =>
                  notify(
                    lines.map((row) =>
                      row.key === line.key
                        ? { ...row, partId: partId ?? "" }
                        : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Quantity
              <input
                type="number"
                name="quantity"
                min="0.001"
                step="0.001"
                required={rowRequired}
                value={line.quantity}
                onChange={(event) =>
                  notify(
                    lines.map((row) =>
                      row.key === line.key
                        ? { ...row, quantity: event.target.value }
                        : row,
                    ),
                  )
                }
              />
            </label>
            {cost ? (
              <label>
                {cost.label}
                <input
                  type="number"
                  name={cost.name}
                  min="0"
                  step="0.01"
                  required={Boolean(cost.required && rowRequired)}
                  value={line.cost}
                  onChange={(event) =>
                    notify(
                      lines.map((row) =>
                        row.key === line.key
                          ? { ...row, cost: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
            ) : null}
            {lines.length > 1 ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  notify(lines.filter((row) => row.key !== line.key))
                }
              >
                Remove
              </button>
            ) : (
              <span />
            )}
            {rowError ? (
              <p className="form-error" style={{ gridColumn: "1 / -1" }}>
                {rowError}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="stock-lines-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={lines.length >= MAX_STOCK_LINES}
          onClick={() =>
            notify([
              ...lines,
              {
                key: crypto.randomUUID(),
                partId: "",
                quantity: "",
                cost: "",
              },
            ])
          }
        >
          Add item
        </button>
      </div>
    </div>
  );
}
