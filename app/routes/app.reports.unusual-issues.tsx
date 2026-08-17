import { getUnusualIssues } from "~/features/inventory/queries.server";
import {
  UNUSUAL_ISSUE_THRESHOLD,
  UNUSUAL_ISSUE_WINDOW_DAYS,
} from "~/features/workshop/constants";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.unusual-issues";

export async function loader({ request }: Route.LoaderArgs) {
  return {
    rows: await getUnusualIssues(await requireUser(request)),
    threshold: UNUSUAL_ISSUE_THRESHOLD,
    windowDays: UNUSUAL_ISSUE_WINDOW_DAYS,
  };
}

export default function UnusualIssuesPage({
  loaderData,
}: Route.ComponentProps) {
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Unusual / repetitive issues</h1>
          <p className="muted">
            Same part issued to the same bus {loaderData.threshold}+ times in
            the last {loaderData.windowDays} days (posted and pending).
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
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Part</th>
                <th>Bus</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>No repetitive issues in the window.</td>
                </tr>
              ) : (
                loaderData.rows.map((row) => (
                  <tr key={`${row.partId}-${row.busId}`}>
                    <td className="mono">{row.sku}</td>
                    <td>{row.part}</td>
                    <td>{row.fleetNumber}</td>
                    <td>{row.issueCount}</td>
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
