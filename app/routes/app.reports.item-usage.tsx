import { Form, useSearchParams } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSignatures,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
import { ReportPeriodFilter } from "~/components/report-period-filter";
import { getEnv } from "~/config/env.server";
import { getItemUsage } from "~/features/inventory/queries.server";
import { resolveReportPeriod } from "~/features/reports/period";
import { db } from "~/db/client.server";
import { parts } from "~/db/schema";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.item-usage";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "reports.read");
  const url = new URL(request.url);
  const { APP_TIME_ZONE } = getEnv();
  const range = resolveReportPeriod(url.searchParams, APP_TIME_ZONE);
  const partId = url.searchParams.get("partId") || undefined;
  const partQuery = url.searchParams.get("q")?.trim() || "";

  const [usage, partOptions, selectedPart] = await Promise.all([
    getItemUsage(actor, {
      start: range.start,
      end: range.end,
      partId,
    }),
    db
      .select({
        id: parts.id,
        sku: parts.sku,
        name: parts.name,
        barcode: parts.barcode,
      })
      .from(parts)
      .where(
        and(
          eq(parts.active, true),
          partQuery
            ? or(
                sql`${parts.sku} ilike ${`%${partQuery}%`}`,
                sql`${parts.name} ilike ${`%${partQuery}%`}`,
                sql`${parts.barcode} ilike ${`%${partQuery}%`}`,
              )
            : undefined,
        ),
      )
      .orderBy(asc(parts.sku))
      .limit(partQuery ? 50 : 200),
    partId
      ? db
          .select({
            id: parts.id,
            sku: parts.sku,
            name: parts.name,
          })
          .from(parts)
          .where(eq(parts.id, partId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  return {
    ...usage,
    range,
    partOptions,
    selectedPart,
    partQuery,
  };
}

export default function ItemUsagePage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const totalIssued = loaderData.rows.reduce(
    (sum, row) => sum + Number(row.issued),
    0,
  );
  const dateLabel = `${loaderData.range.start || "All"} to ${loaderData.range.end || "Present"}`;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Item-Wise Usage</h1>
          <p className="muted">
            Aggregated parts and consumables consumption by store location.
          </p>
        </div>
        <ReportActions
          filename={`item-usage-${loaderData.selectedPart?.sku || loaderData.range.period || "report"}`}
          documentTitle={`Item-Wise Usage Report • ${dateLabel}`}
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
            Item
            <select name="partId" defaultValue={params.get("partId") || ""}>
              <option value="">All items</option>
              {loaderData.selectedPart &&
              !loaderData.partOptions.some(
                (part) => part.id === loaderData.selectedPart?.id,
              ) ? (
                <option value={loaderData.selectedPart.id}>
                  {loaderData.selectedPart.sku} — {loaderData.selectedPart.name}
                </option>
              ) : null}
              {loaderData.partOptions.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.sku} — {part.name}
                  {part.barcode ? ` (${part.barcode})` : ""}
                </option>
              ))}
            </select>
          </label>
        </ReportPeriodFilter>
        <label style={{ marginTop: "0.75rem", display: "block" }}>
          Search SKU / barcode / name (narrows item list)
          <input
            name="q"
            defaultValue={loaderData.partQuery}
            placeholder="Search…"
          />
        </label>
      </Form>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Item-Wise Usage Report"
            department="Workshop Stock Consumption Ledger"
            date={loaderData.range.end || new Date().toISOString().slice(0, 10)}
            subtitle={`Period: ${loaderData.range.period.toUpperCase()} (${dateLabel})${loaderData.selectedPart ? ` • Item: ${loaderData.selectedPart.sku} - ${loaderData.selectedPart.name}` : ""}`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                ...(loaderData.selectedPart
                  ? [
                      {
                        label: "Filtered Item",
                        value: `${loaderData.selectedPart.sku} — ${loaderData.selectedPart.name}`,
                        highlight: true,
                      },
                    ]
                  : []),
                { label: "Date Range", value: dateLabel },
                { label: "Period Filter", value: loaderData.range.period.toUpperCase() },
                { label: "Report Rows", value: loaderData.rows.length },
                { label: "Total Units Dispatched", value: totalIssued.toFixed(2), highlight: true },
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
              Note: Showing first 250 items. Use search or filter above to narrow down results.
            </div>
          ) : null}

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No posted issues recorded for this item in this date range." />
          ) : (
            <ReportTable
              headers={[
                { label: "SKU / Code", width: "20%" },
                { label: "Part Description", width: "40%" },
                { label: "Store Location", width: "22%" },
                { label: "Qty Issued", align: "right", width: "18%" },
              ]}
            >
              {loaderData.rows.map((row) => (
                <tr
                  key={`${row.partId}-${row.store}`}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <span className="mono" style={{ fontWeight: "700", color: "#111827" }}>
                      {row.sku}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <div style={{ fontSize: "9pt", fontWeight: "600", color: "#111827" }}>
                      {row.part}
                    </div>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                    {row.store}
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
                    {row.issued} <span style={{ fontSize: "8pt", color: "#6b7280" }}>{row.unit}</span>
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Total Distinct Stores / Rows", value: loaderData.rows.length },
                { label: "Total Quantity Issued", value: totalIssued.toFixed(2), highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Storekeeper", description: "Usage Verified" },
                { role: "Workshop Manager", description: "Stock Control Review" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Item-Wise Usage Report"
            documentId={`USAGE-${loaderData.selectedPart?.sku || loaderData.range.period || "ALL"}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
