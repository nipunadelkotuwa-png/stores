import { Link } from "react-router";
import { movementFiltersFromSearch } from "~/features/inventory/movement-filters";
import { getMovements } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.movements";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return getMovements(
    await requireUser(request),
    movementFiltersFromSearch(url.searchParams),
  );
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
      {loaderData.focus ? (
        <p className="muted no-print">
          Showing movements for <span className="mono">{loaderData.focus}</span>
          . <Link to="/reports/movements">Show all movements</Link>
        </p>
      ) : null}
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
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>
                        {loaderData.focus
                          ? `No movements for ${loaderData.focus}`
                          : "No movements yet"}
                      </strong>
                      <p>
                        {loaderData.focus ? (
                          <Link to="/reports/movements">
                            Show all movements
                          </Link>
                        ) : (
                          "Post a receipt or issue to build the ledger."
                        )}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {loaderData.rows.map((row, index) => (
                <tr
                  key={`${row.number}-${row.sku}-${index}`}
                  className={
                    loaderData.focus === row.number ? "row-focus" : undefined
                  }
                >
                  <td>{row.date}</td>
                  <td>
                    <Link to={`/receipts/${row.id}`} className="mono">
                      {row.number}
                    </Link>
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
