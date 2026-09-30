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
import { getBusUsage } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.bus-usage";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE);
  const bus = url.searchParams.get("bus") || undefined;
  return {
    ...(await getBusUsage(await requirePermission(request, "reports.read"), {
      start: range.start,
      end: range.end,
      bus,
    })),
    range,
  };
}

export default function BusUsagePage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const busFilter = params.get("bus");

  const totalQty = loaderData.rows.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0),
    0,
  );
  const dateLabel = `${loaderData.range.start || "All"} to ${loaderData.range.end || "Present"}`;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Fleet report</p>
          <h1>Bus-Wise Stock Issues</h1>
          <p className="muted">
            Spare parts and lubricants consumed by each bus asset.
          </p>
        </div>
        <ReportActions
          filename={`bus-usage-${busFilter ? busFilter + "-" : ""}${loaderData.range.period || "report"}`}
          documentTitle={`Bus-Wise Stock Issues • ${dateLabel}`}
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
        >
          <label>
            Bus Number
            <input
              type="text"
              name="bus"
              placeholder="e.g. B-001"
              defaultValue={busFilter || ""}
            />
          </label>
        </ReportPeriodFilter>
      </Form>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Bus-Wise Stock Issues"
            department="Workshop & Fleet Maintenance Department"
            date={loaderData.range.end || new Date().toISOString().slice(0, 10)}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})${busFilter ? ` • Filtered: ${busFilter}` : ""}`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                ...(busFilter ? [{ label: "Bus Filter", value: busFilter, highlight: true }] : []),
                { label: "Date Range", value: dateLabel },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Issue Records", value: loaderData.rows.length },
                { label: "Total Units Consumed", value: totalQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          {loaderData.truncated ? (
            <div
              style={{
                fontSize: "8.5pt",
                color: "#92400e",
                backgroundColor: "#fef3c7",
                padding: "4px 8px",
                borderRadius: "3px",
                marginBottom: "10px",
              }}
            >
              Note: Showing latest {loaderData.rows.length} lines. Use filters above to focus on specific buses.
            </div>
          ) : null}

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No spare parts issued to buses for the selected criteria." />
          ) : (
            <ReportTable
              headers={[
                { label: "Date", width: "11%" },
                { label: "Bus / Fleet", width: "16%" },
                { label: "Store", width: "15%" },
                { label: "Document", width: "18%" },
                { label: "Part Details", width: "28%" },
                { label: "Qty", align: "right", width: "12%" },
              ]}
            >
              {loaderData.rows.map((row, index) => (
                <tr
                  key={`${row.number}-${index}`}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: index % 2 === 1 ? "#fafbfc" : "#ffffff",
                  }}
                >
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.date}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <strong style={{ fontSize: "9pt", color: "#111827" }}>
                      {row.fleetNumber}
                    </strong>
                    {row.registration ? (
                      <div style={{ fontSize: "8pt", color: "#6b7280" }}>
                        {row.registration}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.store}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <Link
                      to={`/receipts/${row.id}`}
                      className="mono"
                      style={{ fontWeight: "700", color: "#111827", textDecoration: "none" }}
                    >
                      {row.number}
                    </Link>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <strong style={{ fontSize: "8.5pt", color: "#111827" }}>{row.sku}</strong>
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
                { label: "Total Issue Records", value: loaderData.rows.length },
                { label: "Total Quantity Consumed", value: totalQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Storekeeper / Issuing Officer", description: "Dispatched" },
                { role: "Fleet Maintenance Supervisor", description: "Verified by Fleet" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Bus-Wise Stock Issues"
            documentId={`BUS-USAGE-${loaderData.range.period || "PERIOD"}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
