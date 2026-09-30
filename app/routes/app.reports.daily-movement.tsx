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
import { getDailyMovements } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.daily-movement";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE, {
    period: "today",
  });
  const date =
    url.searchParams.get("date") ||
    range.end ||
    range.start ||
    new Date().toISOString().slice(0, 10);
  const actor = await requirePermission(request, "reports.read");
  const rows = await getDailyMovements(actor, date);
  return { date, rows, range };
}

export default function DailyMovementReport({
  loaderData,
}: Route.ComponentProps) {
  const [params] = useSearchParams();

  const totalIn = loaderData.rows
    .filter((r) => Number(r.delta) > 0)
    .reduce((acc, r) => acc + Number(r.delta), 0);
  const totalOut = loaderData.rows
    .filter((r) => Number(r.delta) < 0)
    .reduce((acc, r) => acc + Math.abs(Number(r.delta)), 0);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Daily Movement Report</h1>
        </div>
        <ReportActions
          filename={`daily-movement-${loaderData.date}`}
          documentTitle={`Daily Movement Report • ${loaderData.date}`}
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
          <input type="hidden" name="date" value={loaderData.date} />
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Daily report uses the period end date: {loaderData.date}
          </p>
        </Form>
      </section>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Daily Movement Report"
            department="Workshop & Fleet Inventory Management"
            date={loaderData.date}
            subtitle={`Period: ${loaderData.range.period || "Selected Date"} • Generated: ${new Date().toLocaleDateString("en-GB")}`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Report Date", value: loaderData.date, highlight: true },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Total Transactions", value: loaderData.rows.length },
                {
                  label: "Inflow / Outflow",
                  value: `+${totalIn.toFixed(2)} / -${totalOut.toFixed(2)}`,
                },
              ]}
            />
          </div>

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No inventory movements recorded for this date." />
          ) : (
            <ReportTable
              headers={[
                { label: "Document", width: "24%" },
                { label: "Store", width: "16%" },
                { label: "Part Details", width: "36%" },
                { label: "Movement", align: "right", width: "12%" },
                { label: "Balance", align: "right", width: "12%" },
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
                    <div style={{ fontSize: "8pt", color: "#6b7280", marginTop: "1px" }}>
                      {row.type.replace("_", " ")}
                    </div>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.store}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <strong style={{ fontSize: "9pt", color: "#111827" }}>{row.sku}</strong>
                    <div style={{ fontSize: "8pt", color: "#4b5563", marginTop: "1px" }}>
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
                      color: Number(row.delta) < 0 ? "#b91c1c" : "#15803d",
                    }}
                  >
                    {Number(row.delta) > 0 ? "+" : ""}
                    {row.delta}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "600",
                      fontSize: "9pt",
                      color: "#111827",
                    }}
                  >
                    {row.balance}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Total Transactions", value: loaderData.rows.length },
                { label: "Total Inflow Qty", value: `+${totalIn.toFixed(2)}` },
                { label: "Total Outflow Qty", value: `-${totalOut.toFixed(2)}` },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Storekeeper / Prepared By", description: "Report Compiler" },
                { role: "Workshop Supervisor", description: "Operations Review" },
                { role: "Inventory Auditor", description: "Verification & Audit" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Daily Movement Report"
            documentId={`DMR-${loaderData.date}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
