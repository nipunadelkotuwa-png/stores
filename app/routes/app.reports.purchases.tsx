import { Form, Link, useSearchParams } from "react-router";
import { ReportPrintFooter, ReportPrintHeader } from "~/components/report-print-header";
import { ReportActions } from "~/components/report-actions";
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
  const totalAmount = loaderData.rows.reduce(
    (sum, r) => sum + (Number(r.total) || 0),
    0,
  );

  return (
    <>
      <ReportPrintHeader
        title="Local Purchases Report"
        subtitle="Central Workshop & Fleet Inventory Management"
        metadata={[
          ...(params.get("supplier")
            ? [{ label: "Supplier", value: params.get("supplier") }]
            : []),
          { label: "Period", value: loaderData.range.period },
          {
            label: "Date Range",
            value: `${loaderData.range.start || "—"} to ${loaderData.range.end || "—"}`,
          },
          { label: "Total Purchases", value: loaderData.rows.length },
          {
            label: "Total Value",
            value: `${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LKR`,
          },
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Procurement report</p>
          <h1>Local purchases</h1>
          <p className="muted">
            Report of all local purchases, filterable by date and supplier.
          </p>
        </div>
        <ReportActions
          filename={`local-purchases-${loaderData.range.period || "report"}`}
          documentTitle="Local Purchases Report"
          targetSelector=".panel:has(table)"
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
              defaultValue={params.get("supplier") || ""}
            />
          </label>
        </ReportPeriodFilter>
      </Form>

      {loaderData.truncated ? (
        <p className="muted no-print">
          Showing the latest {loaderData.rows.length} purchases. Older rows are
          omitted. Please use filters to narrow down results.
        </p>
      ) : null}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Purchase</th>
                <th>Store</th>
                <th>Supplier</th>
                <th>Total (LKR)</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <strong>No purchases found</strong>
                      <p>Try adjusting your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                loaderData.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td className="mono">{row.number}</td>
                    <td>{row.store}</td>
                    <td>{row.supplier}</td>
                    <td className="quantity">{row.total}</td>
                    <td>
                      <span className="badge success">{row.status}</span>
                    </td>
                    <td>
                      {row.receiptDocumentId ? (
                        <Link to={`/receipts/${row.receiptDocumentId}`}>
                          View receipt
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ReportPrintFooter reportName="Local Purchases Report" />
    </>
  );
}
