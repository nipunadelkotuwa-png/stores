import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { matchesScan } from "~/features/inventory/scan";
import { getScanCatalog } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.scan";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  return getScanCatalog(actor);
}

export default function ScanPage({ loaderData }: Route.ComponentProps) {
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [scannedPartId, setScannedPartId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const scannedPart = scannedPartId
    ? loaderData.catalog.find((part) => part.id === scannedPartId)
    : null;
  const scannedBalances = scannedPartId
    ? loaderData.balances.filter((row) => row.partId === scannedPartId)
    : [];
  const selectedBalance =
    scannedBalances.find((row) => row.storeId === selectedStoreId) ??
    (scannedBalances.length === 1 ? scannedBalances[0] : undefined);

  useEffect(() => {
    if (!scannedPartId) {
      setSelectedStoreId("");
      return;
    }
    const rows = loaderData.balances.filter(
      (row) => row.partId === scannedPartId,
    );
    setSelectedStoreId(rows.length === 1 ? rows[0].storeId : "");
  }, [scannedPartId, loaderData.balances]);

  useEffect(() => {
    if (scannedPart) return;
    const focusInterval = setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    }, 1000);
    return () => clearInterval(focusInterval);
  }, [scannedPart]);

  const handleScan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const barcode = String(formData.get("barcode")).trim();

    if (barcode) {
      setScannedBarcode(barcode);
      const found = loaderData.catalog.find((part) =>
        matchesScan(part, barcode),
      );
      setScannedPartId(found?.id ?? null);
    }
    e.currentTarget.reset();
  };

  const storeQuery = selectedBalance ? `&store=${selectedBalance.storeId}` : "";
  const issueUrl = scannedPart
    ? `/issues/new?part=${scannedPart.id}${storeQuery}`
    : "";
  const stockInUrl = scannedPart
    ? `/stock-in/new?part=${scannedPart.id}${storeQuery}`
    : "";
  const needsStorePick = scannedBalances.length > 1 && !selectedStoreId;
  const canIssue =
    Boolean(selectedBalance) && Number(selectedBalance?.onHand ?? 0) > 0;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Quick Action</p>
          <h1>Scan Barcode</h1>
          <p className="muted">
            Scan a part&apos;s QR code or barcode to quickly issue or restock
            it.
          </p>
        </div>
      </div>

      <div
        className="panel"
        style={{
          maxWidth: 600,
          margin: "0 auto",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <form
          onSubmit={handleScan}
          style={{ position: "absolute", left: "-9999px" }}
        >
          <input ref={inputRef} type="text" name="barcode" autoFocus />
        </form>

        {!scannedBarcode && (
          <div className="empty-state">
            <svg
              style={{
                width: 80,
                height: 80,
                margin: "0 auto 1rem",
                opacity: 0.2,
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <strong>Ready to scan</strong>
            <p>Point your barcode/QR scanner at a label...</p>
          </div>
        )}

        {scannedBarcode && !scannedPart && (
          <div className="empty-state" style={{ color: "var(--red)" }}>
            <strong>Part not found</strong>
            <p>
              No part matched the barcode:{" "}
              <span className="mono">{scannedBarcode}</span>
            </p>
            <button
              onClick={() => {
                setScannedBarcode("");
                setScannedPartId(null);
              }}
              className="button button-secondary"
              style={{ marginTop: "1rem" }}
            >
              Reset
            </button>
          </div>
        )}

        {scannedPart && (
          <div style={{ textAlign: "left" }}>
            <h2
              style={{
                borderBottom: "1px solid var(--line)",
                paddingBottom: "1rem",
                marginBottom: "1rem",
              }}
            >
              Part Detected
            </h2>
            <div style={{ display: "grid", gap: "1rem", marginBottom: "2rem" }}>
              <div>
                <p className="eyebrow">SKU</p>
                <p
                  className="mono"
                  style={{ fontSize: "1.2rem", fontWeight: "bold" }}
                >
                  {scannedPart.sku}
                </p>
              </div>
              <div>
                <p className="eyebrow">Name</p>
                <p>{scannedPart.name}</p>
              </div>
              {scannedBalances.length > 1 ? (
                <label>
                  Store
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    required
                  >
                    <option value="">Select store</option>
                    {scannedBalances.map((row) => (
                      <option key={row.storeId} value={row.storeId}>
                        {row.storeCode} — {row.store} ({row.onHand} {row.unit})
                      </option>
                    ))}
                  </select>
                </label>
              ) : selectedBalance ? (
                <div>
                  <p className="eyebrow">
                    Current Balance ({selectedBalance.store})
                  </p>
                  <p
                    className={`quantity ${Number(selectedBalance.onHand) <= Number(selectedBalance.reorderLevel ?? 0) ? "danger" : "positive"}`}
                    style={{ fontSize: "1.5rem" }}
                  >
                    {selectedBalance.onHand} {selectedBalance.unit}
                  </p>
                </div>
              ) : (
                <p className="muted">
                  No on-hand balance yet. Use Stock In to receive this part.
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={() => navigate(issueUrl)}
                className="button button-primary"
                style={{ flex: 1, padding: "1rem" }}
                disabled={!canIssue || needsStorePick}
              >
                Issue to Bus
              </button>
              <button
                onClick={() => navigate(stockInUrl)}
                className="button button-secondary"
                style={{ flex: 1, padding: "1rem" }}
                disabled={needsStorePick}
              >
                Stock In
              </button>
            </div>

            <button
              onClick={() => {
                setScannedBarcode("");
                setScannedPartId(null);
                setSelectedStoreId("");
              }}
              className="text-button"
              style={{ marginTop: "2rem", width: "100%", textAlign: "center" }}
            >
              Scan another item
            </button>
          </div>
        )}
      </div>
    </>
  );
}
