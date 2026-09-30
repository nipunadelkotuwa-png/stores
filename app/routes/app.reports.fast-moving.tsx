import { Form, Link, useSearchParams } from "react-router";
import { ReportPrintFooter, ReportPrintHeader } from "~/components/report-print-header";
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
  return (
    <>
      <ReportPrintHeader
        title="Fast Moving Items Summary"
        subtitle="Inventory Velocity & Consumption Analytics"
        metadata={[
          { label: "Period", value: loaderData.range.period },
          {
            label: "Date Range",
            value: `${loaderData.range.start || "—"} to ${loaderData.range.end || "—"}`,
          },
          { label: "Total Ranked Items", value: loaderData.rows.length },
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Fast Moving Items</h1>
          <p className="muted">Top issued parts within a date range</p>
        </div>
        <div>
          <button
            className="button button-primary"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <section className="panel no-print" style={{ marginBottom: "2rem" }}>
        <Form method="get">
          <ReportPeriodFilter
            period={loaderData.range.period}
            start={params.get("start") || loaderData.range.start}
            end={params.get("end") || loaderData.range.end}
          />
        </Form>
      </section>

      <section className="panel print-panel">
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>SKU</th>
                <th style={{ textAlign: "left" }}>Part Name</th>
                <th style={{ textAlign: "right" }}>Documents</th>
                <th style={{ textAlign: "right" }}>Total Issued</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    No items issued in this period.
                  </td>
                </tr>
              ) : (
                loaderData.rows.map((row, index) => (
                  <tr key={`${row.sku}-${index}`}>
                    <td className="mono">{row.sku}</td>
                    <td>{row.part}</td>
                    <td style={{ textAlign: "right" }}>{row.issueCount}</td>
                    <td style={{ textAlign: "right" }}>{row.totalIssued}</td>
                    <td className="no-print">
                      <Link to={`/issues/new?part=${row.partId}`}>Issue</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ReportPrintFooter reportName="Fast Moving Items Summary" />
    </>
  );
}
