import { getBalances } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.balances";
export async function loader({ request }: Route.LoaderArgs) {
  return { balances: await getBalances(await requireUser(request)) };
}
export default function BalancesPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Live inventory</p>
          <h1>Stock balances</h1>
          <p className="muted">
            Current on-hand quantity for every part and accessible location.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>SKU</th>
                <th>Part</th>
                <th>On hand</th>
                <th>Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.balances.map((row) => (
                <tr key={`${row.storeCode}-${row.partId}`}>
                  <td>
                    <strong>{row.storeCode}</strong>
                    <small>{row.store}</small>
                  </td>
                  <td className="mono">{row.sku}</td>
                  <td>{row.part}</td>
                  <td className="quantity">
                    {row.onHand} {row.unit}
                  </td>
                  <td>{row.reorderLevel ?? "Not set"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
