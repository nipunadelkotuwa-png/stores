import { Form, Link, useSearchParams } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { movementFiltersFromSearch } from "~/features/inventory/movement-filters";
import { getMovements } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.movements";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const range = resolveReportPeriod(url.searchParams, getEnv().APP_TIME_ZONE);
  const focusFilters = movementFiltersFromSearch(url.searchParams);
  const focused = Boolean(
    focusFilters.documentNumber || focusFilters.purchaseNumber,
  );
  return {
    ...(await getMovements(await requirePermission(request, "reports.read"), {
      ...focusFilters,
      start: focused ? undefined : range.start,
      end: focused ? undefined : range.end,
    })),
    range,
  };
}

export default function MovementsPage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();

  const totalIn = loaderData.rows
    .filter((r) => Number(r.delta) > 0)
    .reduce((acc, r) => acc + Number(r.delta), 0);
  const totalOut = loaderData.rows
    .filter((r) => Number(r.delta) < 0)
    .reduce((acc, r) => acc + Math.abs(Number(r.delta)), 0);

  const dateLabel = `${loaderData.range.start || "All"} to ${loaderData.range.end || "Present"}`;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Audit report</p>
          <h1>Stock Movement Ledger</h1>
          <p className="muted">
            Immutable inventory ledger with running balances after every transaction.
          </p>
        </div>
        <ReportActions
          filename={`stock-movements-${loaderData.range.period || "ledger"}`}
          documentTitle="Stock Movement Ledger"
          targetSelector="#printable-report"
        />
      </div>

      {!loaderData.focus ? (
        <Form
          className="form-panel panel no-print"
          style={{ marginBottom: "1.5rem" }}
        >
          <ReportPeriodFilter
            period={loaderData.range.period}
            start={params.get("start") || loaderData.range.start}
            end={params.get("end") || loaderData.range.end}
          />
        </Form>
      ) : null}

      {loaderData.focus ? (
        <p className="muted no-print" style={{ marginBottom: "1rem" }}>
          Showing movements for <span className="mono">{loaderData.focus}</span>
          . <Link to="/reports/movements">Show all movements</Link>
        </p>
      ) : null}

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Stock Movement Ledger"
            department="Workshop & Fleet Inventory Audit"
            date={loaderData.range.end || new Date().toISOString().slice(0, 10)}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})${loaderData.focus ? ` • Focus: ${loaderData.focus}` : ""}`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                ...(loaderData.focus ? [{ label: "Focus Filter", value: loaderData.focus, highlight: true }] : []),
                { label: "Date Range", value: dateLabel },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Total Entries", value: loaderData.rows.length },
                { label: "Net Volume", value: `+${totalIn.toFixed(2)} / -${totalOut.toFixed(2)}` },
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
              Note: Showing latest {loaderData.rows.length} transactions for printable view.
            </div>
          ) : null}

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState
              message={
                loaderData.focus
                  ? `No movements found for ${loaderData.focus}.`
                  : "No stock movements recorded for this period."
              }
            />
          ) : (
            <ReportTable
              headers={[
                { label: "Date", width: "12%" },
                { label: "Document", width: "22%" },
                { label: "Store", width: "14%" },
                { label: "Part Details", width: "28%" },
                { label: "Movement", align: "right", width: "12%" },
                { label: "Balance", align: "right", width: "12%" },
              ]}
            >
              {loaderData.rows.map((row, index) => (
                <tr
                  key={`${row.number}-${row.sku}-${index}`}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor:
                      loaderData.focus === row.number
                        ? "#fef9c3"
                        : index % 2 === 1
                          ? "#fafbfc"
                          : "#ffffff",
                  }}
                >
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.date}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <Link
                      to={`/receipts/${row.id}`}
                      className="mono"
                      style={{ fontWeight: "700", color: "#111827", textDecoration: "none" }}
                    >
                      {row.number}
                    </Link>
                    <div style={{ fontSize: "8pt", color: "#6b7280", marginTop: "1px" }}>
                      {row.type.replaceAll("_", " ")}
                    </div>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.store}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <strong style={{ fontSize: "9pt", color: "#111827" }}>{row.sku}</strong>
                    <div style={{ fontSize: "8pt", color: "#4b5563", marginTop: "1px" }}>
                      {row.part}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "700",
                      fontSize: "9pt",
                      color: Number(row.delta) < 0 ? "#b91c1c" : "#15803d",
                    }}
                  >
                    {Number(row.delta) > 0 ? "+" : ""}
                    {row.delta}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "600",
                      fontSize: "9pt",
                      color: "#111827",
                    }}
                  >
                    {row.balance}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Ledger Entries", value: loaderData.rows.length },
                { label: "Total Inflow Qty", value: `+${totalIn.toFixed(2)}` },
                { label: "Total Outflow Qty", value: `-${totalOut.toFixed(2)}` },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Stock Movement Ledger"
            documentId={`LEDGER-${loaderData.range.period || "ALL"}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
