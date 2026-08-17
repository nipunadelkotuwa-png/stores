import { Link } from "react-router";
import { getLocalPurchases } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.purchases._index";

export async function loader({ request }: Route.LoaderArgs) {
  const result = await getLocalPurchases(await requireUser(request));
  return result;
}

export default function PurchasesIndexPage({
  loaderData,
}: Route.ComponentProps) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Local procurement</p>
          <h1>Purchases</h1>
          <p className="muted">
            Posted local purchases linked to stock receipts.
          </p>
        </div>
        <Link className="button button-primary" to="/purchases/new">
          New purchase
        </Link>
      </div>
      {loaderData.truncated ? (
        <p className="muted">
          Showing the latest {loaderData.rows.length} purchases. Older rows are
          omitted.
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
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No purchases yet.</td>
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
                    <td>
                      {row.receiptDocumentId ? (
                        <Link to={`/receipts/${row.receiptDocumentId}`}>
                          View receipt
                        </Link>
                      ) : (
                        "—"
                      )}
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
