import { useMemo, useState } from "react";
import { Link } from "react-router";
import QRCode from "react-qr-code";
import { db } from "~/db/client.server";
import { parts, partCategories } from "~/db/schema";
import { eq, asc } from "drizzle-orm";
import type { Route } from "./+types/app.parts.print-labels";
import { requireUser } from "~/lib/auth/authorization.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const allParts = await db
    .select({
      id: parts.id,
      sku: parts.sku,
      name: parts.name,
      barcode: parts.barcode,
      category: partCategories.name,
    })
    .from(parts)
    .leftJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .where(eq(parts.active, true))
    .orderBy(asc(parts.sku));
  return { parts: allParts };
}

export default function PrintLabelsPage({ loaderData }: Route.ComponentProps) {
  const allIds = useMemo(
    () => loaderData.parts.map((part) => part.id),
    [loaderData.parts],
  );
  const [selected, setSelected] = useState<string[]>(allIds);
  const selectedSet = new Set(selected);
  const selectedParts = loaderData.parts.filter((part) =>
    selectedSet.has(part.id),
  );

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Print Part Labels</h1>
          <p className="muted">
            QR code labels for inventory bins and parts. Uncheck parts you do
            not want to print.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/parts" className="button button-secondary">
            Back to Parts
          </Link>
          <button
            type="button"
            className="button button-secondary"
            onClick={() =>
              setSelected(selected.length === allIds.length ? [] : allIds)
            }
          >
            {selected.length === allIds.length ? "Clear all" : "Select all"}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => window.print()}
            disabled={selectedParts.length === 0}
          >
            Print {selectedParts.length} label
            {selectedParts.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      <div className="labels-grid">
        {loaderData.parts.map((part) => {
          const qrValue = part.barcode || part.sku;
          const isSelected = selectedSet.has(part.id);
          return (
            <div
              key={part.id}
              className={`label-card${isSelected ? "" : " label-card-hidden"}`}
            >
              <label className="no-print" style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(part.id)}
                />{" "}
                Include
              </label>
              <div className="label-qr">
                <QRCode value={qrValue} size={120} level="M" />
              </div>
              <div className="label-info">
                <strong>{part.sku}</strong>
                <p>{part.name}</p>
                <span>{part.category ?? "Uncategorized"}</span>
                <span className="mono">{qrValue}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
