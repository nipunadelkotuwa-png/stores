import { useState } from "react";
import { getBalances } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.balances";
export async function loader({ request }: Route.LoaderArgs) {
  return { balances: await getBalances(await requireUser(request)) };
}
export default function BalancesPage({ loaderData }: Route.ComponentProps) {
  const [searchQuery, setSearchQuery] = useState("");
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
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "1rem",
          }}
        >
          <input
            type="search"
            placeholder="Search parts or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "0.5rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          />
        </div>
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
              {loaderData.balances
                .filter((row) => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    row.sku.toLowerCase().includes(q) ||
                    row.part.toLowerCase().includes(q)
                  );
                })
                .map((row) => (
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
