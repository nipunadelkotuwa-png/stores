import { useMemo, useState } from "react";
import { Link } from "react-router";
import QRCode from "react-qr-code";
import { BarcodeSvg } from "~/components/barcode-svg";
import { db } from "~/db/client.server";
import { parts, partCategories } from "~/db/schema";
import { eq, asc } from "drizzle-orm";
import type { Route } from "./+types/app.parts.print-labels";
import { requirePermission } from "~/lib/auth/authorization.server";

type LabelMode = "qr" | "barcode" | "both";
type LabelSize = "50x25" | "50x30" | "70x40" | "a4";

const SIZE_PRESETS: { id: LabelSize; label: string }[] = [
  { id: "50x25", label: "50 × 25 mm" },
  { id: "50x30", label: "50 × 30 mm" },
  { id: "70x40", label: "70 × 40 mm" },
  { id: "a4", label: "A4 multi-label" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requirePermission(request, "masterData.read");
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

function LabelBody({
  part,
  mode,
  size,
}: {
  part: {
    sku: string;
    name: string;
    barcode: string | null;
    category: string | null;
  };
  mode: LabelMode;
  size: LabelSize;
}) {
  const codeValue = part.barcode || part.sku;
  return (
    <div className={`label-body label-mode-${mode}`}>
      <div className="label-info">
        <strong>SKU: {part.sku}</strong>
        <p>{part.name}</p>
      </div>
      {mode === "barcode" || mode === "both" ? (
        <div className="label-barcode">
          <BarcodeSvg value={codeValue} height={size === "50x25" ? 28 : 40} />
        </div>
      ) : null}
      {mode === "qr" || mode === "both" ? (
        <div className="label-qr">
          <QRCode
            value={codeValue}
            size={mode === "both" ? 64 : 120}
            level="M"
          />
        </div>
      ) : null}
      <div className="label-info">
        <span>{part.category ?? "Spare Parts"}</span>
        {mode === "qr" ? <span className="mono">{codeValue}</span> : null}
      </div>
    </div>
  );
}

export default function PrintLabelsPage({ loaderData }: Route.ComponentProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<LabelMode>("both");
  const [size, setSize] = useState<LabelSize>("50x30");
  const [copies, setCopies] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return loaderData.parts;
    return loaderData.parts.filter((part) =>
      [part.sku, part.name, part.barcode, part.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [loaderData.parts, query]);

  const filteredIds = useMemo(
    () => filtered.map((part) => part.id),
    [filtered],
  );
  const selectedSet = new Set(selected);
  const selectedParts = loaderData.parts.filter((part) =>
    selectedSet.has(part.id),
  );
  const printParts = selectedParts.flatMap((part) =>
    Array.from({ length: Math.max(1, copies) }, (_, index) => ({
      ...part,
      printKey: `${part.id}-${index}`,
    })),
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
            Print QR, Code 128 barcode, or both. Encoded value is barcode or
            SKU.
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
              setSelected(
                filteredIds.every((id) => selectedSet.has(id))
                  ? selected.filter((id) => !filteredIds.includes(id))
                  : [...new Set([...selected, ...filteredIds])],
              )
            }
          >
            {filteredIds.every((id) => selectedSet.has(id))
              ? "Clear filtered"
              : "Select filtered"}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => window.print()}
            disabled={selectedParts.length === 0}
          >
            Print {printParts.length} label
            {printParts.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      <section
        className="panel form-panel no-print"
        style={{ marginBottom: "1.5rem" }}
      >
        <div
          className="form-grid"
          style={{
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            alignItems: "end",
          }}
        >
          <label>
            Search parts
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SKU, barcode, or name"
            />
          </label>
          <label>
            Label type
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as LabelMode)}
            >
              <option value="qr">QR</option>
              <option value="barcode">Barcode</option>
              <option value="both">Barcode + QR</option>
            </select>
          </label>
          <label>
            Label size
            <select
              value={size}
              onChange={(event) => setSize(event.target.value as LabelSize)}
            >
              {SIZE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Copies per item
            <input
              type="number"
              min={1}
              max={20}
              value={copies}
              onChange={(event) =>
                setCopies(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
        </div>
      </section>

      <div className={`labels-grid labels-size-${size} no-print`}>
        {filtered.map((part) => {
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
              <LabelBody part={part} mode={mode} size={size} />
            </div>
          );
        })}
      </div>

      <div className={`labels-grid labels-size-${size} labels-print-only`}>
        {printParts.map((part) => (
          <div key={part.printKey} className="label-card">
            <LabelBody part={part} mode={mode} size={size} />
          </div>
        ))}
      </div>
    </>
  );
}
