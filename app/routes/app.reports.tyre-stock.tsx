import { Form, Link, useSearchParams } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSection,
  ReportSignatures,
  ReportStatusBadge,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
import { BUSINESS_DAG_STAGES } from "~/features/workshop/constants";
import { getTyreStockReport } from "~/features/workshop/queries.server";
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
  const selectedStage = params.get("stage");
  const selectedStatus = params.get("status");

  const currentDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Total Tyre Stock</h1>
          <p className="muted">
            Active serial assets by location, bus assignment, and lifecycle stage.
          </p>
        </div>
        <ReportActions
          filename={`tyre-stock-${selectedStore?.code || "all"}-${currentDate}`}
          documentTitle={`Tyre Stock Register • ${currentDate}`}
          targetSelector="#printable-report"
        />
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

      {/* Official A4 Printable Report Sheet (Landscape for wide serial tables) */}
      <div id="printable-report" className="print-doc-container report-sheet print-landscape">
        <ReportLayout mode="report" orientation="landscape">
          <ReportHeader
            title="Total Tyre Stock Register"
            department="Workshop Tyre Asset Management System"
            storeName={selectedStore ? `${selectedStore.code} — ${selectedStore.name}` : undefined}
            date={currentDate}
            subtitle={`Inventory Count & Lifecycle Stage Verification`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                ...(selectedStore ? [{ label: "Store", value: selectedStore.code }] : []),
                ...(selectedStage ? [{ label: "Stage Filter", value: selectedStage }] : []),
                ...(selectedStatus ? [{ label: "Status Filter", value: selectedStatus }] : []),
                { label: "Active Tyres Total", value: report.kpis.active, highlight: true },
                { label: "Warehouse Stock", value: report.kpis.warehouse },
                { label: "Fitted on Fleet", value: report.kpis.onBuses },
                { label: "At Retreader (DAG)", value: report.kpis.atDag },
              ]}
            />
          </div>

          {/* Stage Summary Matrix */}
          <div style={{ marginBottom: "18px" }}>
            <ReportSection title="Tyre Lifecycle Stage Matrix">
              <ReportTable
                headers={[
                  { label: "Lifecycle Stage", width: "28%" },
                  { label: "Warehouse", align: "right", width: "18%" },
                  { label: "On Fleet", align: "right", width: "18%" },
                  { label: "At DAG", align: "right", width: "18%" },
                  { label: "Total Active", align: "right", width: "18%" },
                ]}
              >
                {BUSINESS_DAG_STAGES.map((stage) => (
                  <tr key={stage} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "5px 8px", fontWeight: "600", fontSize: "9pt" }}>
                      {stage}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                      {report.matrix[stage].warehouse}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                      {report.matrix[stage].onBus}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                      {report.matrix[stage].atDag}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--font-mono, monospace)", fontWeight: "700" }}>
                      {report.matrix[stage].total}
                    </td>
                  </tr>
                ))}
              </ReportTable>
            </ReportSection>
          </div>

          {/* Serial Assets Register */}
          <div style={{ marginBottom: "16px" }}>
            <ReportSection
              title={`Serial Asset Register (${report.detail.length} Tyres)`}
              headerRight={
                <span style={{ fontSize: "8pt", color: "#6b7280" }}>
                  Disposed Tyres Excluded: {report.kpis.disposed}
                </span>
              }
            >
              {report.detail.length === 0 ? (
                <ReportEmptyState message="No tyre serials match the selected filter criteria." />
              ) : (
                <ReportTable
                  headers={[
                    { label: "Serial No", width: "16%" },
                    { label: "SKU / Brand", width: "16%" },
                    { label: "Stage", width: "10%" },
                    { label: "Status", width: "12%" },
                    { label: "Store", width: "12%" },
                    { label: "Bus / Position", width: "18%" },
                    { label: "Last Movement", width: "16%" },
                  ]}
                >
                  {report.detail.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                        <Link
                          to={`/tyres/${row.id}`}
                          className="mono"
                          style={{ fontWeight: "700", color: "#111827", textDecoration: "none" }}
                        >
                          {row.serialNumber}
                        </Link>
                      </td>
                      <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                        <strong style={{ fontSize: "8.5pt", color: "#111827" }}>{row.sku}</strong>
                      </td>
                      <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                        {row.stage}
                      </td>
                      <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                        <ReportStatusBadge status={row.status} />
                      </td>
                      <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                        {row.store ?? "—"}
                      </td>
                      <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                        {row.fleetNumber ? (
                          <>
                            <strong style={{ fontSize: "8.5pt", color: "#111827" }}>
                              {row.fleetNumber}
                            </strong>
                            {row.position ? ` (${row.position})` : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8pt", color: "#4b5563" }}>
                        {row.lastMovement}
                      </td>
                    </tr>
                  ))}
                </ReportTable>
              )}
            </ReportSection>
          </div>

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Active Operational Fleet Tyres", value: report.kpis.active, highlight: true },
                { label: "Warehouse Spares", value: report.kpis.warehouse },
                { label: "Fitted on Buses", value: report.kpis.onBuses },
                { label: "At Retreading Contractors", value: report.kpis.atDag },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Tyre Storekeeper", description: "Physical Count" },
                { role: "Workshop Superintendent", description: "Fleet Verification" },
                { role: "Internal Stock Auditor", description: "Asset Verification" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Total Tyre Stock Register"
            documentId={`TYRE-REG-${currentDate}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
