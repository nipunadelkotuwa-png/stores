import { Form, Link, useSearchParams } from "react-router";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { getDailyIssues } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.daily-issues";

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
  return {
    date,
    range,
    rows: await getDailyIssues(await requireUser(request), date),
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
          <p className="muted">Posted bus issues for one business date.</p>
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
            Uses period end date: {loaderData.date}
          </p>
        </Form>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
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
                  <td colSpan={5}>No posted issues for this date.</td>
                </tr>
              ) : (
                loaderData.rows.map((row, index) => (
                  <tr key={`${row.id}-${index}`}>
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
