import { Form, useSearchParams } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSection,
  ReportSignatures,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { getDagOutSummary } from "~/features/workshop/queries.server";
import {
  listAuthorizedStores,
  listSuppliers,
} from "~/features/master-data/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.dag-out";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "reports.read");
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE);
  const [summary, suppliers, stores] = await Promise.all([
    getDagOutSummary(actor, {
      supplierId: url.searchParams.get("supplier") || undefined,
      storeId: url.searchParams.get("store") || undefined,
      sentFrom: range.start,
      sentTo: range.end,
    }),
    listSuppliers(),
    listAuthorizedStores(actor),
  ]);
  return { summary, suppliers, stores, range };
}

export default function DagOutReport({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const selectedSupplier = loaderData.suppliers.find(
    (s) => s.id === params.get("supplier"),
  );
  const selectedStore = loaderData.stores.find(
    (s) => s.id === params.get("store"),
  );

  const dateLabel = `${loaderData.range.start || "All"} to ${loaderData.range.end || "Present"}`;
  const currentDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Tyres</p>
          <h1>DAG Out Summary</h1>
          <p className="muted">
            Tyres currently sent out to retread suppliers (DAG).
          </p>
        </div>
        <ReportActions
          filename={`dag-out-${selectedSupplier?.name || "all"}-${currentDate}`}
          documentTitle={`DAG Out Summary • ${dateLabel}`}
          targetSelector="#printable-report"
        />
      </div>

      <Form
        className="form-panel panel no-print"
        style={{ marginBottom: "1.5rem" }}
      >
        <ReportPeriodFilter
          period={loaderData.range.period}
          start={params.get("start") || loaderData.range.start}
          end={params.get("end") || loaderData.range.end}
        >
          <label>
            Supplier
            <select name="supplier" defaultValue={params.get("supplier") || ""}>
              <option value="">All suppliers</option>
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
              <option value="">All stores</option>
              {loaderData.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code}
                </option>
              ))}
            </select>
          </label>
        </ReportPeriodFilter>
      </Form>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="DAG Out Summary"
            department="Tyre Retreading & Supplier Custody Register"
            date={loaderData.range.end || currentDate}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})${selectedSupplier ? ` • Supplier: ${selectedSupplier.name}` : ""}`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                ...(selectedSupplier ? [{ label: "Supplier", value: selectedSupplier.name, highlight: true }] : []),
                ...(selectedStore ? [{ label: "Store", value: selectedStore.code }] : []),
                { label: "Date Range", value: dateLabel },
                { label: "Suppliers with Tyres", value: loaderData.summary.groups.length },
                { label: "Total Tyres at DAG", value: loaderData.summary.total, highlight: true },
              ]}
            />
          </div>

          {loaderData.summary.groups.length === 0 ? (
            <ReportEmptyState message="No tyres currently at external retread (DAG) suppliers." />
          ) : (
            loaderData.summary.groups.map((group) => (
              <div key={group.supplierId ?? "none"} style={{ marginBottom: "16px" }}>
                <ReportSection
                  title={`${group.supplier} (${group.count} Tyres in Custody)`}
                  headerRight={
                    <span
                      style={{
                        fontSize: "8pt",
                        fontWeight: "700",
                        padding: "2px 6px",
                        backgroundColor: "#fef3c7",
                        color: "#92400e",
                        borderRadius: "3px",
                      }}
                    >
                      {group.count} Units Sent
                    </span>
                  }
                >
                  <ReportTable
                    headers={[
                      { label: "Serial Number", width: "24%" },
                      { label: "Current Stage", width: "18%" },
                      { label: "SKU / Pattern", width: "24%" },
                      { label: "Origin Store", width: "18%" },
                      { label: "Date Dispatched", width: "16%" },
                    ]}
                  >
                    {group.tyres.map((tyre) => (
                      <tr
                        key={tyre.tyreId}
                        style={{ borderBottom: "1px solid #e5e7eb" }}
                      >
                        <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                          <span className="mono" style={{ fontWeight: "700", color: "#111827" }}>
                            {tyre.serialNumber}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          <span
                            style={{
                              padding: "1px 5px",
                              backgroundColor: "#f3f4f6",
                              borderRadius: "2px",
                              fontWeight: "600",
                            }}
                          >
                            {tyre.stage}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                          <strong style={{ fontSize: "8.5pt", color: "#111827" }}>
                            {tyre.sku}
                          </strong>
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {tyre.store}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {tyre.sentAt
                            ? new Date(tyre.sentAt).toISOString().slice(0, 10)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </ReportTable>
                </ReportSection>
              </div>
            ))
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Contractor Facilities", value: loaderData.summary.groups.length },
                { label: "Total Tyres Sent for Retread", value: loaderData.summary.total, highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Tyre Storekeeper", description: "Dispatched & Logged" },
                { role: "Workshop Supervisor", description: "Batch Approval" },
                { role: "Contractor / Driver Acknowledgement", description: "Physical Custody Accepted" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="DAG Out Summary"
            documentId={`DAG-OUT-${currentDate}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
