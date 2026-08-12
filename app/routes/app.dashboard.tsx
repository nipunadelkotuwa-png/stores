import { Link } from "react-router";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getDashboard } from "~/features/dashboard/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  return getDashboard(await requireUser(request));
}

function processTrendData(
  data: Array<{ date: string; type: string; count: number }>,
) {
  const byDate = new Map<
    string,
    { date: string; receipts: number; issues: number }
  >();
  for (const row of data) {
    const entry = byDate.get(row.date) || {
      date: row.date,
      receipts: 0,
      issues: 0,
    };
    if (row.type === "STOCK_RECEIPT") entry.receipts += Number(row.count);
    else if (row.type === "BUS_ISSUE") entry.issues += Number(row.count);
    byDate.set(row.date, entry);
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

type TooltipPayload = { name?: string; value?: number; color?: string };

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="tooltip-panel">
        <p className="eyebrow">{label}</p>
        {payload.map((entry) => (
          <div key={entry.name} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const cards = [
    ["Stores", loaderData.storeCount],
    ["Active parts", loaderData.partCount],
    ["Buses", loaderData.busCount],
    ["Posted transactions", loaderData.transactionCount],
  ];

  const chartData = processTrendData(loaderData.trendData);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Inventory dashboard</h1>
          <p className="muted">
            Current operational picture across the stores you can access.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/parts#add-part-form">
            Add new item
          </Link>
          <Link className="button button-secondary" to="/issues/new">
            Issue to bus
          </Link>
          <Link className="button button-primary" to="/stock-in/new">
            Record stock in
          </Link>
        </div>
      </div>

      <section className="metric-grid">
        {cards.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
        <article className="metric-card warning">
          <span>Low-stock alerts</span>
          <strong>{loaderData.lowStock.length}</strong>
          <Link to="#low-stock">Review below ↓</Link>
        </article>
      </section>

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Activity</p>
            <h2>30-Day Transaction Trend</h2>
          </div>
        </div>
        <div style={{ height: "300px", padding: "1.5rem 1.5rem 1rem 0" }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "#69766e" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#69766e" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  name="Stock Receipts"
                  dataKey="receipts"
                  stackId="1"
                  stroke="#174d32"
                  fill="#d9f3e4"
                />
                <Area
                  type="monotone"
                  name="Bus Issues"
                  dataKey="issues"
                  stackId="2"
                  stroke="#b86712"
                  fill="#fff0d9"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <strong>No trend data available</strong>
              <p>Post transactions to see activity.</p>
            </div>
          )}
        </div>
      </section>

      <div className="two-column">
        <section className="panel" id="low-stock">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Attention required</p>
              <h2>Low-stock items</h2>
            </div>
            <Link to="/alerts/low-stock">Full report</Link>
          </div>
          {loaderData.lowStock.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Part</th>
                    <th>On hand</th>
                  </tr>
                </thead>
                <tbody>
                  {loaderData.lowStock.slice(0, 5).map((row) => (
                    <tr key={`${row.store}-${row.sku}`}>
                      <td>{row.store}</td>
                      <td>
                        <strong>{row.sku}</strong>
                        <small>{row.part}</small>
                      </td>
                      <td className="quantity danger">
                        {row.onHand}{" "}
                        <span
                          style={{
                            color: "var(--muted)",
                            fontSize: "0.7rem",
                            fontWeight: "normal",
                          }}
                        >
                          ≤ {row.reorderLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loaderData.lowStock.length > 5 && (
                <div
                  style={{
                    padding: "0.7rem",
                    textAlign: "center",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <Link
                    to="/alerts/low-stock"
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--forest)",
                    }}
                  >
                    +{loaderData.lowStock.length - 5} more items
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <strong>All clear</strong>
              <p>No parts are below reorder level.</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Fleet usage</p>
              <h2>Top consumed parts</h2>
            </div>
          </div>
          {loaderData.topConsumed.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Quantity issued</th>
                  </tr>
                </thead>
                <tbody>
                  {loaderData.topConsumed.map((row) => (
                    <tr key={row.sku}>
                      <td>
                        <strong>{row.sku}</strong>
                        <small>{row.part}</small>
                      </td>
                      <td className="quantity">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No consumption data</strong>
              <p>Issue parts to buses to build data.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
