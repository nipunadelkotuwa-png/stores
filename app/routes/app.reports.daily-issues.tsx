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
import { getDailyIssues } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.daily-issues";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE, {
    period: "today",
  });
  const start =
    range.start ||
    url.searchParams.get("date") ||
    new Date().toISOString().slice(0, 10);
  const end = range.end || start;
  return {
    start,
    end,
    range,
    rows: await getDailyIssues(
      await requirePermission(request, "reports.read"),
      { start, end },
    ),
  };
}

export default function DailyIssuesPage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();

  const totalQuantity = loaderData.rows.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0),
    0,
  );

  const dateLabel =
    loaderData.start === loaderData.end
      ? loaderData.start
      : `${loaderData.start} to ${loaderData.end}`;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Daily Issues</h1>
          <p className="muted">Posted bus issues and parts consumption.</p>
        </div>
        <ReportActions
          filename={`daily-issues-${loaderData.start}`}
          documentTitle={`Daily Issues Report • ${dateLabel}`}
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
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Showing {dateLabel}
          </p>
        </Form>
      </section>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Daily Issues Report"
            department="Workshop & Fleet Stock Consumption"
            date={loaderData.end}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Date Range", value: dateLabel, highlight: true },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Total Transactions", value: loaderData.rows.length },
                { label: "Total Qty Issued", value: totalQuantity.toFixed(2), highlight: true },
              ]}
            />
          </div>

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No posted issues recorded for this period." />
          ) : (
            <ReportTable
              headers={[
                { label: "Date", width: "12%" },
                { label: "Document No", width: "22%" },
                { label: "Store", width: "14%" },
                { label: "Bus / Fleet", width: "14%" },
                { label: "Part Details", width: "28%" },
                { label: "Qty", align: "right", width: "10%" },
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
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.date}
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
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.store}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <strong style={{ fontSize: "8.5pt", color: "#111827" }}>
                      {row.fleetNumber ?? "—"}
                    </strong>
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
                { label: "Total Issue Records", value: loaderData.rows.length },
                { label: "Total Units Dispatched", value: totalQuantity.toFixed(2), highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Storekeeper / Issuing Officer", description: "Stock Issued" },
                { role: "Workshop Foreman", description: "Received & Checked" },
                { role: "Authorizing Officer", description: "Approval & Review" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Daily Issues Report"
            documentId={`DIR-${loaderData.start}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
