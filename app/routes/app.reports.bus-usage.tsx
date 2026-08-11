import { getBusUsage } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.bus-usage";

export async function loader({ request }: Route.LoaderArgs) {
  return getBusUsage(await requireUser(request));
}

export default function BusUsagePage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet report</p>
          <h1>Bus-wise stock issues</h1>
          <p className="muted">
            Spare parts consumed by each bus, store, and date.
          </p>
        </div>
      </div>
      {loaderData.truncated ? (
        <p className="muted">
          Showing the latest {loaderData.rows.length} issue lines. Older rows
          are omitted.
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
              {loaderData.rows.map((row, index) => (
                <tr key={`${row.number}-${index}`}>
                  <td>{row.date}</td>
                  <td>
                    <strong>{row.fleetNumber}</strong>
                    <small>{row.registration ?? ""}</small>
                  </td>
                  <td>{row.store}</td>
                  <td className="mono">{row.number}</td>
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
