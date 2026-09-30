import { Form, Link, useSearchParams } from "react-router";
import { ReportPrintFooter, ReportPrintHeader } from "~/components/report-print-header";
import { ReportActions } from "~/components/report-actions";
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
  return (
    <>
      <ReportPrintHeader
        title="Stock Movement Ledger"
        subtitle="Central Workshop & Fleet Inventory Management"
        metadata={[
          ...(loaderData.focus ? [{ label: "Focus", value: loaderData.focus }] : []),
          { label: "Period", value: loaderData.range.period },
          {
            label: "Date Range",
            value: `${loaderData.range.start || "—"} to ${loaderData.range.end || "—"}`,
          },
          { label: "Total Rows", value: loaderData.rows.length },
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Audit report</p>
          <h1>Stock movement ledger</h1>
          <p className="muted">
            Immutable movements with the resulting balance after every posting.
          </p>
        </div>
        <ReportActions
          filename={`stock-movements-${loaderData.range.period || "ledger"}`}
          documentTitle="Stock Movement Ledger"
          targetSelector=".print-panel"
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

      <ReportPrintFooter reportName="Stock Movement Ledger" />
    </>
  );
}
