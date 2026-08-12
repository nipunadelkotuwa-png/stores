import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { getBalances } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.scan";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const balances = await getBalances(await requireUser(request));
  return { balances };
}

export default function ScanPage({ loaderData }: Route.ComponentProps) {
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [scannedPart, setScannedPart] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Keep focus on the hidden input to capture scanner input
    const focusInterval = setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    }, 1000);
    return () => clearInterval(focusInterval);
  }, []);

  const handleScan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const barcode = String(formData.get("barcode")).trim();

    if (barcode) {
      setScannedBarcode(barcode);
      // Try to find the part by SKU or Barcode
      const found = loaderData.balances.find(
        (b) => b.sku.toLowerCase() === barcode.toLowerCase(),
      );
      setScannedPart(found || null);
    }
    // Clear input for next scan
    e.currentTarget.reset();
  };

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Quick Action</p>
          <h1>Scan Barcode</h1>
          <p className="muted">
            Scan a part's QR code or barcode to quickly issue or restock it.
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
        {/* Hidden form to capture barcode scanner input */}
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
              onClick={() => setScannedBarcode("")}
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
                <p>{scannedPart.part}</p>
              </div>
              <div>
                <p className="eyebrow">Current Balance ({scannedPart.store})</p>
                <p
                  className={`quantity ${Number(scannedPart.onHand) <= (scannedPart.reorderLevel || 0) ? "danger" : "positive"}`}
                  style={{ fontSize: "1.5rem" }}
                >
                  {scannedPart.onHand} {scannedPart.unit}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={() => navigate(`/issues/new?part=${scannedPart.sku}`)}
                className="button button-primary"
                style={{ flex: 1, padding: "1rem" }}
              >
                Issue to Bus
              </button>
              <button
                onClick={() =>
                  navigate(`/stock-in/new?part=${scannedPart.sku}`)
                }
                className="button button-secondary"
                style={{ flex: 1, padding: "1rem" }}
              >
                Stock In
              </button>
            </div>

            <button
              onClick={() => {
                setScannedBarcode("");
                setScannedPart(null);
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
