import { Form, Link, useSearchParams } from "react-router";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { getTransfers } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.transfers";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE);
  return {
    ...(await getTransfers(await requireUser(request), {
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
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Location transfers</h1>
          <p className="muted">
            Posted transfer-out and transfer-in documents.
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => window.print()}
        >
          Print
        </button>
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
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Date</th>
                <th>Store</th>
                <th>Destination</th>
                <th>Part</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No transfers in this range.</td>
                </tr>
              ) : (
                loaderData.rows.map((row, index) => (
                  <tr key={`${row.id}-${index}`}>
                    <td className="mono">
                      <Link to={`/receipts/${row.id}`}>{row.number}</Link>
                    </td>
                    <td>{row.type.replaceAll("_", " ")}</td>
                    <td>{row.date}</td>
                    <td>{row.source}</td>
                    <td>{row.destination ?? "—"}</td>
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
