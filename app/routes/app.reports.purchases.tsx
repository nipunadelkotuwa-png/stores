import { Form, useSearchParams } from "react-router";
import { getLocalPurchases } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.purchases";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start") || undefined;
  const end = url.searchParams.get("end") || undefined;
  const supplier = url.searchParams.get("supplier") || undefined;
  const result = await getLocalPurchases(await requireUser(request), {
    start,
    end,
    supplier,
  });
  return result;
}

export default function PurchasesReportPage({
  loaderData,
}: Route.ComponentProps) {
  const [params] = useSearchParams();

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Procurement report</p>
          <h1>Local purchases</h1>
          <p className="muted">
            Report of all local purchases, filterable by date and supplier.
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
        <div
          className="form-grid"
          style={{ gridTemplateColumns: "1fr 1fr 1fr auto", alignItems: "end" }}
        >
          <div>
            <label>Start Date</label>
            <input
              type="date"
              name="start"
              defaultValue={params.get("start") || ""}
            />
          </div>
          <div>
            <label>End Date</label>
            <input
              type="date"
              name="end"
              defaultValue={params.get("end") || ""}
            />
          </div>
          <div>
            <label>Supplier Name</label>
            <input
              type="text"
              name="supplier"
              placeholder="e.g. NTN Trading"
              defaultValue={params.get("supplier") || ""}
            />
          </div>
          <div>
            <button type="submit" className="button button-primary">
              Filter
            </button>
          </div>
        </div>
      </Form>

      {loaderData.truncated ? (
        <p className="muted no-print">
          Showing the latest {loaderData.rows.length} purchases. Older rows are
          omitted. Please use filters to narrow down results.
        </p>
      ) : null}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Purchase</th>
                <th>Store</th>
                <th>Supplier</th>
                <th>Total (LKR)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>No purchases found</strong>
                      <p>Try adjusting your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                loaderData.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td className="mono">{row.number}</td>
                    <td>{row.store}</td>
                    <td>{row.supplier}</td>
                    <td className="quantity">{row.total}</td>
                    <td>
                      <span className="badge success">{row.status}</span>
                    </td>
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
