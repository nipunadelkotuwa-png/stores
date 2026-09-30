import { Form, Link, useSearchParams } from "react-router";
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
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Daily issues</h1>
          <p className="muted">Posted bus issues for the selected period.</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
      <section className="panel no-print" style={{ marginBottom: "1.5rem" }}>
        <Form method="get">
          <ReportPeriodFilter
            period={loaderData.range.period}
            start={params.get("start") || loaderData.range.start}
            end={params.get("end") || loaderData.range.end}
          />
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Showing {loaderData.start}
            {loaderData.start !== loaderData.end ? ` to ${loaderData.end}` : ""}
          </p>
        </Form>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Document</th>
                <th>Store</th>
                <th>Bus</th>
                <th>Part</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No posted issues for this period.</td>
                </tr>
              ) : (
                loaderData.rows.map((row, index) => (
                  <tr key={`${row.id}-${index}`}>
                    <td>{row.date}</td>
                    <td className="mono">
                      <Link to={`/receipts/${row.id}`}>{row.number}</Link>
                    </td>
                    <td>{row.store}</td>
                    <td>{row.fleetNumber ?? "—"}</td>
                    <td>
                      {row.sku} — {row.part}
                    </td>
                    <td>{row.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
