import { Form, useSearchParams } from "react-router";
import { getItemUsage } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.item-usage";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return getItemUsage(await requireUser(request), {
    start: url.searchParams.get("start") || undefined,
    end: url.searchParams.get("end") || undefined,
  });
}

export default function ItemUsagePage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Item-wise usage</h1>
          <p className="muted">Posted bus issues by part and store.</p>
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
        <div
          className="form-grid"
          style={{ gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}
        >
          <label>
            Start
            <input
              type="date"
              name="start"
              defaultValue={params.get("start") || ""}
            />
          </label>
          <label>
            End
            <input
              type="date"
              name="end"
              defaultValue={params.get("end") || ""}
            />
          </label>
          <button className="button button-secondary">Filter</button>
        </div>
      </Form>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Part</th>
                <th>Store</th>
                <th>Qty issued</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>No posted issues in this range.</td>
                </tr>
              ) : (
                loaderData.rows.map((row) => (
                  <tr key={`${row.partId}-${row.store}`}>
                    <td className="mono">{row.sku}</td>
                    <td>{row.part}</td>
                    <td>{row.store}</td>
                    <td>
                      {row.issued} {row.unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {loaderData.truncated ? (
          <p className="muted">Showing the first 250 rows.</p>
        ) : null}
      </section>
    </>
  );
}
