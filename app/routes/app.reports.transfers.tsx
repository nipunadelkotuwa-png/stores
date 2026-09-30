import { Form, Link, useSearchParams } from "react-router";
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
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { getTransfers } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.transfers";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE);
  return {
    ...(await getTransfers(await requirePermission(request, "reports.read"), {
      start: range.start,
      end: range.end,
    })),
    range,
  };
}

export default function TransferReportPage({
  loaderData,
}: Route.ComponentProps) {
  const [params] = useSearchParams();

  const totalQty = loaderData.rows.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0),
    0,
  );
  const dateLabel = `${loaderData.range.start || "All"} to ${loaderData.range.end || "Present"}`;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Location Transfers</h1>
          <p className="muted">
            Posted transfer-out and transfer-in documents between store locations.
          </p>
        </div>
        <ReportActions
          filename={`transfers-${loaderData.range.period || "ledger"}`}
          documentTitle={`Location Transfers Ledger • ${dateLabel}`}
          targetSelector="#printable-report"
        />
      </div>

      <Form
        className="form-panel panel no-print"
        style={{ marginBottom: "1.5rem" }}
      >
        <ReportPeriodFilter
          period={loaderData.range.period}
          start={params.get("start") || loaderData.range.start}
          end={params.get("end") || loaderData.range.end}
        />
      </Form>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Location Transfers Ledger"
            department="Inter-Store Logistics & Movement"
            date={loaderData.range.end || new Date().toISOString().slice(0, 10)}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Date Range", value: dateLabel, highlight: true },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Transfer Documents", value: loaderData.rows.length },
                { label: "Total Transferred Units", value: totalQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No inter-store location transfers recorded in this date range." />
          ) : (
            <ReportTable
              headers={[
                { label: "Document", width: "20%" },
                { label: "Type", width: "12%" },
                { label: "Date", width: "11%" },
                { label: "Origin Store", width: "14%" },
                { label: "Destination", width: "14%" },
                { label: "Part Details", width: "20%" },
                { label: "Qty", align: "right", width: "9%" },
              ]}
            >
              {loaderData.rows.map((row, index) => (
                <tr
                  key={`${row.id}-${index}`}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: index % 2 === 1 ? "#fafbfc" : "#ffffff",
                  }}
                >
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <Link
                      to={`/receipts/${row.id}`}
                      className="mono"
                      style={{ fontWeight: "700", color: "#111827", textDecoration: "none" }}
                    >
                      {row.number}
                    </Link>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8pt" }}>
                    <span
                      style={{
                        padding: "1px 5px",
                        borderRadius: "2px",
                        backgroundColor: row.type.includes("OUT") ? "#fee2e2" : "#dcfce7",
                        color: row.type.includes("OUT") ? "#991b1b" : "#166534",
                        fontWeight: "600",
                      }}
                    >
                      {row.type.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.date}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.source}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.destination ?? "—"}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: "700", fontSize: "8.5pt", color: "#111827" }}>
                      {row.sku}
                    </div>
                    <div style={{ fontSize: "8pt", color: "#4b5563" }}>{row.part}</div>
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "700",
                      fontSize: "9pt",
                      color: "#111827",
                    }}
                  >
                    {row.quantity}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Transfer Rows", value: loaderData.rows.length },
                { label: "Total Transferred Qty", value: totalQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Dispatching Storekeeper", description: "Issued Out" },
                { role: "Receiving Storekeeper", description: "Stock Verified In" },
                { role: "Logistics Officer", description: "Audit Approved" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Location Transfers Ledger"
            documentId={`XFER-${loaderData.range.period || "ALL"}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
