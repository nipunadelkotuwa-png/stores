import { Form, Link, useSearchParams } from "react-router";
import { ReportPrintFooter, ReportPrintHeader } from "~/components/report-print-header";
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
  return (
    <>
      <ReportPrintHeader
        title="Daily Movement Report"
        subtitle="Central Workshop & Fleet Inventory Management"
        metadata={[
          { label: "Date", value: loaderData.date },
          { label: "Period Filter", value: loaderData.range.period },
          { label: "Total Movements", value: loaderData.rows.length },
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Daily Movement Report</h1>
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
          <input type="hidden" name="date" value={loaderData.date} />
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Daily report uses the period end date: {loaderData.date}
          </p>
        </Form>
      </section>

      <section className="panel print-panel">
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Document</th>
                <th style={{ textAlign: "left" }}>Store</th>
                <th style={{ textAlign: "left" }}>Part</th>
                <th style={{ textAlign: "right" }}>Movement</th>
                <th style={{ textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    No movements recorded for this date.
                  </td>
                </tr>
              ) : (
                loaderData.rows.map((row, index) => (
                  <tr key={`${row.id}-${index}`}>
                    <td>
                      <Link to={`/receipts/${row.id}`} className="mono">
                        {row.number}
                      </Link>
                      <br />
                      <small>{row.type.replace("_", " ")}</small>
                    </td>
                    <td>{row.store}</td>
                    <td>
                      <strong>{row.sku}</strong>
                      <br />
                      <small>{row.part}</small>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color:
                          Number(row.delta) < 0
                            ? "var(--color-danger)"
                            : "var(--color-positive)",
                      }}
                    >
                      {Number(row.delta) > 0 ? "+" : ""}
                      {row.delta}
                    </td>
                    <td style={{ textAlign: "right" }}>{row.balance}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ReportPrintFooter reportName="Daily Movement Report" />
    </>
  );
}
