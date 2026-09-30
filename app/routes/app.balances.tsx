import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSignatures,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
import { getBalances } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.balances";

export async function loader({ request }: Route.LoaderArgs) {
  return {
    balances: await getBalances(
      await requirePermission(request, "balances.read"),
    ),
  };
}

export default function BalancesPage({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get("q")?.trim() ?? "",
  );

  useEffect(() => {
    setSearchQuery(searchParams.get("q")?.trim() ?? "");
  }, [searchParams]);

  const rows = loaderData.balances.filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      row.sku.toLowerCase().includes(q) || row.part.toLowerCase().includes(q)
    );
  });

  const lowStockCount = rows.filter(
    (r) => r.reorderLevel !== null && Number(r.onHand) <= Number(r.reorderLevel),
  ).length;

  const currentDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Live inventory</p>
          <h1>Stock Balances</h1>
          <p className="muted">
            Current on-hand physical stock quantity across all stores.
          </p>
        </div>
        <ReportActions
          filename={`stock-balances-${currentDate}`}
          documentTitle={`Stock Balances Register • ${currentDate}`}
          targetSelector="#printable-report"
        />
      </div>

      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "1.25rem",
        }}
      >
        <input
          type="search"
          placeholder="Filter SKU or Part Description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input"
          style={{
            padding: "0.5rem 0.85rem",
            width: "320px",
            borderRadius: "4px",
            border: "1px solid var(--border, #c5c9d4)",
          }}
        />
      </div>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Stock Balances Register"
            department="Central Stores & Inventory Valuation"
            date={currentDate}
            subtitle={`Physical Inventory Valuation & Warehouse Balances`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                ...(searchQuery ? [{ label: "Search Filter", value: searchQuery, highlight: true }] : []),
                { label: "Audit Date", value: currentDate },
                { label: "Total Active SKUs", value: rows.length, highlight: true },
                {
                  label: "Low Stock Items",
                  value: `${lowStockCount} items`,
                  highlight: lowStockCount > 0,
                },
              ]}
            />
          </div>

          {rows.length === 0 ? (
            <ReportEmptyState message="No physical stock balances matching search criteria." />
          ) : (
            <ReportTable
              headers={[
                { label: "Store", width: "16%" },
                { label: "SKU / Code", width: "18%" },
                { label: "Part Description", width: "34%" },
                { label: "On Hand", align: "right", width: "16%" },
                { label: "Reorder Lvl", align: "right", width: "16%" },
              ]}
            >
              {rows.map((row) => {
                const isLow =
                  row.reorderLevel !== null &&
                  Number(row.onHand) <= Number(row.reorderLevel);
                return (
                  <tr
                    key={`${row.storeCode}-${row.partId}`}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      backgroundColor: isLow ? "#fff1f2" : undefined,
                    }}
                  >
                    <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                      <strong style={{ fontSize: "8.5pt", color: "#111827" }}>
                        {row.storeCode}
                      </strong>
                      <div style={{ fontSize: "7.5pt", color: "#6b7280" }}>{row.store}</div>
                    </td>
                    <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                      <span className="mono" style={{ fontWeight: "700", color: "#111827" }}>
                        {row.sku}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                      <div style={{ fontSize: "9pt", fontWeight: "600", color: "#111827" }}>
                        {row.part}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        textAlign: "right",
                        fontFamily: "var(--font-mono, monospace)",
                        fontWeight: "700",
                        fontSize: "9pt",
                        color: isLow ? "#b91c1c" : "#111827",
                      }}
                    >
                      {row.onHand} <span style={{ fontSize: "7.5pt", color: "#6b7280" }}>{row.unit}</span>
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        textAlign: "right",
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "8.5pt",
                        color: isLow ? "#b91c1c" : "#4b5563",
                        fontWeight: isLow ? "700" : "500",
                      }}
                    >
                      {row.reorderLevel ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Listed Stock Lines", value: rows.length },
                { label: "Items Below Reorder Threshold", value: lowStockCount, highlight: lowStockCount > 0 },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Storekeeper", description: "Physical Balance Certified" },
                { role: "Internal Stock Controller", description: "Audit Approved" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Stock Balances Register"
            documentId={`BAL-${currentDate}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
