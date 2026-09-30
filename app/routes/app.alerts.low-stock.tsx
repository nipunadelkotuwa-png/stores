import { Link } from "react-router";
import {
  ReportPrintFooter,
  ReportPrintHeader,
} from "~/components/report-print-header";
import { getLowStock } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.alerts.low-stock";

export async function loader({ request }: Route.LoaderArgs) {
  return {
    alerts: await getLowStock(
      await requirePermission(request, "balances.read"),
    ),
  };
}

export default function LowStockPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <ReportPrintHeader
        title="Low-Stock Alert Report"
        subtitle="Critical Reorder & Procurement Alerts"
        metadata={[
          { label: "Alert Count", value: `${loaderData.alerts.length} item(s) below reorder level` },
          { label: "Priority", value: "Immediate Reorder Required" },
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Attention required</p>
          <h1>Low-stock alerts</h1>
          <p className="muted">
            Parts at or below the location-specific reorder threshold.
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
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>SKU</th>
                <th>Part</th>
                <th>On hand</th>
                <th>Reorder at</th>
                <th>Alert</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {loaderData.alerts.map((row) => (
                <tr key={`${row.store}-${row.sku}`}>
                  <td>{row.store}</td>
                  <td className="mono">{row.sku}</td>
                  <td>{row.part}</td>
                  <td className="quantity danger">{row.onHand}</td>
                  <td>{row.reorderLevel}</td>
                  <td>
                    <span className="badge danger">Reorder</span>
                  </td>
                  <td className="no-print">
                    <Link
                      to={`/stock-in/new?part=${row.partId}&store=${row.storeId}`}
                    >
                      Stock in
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loaderData.alerts.length ? (
          <div className="empty-state">
            <strong>No low-stock alerts</strong>
            <p>All configured parts are above their reorder levels.</p>
          </div>
        ) : null}
      </section>

      <ReportPrintFooter reportName="Low-Stock Alert Report" />
    </>
  );
}
