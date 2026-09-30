import { Form, Link, useSearchParams } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSignatures,
  ReportStatusBadge,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { getLocalPurchases } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.purchases";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE);
  const supplier = url.searchParams.get("supplier") || undefined;
  const result = await getLocalPurchases(
    await requirePermission(request, "reports.read"),
    {
      start: range.start,
      end: range.end,
      supplier,
    },
  );
  return { ...result, range };
}

export default function PurchasesReportPage({
  loaderData,
}: Route.ComponentProps) {
  const [params] = useSearchParams();
  const supplierFilter = params.get("supplier");

  const totalAmount = loaderData.rows.reduce(
    (sum, r) => sum + (Number(r.total) || 0),
    0,
  );
  const dateLabel = `${loaderData.range.start || "All"} to ${loaderData.range.end || "Present"}`;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Procurement report</p>
          <h1>Local Purchases</h1>
          <p className="muted">
            Report of direct local purchases and supplier invoices.
          </p>
        </div>
        <ReportActions
          filename={`local-purchases-${supplierFilter ? supplierFilter + "-" : ""}${loaderData.range.period || "report"}`}
          documentTitle={`Local Purchases Report • ${dateLabel}`}
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
            Supplier Name
            <input
              type="text"
              name="supplier"
              placeholder="e.g. NTN Trading"
              defaultValue={supplierFilter || ""}
            />
          </label>
        </ReportPeriodFilter>
      </Form>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Local Purchases Report"
            department="Procurement & Accounts Department"
            date={loaderData.range.end || new Date().toISOString().slice(0, 10)}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})${supplierFilter ? ` • Supplier: ${supplierFilter}` : ""}`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                ...(supplierFilter ? [{ label: "Supplier Filter", value: supplierFilter, highlight: true }] : []),
                { label: "Date Range", value: dateLabel },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Purchase Records", value: loaderData.rows.length },
                {
                  label: "Total Value (LKR)",
                  value: `${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LKR`,
                  highlight: true,
                },
              ]}
            />
          </div>

          {loaderData.truncated ? (
            <div
              style={{
                fontSize: "8.5pt",
                color: "#92400e",
                backgroundColor: "#fef3c7",
                padding: "4px 8px",
                borderRadius: "3px",
                marginBottom: "10px",
              }}
            >
              Note: Showing latest {loaderData.rows.length} purchases. Use filters above to focus on specific dates/suppliers.
            </div>
          ) : null}

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No local purchases recorded for the selected criteria." />
          ) : (
            <ReportTable
              headers={[
                { label: "Date", width: "11%" },
                { label: "Purchase No", width: "19%" },
                { label: "Store", width: "14%" },
                { label: "Supplier", width: "26%" },
                { label: "Status", width: "12%" },
                { label: "Total (LKR)", align: "right", width: "18%" },
              ]}
            >
              {loaderData.rows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.date}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <span className="mono" style={{ fontWeight: "700", color: "#111827" }}>
                      {row.number}
                    </span>
                    {row.receiptDocumentId ? (
                      <div style={{ fontSize: "8pt", marginTop: "1px" }}>
                        <Link
                          to={`/receipts/${row.receiptDocumentId}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          GRN Receipt
                        </Link>
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.store}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <strong style={{ fontSize: "8.5pt", color: "#111827" }}>
                      {row.supplier}
                    </strong>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <ReportStatusBadge status={row.status} />
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "700",
                      fontSize: "9pt",
                      color: "#111827",
                    }}
                  >
                    {Number(row.total || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Total Invoices", value: loaderData.rows.length },
                {
                  label: "Gross Expenditure",
                  value: `${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LKR`,
                  highlight: true,
                },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Procurement Officer", description: "Purchased" },
                { role: "Storekeeper", description: "Goods Verified" },
                { role: "Accounts Executive", description: "Payment Authorized" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Local Purchases Report"
            documentId={`LP-${loaderData.range.period || "PERIOD"}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
