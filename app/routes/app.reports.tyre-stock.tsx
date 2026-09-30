import { Form, Link, useSearchParams } from "react-router";
import { ReportPrintFooter, ReportPrintHeader } from "~/components/report-print-header";
import { BUSINESS_DAG_STAGES } from "~/features/workshop/constants";
import { getTyreStockReport } from "~/features/workshop/queries.server";
import { statusLabel } from "~/features/workshop/tyre-lifecycle";
import {
  listAuthorizedStores,
  listSuppliers,
} from "~/features/master-data/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.tyre-stock";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "reports.read");
  const url = new URL(request.url);
  const [report, suppliers, stores] = await Promise.all([
    getTyreStockReport(actor, {
      storeId: url.searchParams.get("store") || undefined,
      stage: url.searchParams.get("stage") || undefined,
      status: url.searchParams.get("status") || undefined,
      sku: url.searchParams.get("sku") || undefined,
      supplierId: url.searchParams.get("supplier") || undefined,
    }),
    listSuppliers(),
    listAuthorizedStores(actor),
  ]);
  return { report, suppliers, stores };
}

export default function TyreStockReportPage({
  loaderData,
}: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { report } = loaderData;
  const selectedStore = loaderData.stores.find(
    (s) => s.id === params.get("store"),
  );

  return (
    <>
      <ReportPrintHeader
        title="Total Tyre Stock Register"
        subtitle="Workshop Tyre Asset Management System"
        metadata={[
          ...(selectedStore
            ? [{ label: "Store", value: selectedStore.code }]
            : []),
          ...(params.get("stage")
            ? [{ label: "Stage", value: params.get("stage") }]
            : []),
          ...(params.get("status")
            ? [{ label: "Status", value: params.get("status") }]
            : []),
          { label: "Active Tyres", value: report.kpis.active },
          { label: "In Warehouse", value: report.kpis.warehouse },
          { label: "On Buses", value: report.kpis.onBuses },
          { label: "At DAG", value: report.kpis.atDag },
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Total tyre stock</h1>
          <p className="muted">
            Active serial assets by location and lifecycle stage. Disposed is
            shown separately.
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>

      <Form
        className="form-panel panel no-print"
        style={{ marginBottom: "1.5rem" }}
      >
        <div
          className="form-grid"
          style={{
            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto",
            alignItems: "end",
          }}
        >
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
            Stage
            <select name="stage" defaultValue={params.get("stage") || ""}>
              <option value="">All</option>
              {BUSINESS_DAG_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={params.get("status") || ""}>
              <option value="">All</option>
              <option value="IN_STORE">Warehouse</option>
              <option value="FITTED">On bus</option>
              <option value="AT_DAG">At DAG</option>
              <option value="DISPOSED">Disposed</option>
            </select>
          </label>
          <label>
            SKU
            <input name="sku" defaultValue={params.get("sku") || ""} />
          </label>
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
          <button className="button button-secondary" type="submit">
            Filter
          </button>
        </div>
      </Form>

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <div
          className="form-grid"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          <div>
            <p className="muted">Active tyres</p>
            <strong style={{ fontSize: "1.5rem" }}>{report.kpis.active}</strong>
          </div>
          <div>
            <p className="muted">Warehouse</p>
            <strong style={{ fontSize: "1.5rem" }}>
              {report.kpis.warehouse}
            </strong>
          </div>
          <div>
            <p className="muted">On buses</p>
            <strong style={{ fontSize: "1.5rem" }}>
              {report.kpis.onBuses}
            </strong>
          </div>
          <div>
            <p className="muted">At DAG</p>
            <strong style={{ fontSize: "1.5rem" }}>{report.kpis.atDag}</strong>
          </div>
        </div>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Disposed (not in active total): {report.kpis.disposed}
        </p>
      </section>

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2>Stage summary</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Warehouse</th>
                <th>On bus</th>
                <th>At DAG</th>
                <th>Total active</th>
              </tr>
            </thead>
            <tbody>
              {BUSINESS_DAG_STAGES.map((stage) => (
                <tr key={stage}>
                  <td>{stage}</td>
                  <td className="quantity">{report.matrix[stage].warehouse}</td>
                  <td className="quantity">{report.matrix[stage].onBus}</td>
                  <td className="quantity">{report.matrix[stage].atDag}</td>
                  <td className="quantity">{report.matrix[stage].total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Detail</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serial</th>
                <th>SKU</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Store</th>
                <th>Bus</th>
                <th>Position</th>
                <th>Last movement</th>
              </tr>
            </thead>
            <tbody>
              {report.detail.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <strong>No tyres match</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                report.detail.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">
                      <Link to={`/tyres/${row.id}`}>{row.serialNumber}</Link>
                    </td>
                    <td className="mono">{row.sku}</td>
                    <td>{row.stage}</td>
                    <td>{statusLabel(row.status)}</td>
                    <td>{row.store ?? "—"}</td>
                    <td>{row.fleetNumber ?? "—"}</td>
                    <td>{row.position ?? "—"}</td>
                    <td>{row.lastMovement}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ReportPrintFooter reportName="Total Tyre Stock Register" />
    </>
  );
}
