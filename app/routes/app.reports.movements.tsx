import { getMovements } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.movements";

export async function loader({ request }: Route.LoaderArgs) {
  return getMovements(await requireUser(request));
}

export default function MovementsPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Audit report</p>
          <h1>Stock movement ledger</h1>
          <p className="muted">
            Immutable movements with the resulting balance after every posting.
          </p>
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
      {loaderData.truncated ? (
        <p className="muted">
          Showing the latest {loaderData.rows.length} movements. Older rows are
          omitted.
        </p>
      ) : null}
      <section className="panel print-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Document</th>
                <th>Store</th>
                <th>Part</th>
                <th>Movement</th>
                <th>Balance after</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.map((row, index) => (
                <tr key={`${row.number}-${row.sku}-${index}`}>
                  <td>{row.date}</td>
                  <td>
                    <span className="mono">{row.number}</span>
                    <small>{row.type.replaceAll("_", " ")}</small>
                  </td>
                  <td>{row.store}</td>
                  <td>
                    <strong>{row.sku}</strong>
                    <small>{row.part}</small>
                  </td>
                  <td
                    className={
                      Number(row.delta) < 0
                        ? "quantity danger"
                        : "quantity positive"
                    }
                  >
                    {Number(row.delta) > 0 ? "+" : ""}
                    {row.delta}
                  </td>
                  <td className="quantity">{row.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
