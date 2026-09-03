import { Form, Link, useSearchParams } from "react-router";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { getBusUsage } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.bus-usage";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE);
  const bus = url.searchParams.get("bus") || undefined;
  return {
    ...(await getBusUsage(await requireUser(request), {
      start: range.start,
      end: range.end,
      bus,
    })),
    range,
  };
}

export default function BusUsagePage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Fleet report</p>
          <h1>Bus-wise stock issues</h1>
          <p className="muted">
            Spare parts consumed by each bus, store, and date.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>
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
              defaultValue={params.get("bus") || ""}
            />
          </label>
        </ReportPeriodFilter>
      </Form>

      {loaderData.truncated ? (
        <p className="muted no-print">
          Showing the latest {loaderData.rows.length} issue lines. Older rows
          are omitted. Please use filters to narrow down results.
        </p>
      ) : null}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bus</th>
                <th>Store</th>
                <th>Document</th>
                <th>Part</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>No issues found</strong>
                      <p>Try adjusting your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {loaderData.rows.map((row, index) => (
                <tr key={`${row.number}-${index}`}>
                  <td>{row.date}</td>
                  <td>
                    <strong>{row.fleetNumber}</strong>
                    <small>{row.registration ?? ""}</small>
                  </td>
                  <td>{row.store}</td>
                  <td>
                    <Link to={`/receipts/${row.id}`} className="mono">
                      {row.number}
                    </Link>
                  </td>
                  <td>
                    <strong>{row.sku}</strong>
                    <small>{row.part}</small>
                  </td>
                  <td className="quantity">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
