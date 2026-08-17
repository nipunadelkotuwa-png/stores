import { Form, Link, useSearchParams } from "react-router";
import { getDagOutSummary } from "~/features/workshop/queries.server";
import {
  listStores,
  listSuppliers,
} from "~/features/master-data/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.dag-out";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const [summary, suppliers, stores] = await Promise.all([
    getDagOutSummary(actor, {
      supplierId: url.searchParams.get("supplier") || undefined,
      storeId: url.searchParams.get("store") || undefined,
      sentFrom: url.searchParams.get("start") || undefined,
      sentTo: url.searchParams.get("end") || undefined,
    }),
    listSuppliers(),
    listStores(),
  ]);
  return { summary, suppliers, stores };
}

export default function DagOutReport({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Tyres</p>
          <h1>DAG out summary</h1>
          <p className="muted">
            Tyres currently at each retread supplier, with serial counts.
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
        <div
          className="form-grid"
          style={{
            gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
            alignItems: "end",
          }}
        >
          <label>
            Supplier
            <select name="supplier" defaultValue={params.get("supplier") || ""}>
              <option value="">All</option>
              {loaderData.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Store
            <select name="store" defaultValue={params.get("store") || ""}>
              <option value="">All</option>
              {loaderData.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sent from
            <input
              type="date"
              name="start"
              defaultValue={params.get("start") || ""}
            />
          </label>
          <label>
            Sent to
            <input
              type="date"
              name="end"
              defaultValue={params.get("end") || ""}
            />
          </label>
          <button className="button button-secondary">Filter</button>
        </div>
      </Form>
      <p className="muted">Total at DAG: {loaderData.summary.total}</p>
      {loaderData.summary.groups.map((group) => (
        <section
          className="panel"
          key={group.supplierId ?? "none"}
          style={{ marginBottom: "1rem" }}
        >
          <h2>
            {group.supplier} <span className="badge">{group.count} tyres</span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Stage</th>
                  <th>SKU</th>
                  <th>Store</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {group.tyres.map((tyre) => (
                  <tr key={tyre.tyreId}>
                    <td className="mono">{tyre.serialNumber}</td>
                    <td>{tyre.stage}</td>
                    <td className="mono">{tyre.sku}</td>
                    <td>{tyre.store}</td>
                    <td>
                      {tyre.sentAt
                        ? new Date(tyre.sentAt).toISOString().slice(0, 10)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {loaderData.summary.groups.length === 0 ? (
        <div className="empty-state">
          <strong>No tyres at DAG</strong>
          <p>
            Send serials from <Link to="/tyres/dag">DAG send / return</Link>.
          </p>
        </div>
      ) : null}
    </>
  );
}
