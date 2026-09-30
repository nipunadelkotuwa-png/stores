import { Form, useSearchParams } from "react-router";
import { ReportPrintFooter, ReportPrintHeader } from "~/components/report-print-header";
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

  return (
    <>
      <ReportPrintHeader
        title="Item-Wise Usage Report"
        subtitle="Workshop Stock Consumption Ledger"
        metadata={[
          ...(loaderData.selectedPart
            ? [
                {
                  label: "Filtered Item",
                  value: `${loaderData.selectedPart.sku} — ${loaderData.selectedPart.name}`,
                },
              ]
            : []),
          { label: "Period", value: loaderData.range.period },
          {
            label: "Date Range",
            value: `${loaderData.range.start || "—"} to ${loaderData.range.end || "—"}`,
          },
          { label: "Total Usage Rows", value: loaderData.rows.length },
          ...(loaderData.selectedPart
            ? [{ label: "Total Quantity Issued", value: totalIssued.toFixed(2) }]
            : []),
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Item-wise usage</h1>
          <p className="muted">
            Posted bus issues by part and store.
            {loaderData.selectedPart
              ? ` Item: ${loaderData.selectedPart.sku} — ${loaderData.selectedPart.name}.`
              : ""}
            {loaderData.range.start
              ? ` Period: ${loaderData.range.start} → ${loaderData.range.end ?? "…"}`
              : ""}
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
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Part</th>
                <th>Store</th>
                <th>Qty issued</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>No posted issues in this range.</td>
                </tr>
              ) : (
                loaderData.rows.map((row) => (
                  <tr key={`${row.partId}-${row.store}`}>
                    <td className="mono">{row.sku}</td>
                    <td>{row.part}</td>
                    <td>{row.store}</td>
                    <td>
                      {row.issued} {row.unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {loaderData.selectedPart ? (
          <p className="muted">Total issued: {totalIssued.toFixed(3)}</p>
        ) : null}
        {loaderData.truncated ? (
          <p className="muted">Showing the first 250 rows.</p>
        ) : null}
      </section>

      <ReportPrintFooter reportName="Item-Wise Usage Report" />
    </>
  );
}
