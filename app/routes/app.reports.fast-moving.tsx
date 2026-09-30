import { Form, useSearchParams } from "react-router";
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
import { getFastMovingParts } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.fast-moving";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE, {
    period: "last_30_days",
  });
  const actor = await requirePermission(request, "reports.read");
  const rows = await getFastMovingParts(
    actor,
    range.start ?? "",
    range.end ?? "",
  );
  return { range, rows };
}

export default function FastMovingReport({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();

  const totalIssuedQty = loaderData.rows.reduce(
    (sum, r) => sum + (Number(r.totalIssued) || 0),
    0,
  );
  const dateLabel = `${loaderData.range.start || "—"} to ${loaderData.range.end || "—"}`;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Fast Moving Items</h1>
          <p className="muted">Top high-velocity spare parts ranked by consumption.</p>
        </div>
        <ReportActions
          filename={`fast-moving-${loaderData.range.period || "report"}`}
          documentTitle={`Fast Moving Items Summary • ${dateLabel}`}
          targetSelector="#printable-report"
        />
      </div>

      <section className="panel no-print" style={{ marginBottom: "1.5rem" }}>
        <Form method="get">
          <ReportPeriodFilter
            period={loaderData.range.period}
            start={params.get("start") || loaderData.range.start}
            end={params.get("end") || loaderData.range.end}
          />
        </Form>
      </section>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Fast Moving Items Summary"
            department="Inventory Velocity & Consumption Analytics"
            date={loaderData.range.end || new Date().toISOString().slice(0, 10)}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Date Range", value: dateLabel, highlight: true },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Ranked Items", value: loaderData.rows.length },
                { label: "Total Volume Issued", value: totalIssuedQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No inventory items issued in this period." />
          ) : (
            <ReportTable
              headers={[
                { label: "#", width: "6%" },
                { label: "SKU / Code", width: "20%" },
                { label: "Part Description", width: "42%" },
                { label: "Issues Count", align: "right", width: "16%" },
                { label: "Total Units", align: "right", width: "16%" },
              ]}
            >
              {loaderData.rows.map((row, index) => (
                <tr
                  key={`${row.sku}-${index}`}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: index < 3 ? "#fefce8" : index % 2 === 1 ? "#fafbfc" : "#ffffff",
                  }}
                >
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      fontSize: "8.5pt",
                      fontWeight: index < 3 ? "700" : "500",
                      color: index < 3 ? "#b45309" : "#6b7280",
                    }}
                  >
                    #{index + 1}
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
                      fontSize: "8.5pt",
                      color: "#4b5563",
                    }}
                  >
                    {row.issueCount}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "700",
                      fontSize: "9.5pt",
                      color: "#111827",
                    }}
                  >
                    {row.totalIssued}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Total Tracked Items", value: loaderData.rows.length },
                { label: "Cumulative Volume Issued", value: totalIssuedQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Inventory Analyst", description: "Analytics Prepared" },
                { role: "Procurement Officer", description: "Reordering Reviewed" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Fast Moving Items Summary"
            documentId={`FAST-${loaderData.range.period || "PERIOD"}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
