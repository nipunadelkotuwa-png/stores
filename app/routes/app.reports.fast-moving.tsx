import { Form, Link, useSearchParams } from "react-router";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { getFastMovingParts } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.fast-moving";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE, {
    period: "last_30_days",
  });
  const actor = await requireUser(request);
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
        <h2 className="only-print">
          Fast Moving Items Report ({loaderData.range.start} to{" "}
          {loaderData.range.end})
        </h2>
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #000" }}>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>SKU</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>
                  Part Name
                </th>
                <th style={{ textAlign: "right", padding: "0.5rem" }}>
                  Total Issued
                </th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    No items issued in this period.
                  </td>
                </tr>
              ) : (
                loaderData.rows.map((row, index) => (
                  <tr
                    key={`${row.sku}-${index}`}
                    style={{ borderBottom: "1px solid #ccc" }}
                  >
                    <td style={{ padding: "0.5rem" }} className="mono">
                      {row.sku}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{row.part}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>
                      {row.totalIssued}
                    </td>
                    <td className="no-print" style={{ padding: "0.5rem" }}>
                      <Link to={`/issues/new?part=${row.partId}`}>Issue</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .only-print { display: none; }
        @media print {
          .no-print { display: none !important; }
          .only-print { display: block; margin-bottom: 1rem; }
          body { background: white; padding: 0; }
          .panel { box-shadow: none; border: none; padding: 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
        }
      `,
        }}
      />
    </>
  );
}
