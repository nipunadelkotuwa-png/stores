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
import { getLowStock } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.alerts.low-stock";

export async function loader({ request }: Route.LoaderArgs) {
  return {
    alerts: await getLowStock(
      await requirePermission(request, "balances.read"),
    ),
  };
}

export default function LowStockPage({ loaderData }: Route.ComponentProps) {
  const currentDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Attention required</p>
          <h1>Low-Stock Alerts</h1>
          <p className="muted">
            Parts at or below the location-specific reorder threshold.
          </p>
        </div>
        <ReportActions
          filename={`low-stock-alert-${currentDate}`}
          documentTitle={`Low-Stock Alert Report • ${currentDate}`}
          targetSelector="#printable-report"
        />
      </div>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Low-Stock Alert Report"
            department="Procurement & Inventory Replenishment"
            date={currentDate}
            status={loaderData.alerts.length > 0 ? "ACTION REQUIRED" : "NORMAL"}
            statusVariant={loaderData.alerts.length > 0 ? "danger" : "success"}
            subtitle="Immediate Reorder & Material Requisition Schedule"
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Report Date", value: currentDate },
                {
                  label: "Critical Shortage Items",
                  value: `${loaderData.alerts.length} SKU(s)`,
                  highlight: loaderData.alerts.length > 0,
                },
                {
                  label: "Procurement Urgency",
                  value: loaderData.alerts.length > 0 ? "HIGH / REORDER NOW" : "NORMAL",
                  highlight: loaderData.alerts.length > 0,
                },
                { label: "Department", value: "Central Stores & Workshop" },
              ]}
            />
          </div>

          {loaderData.alerts.length === 0 ? (
            <ReportEmptyState message="All stocked items and spare parts are safely above configured reorder levels." />
          ) : (
            <ReportTable
              headers={[
                { label: "Store", width: "16%" },
                { label: "SKU / Code", width: "18%" },
                { label: "Part Description", width: "32%" },
                { label: "On Hand", align: "right", width: "14%" },
                { label: "Reorder At", align: "right", width: "12%" },
                { label: "Action", align: "center", width: "8%" },
              ]}
            >
              {loaderData.alerts.map((row) => (
                <tr
                  key={`${row.store}-${row.sku}`}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: "#fff1f2",
                  }}
                >
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    <strong>{row.store}</strong>
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
                      fontSize: "9.5pt",
                      color: "#b91c1c",
                    }}
                  >
                    {row.onHand}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "600",
                      fontSize: "9pt",
                      color: "#4b5563",
                    }}
                  >
                    {row.reorderLevel}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", textAlign: "center" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "7.5pt",
                        fontWeight: "700",
                        backgroundColor: "#b91c1c",
                        color: "#ffffff",
                        letterSpacing: "0.04em",
                      }}
                    >
                      REORDER
                    </span>
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Items Below Minimum Safety Stock", value: loaderData.alerts.length, highlight: loaderData.alerts.length > 0 },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Storekeeper", description: "Shortage Flagged" },
                { role: "Purchasing Officer", description: "Purchase Order Initiated" },
                { role: "General Manager", description: "Expenditure Approved" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Low-Stock Alert Report"
            documentId={`ALERT-LOW-${currentDate}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
