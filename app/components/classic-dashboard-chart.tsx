import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = {
  date: string;
  receipts: number;
  issues: number;
};

type TooltipPayload = { name?: string; value?: number; color?: string };

function formatShortDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tooltip">
      <p className="dash-tooltip-label">{formatShortDate(String(label))}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export function ClassicDashboardChart({
  chartData,
  periodDays,
}: {
  chartData: ChartPoint[];
  periodDays: number;
}) {
  return (
    <article className="bento-cell dash-panel dash-chart-panel bento-span-8 bento-row-2">
      <div className="dash-panel-head">
        <h2>{periodDays}-Day Movement Trend</h2>
        <span className="dash-panel-note">Receipts vs outbound issues</span>
      </div>
      <div className="dash-chart-wrap">
        {chartData.length > 0 ? (
          <>
            <div className="dash-chart-legend">
              <span>
                <i className="dot issued" /> Issued
              </span>
              <span>
                <i className="dot stock-in" /> Stock In
              </span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid
                  stroke="#eef2f7"
                  vertical={false}
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<TrendTooltip />} />
                <Area
                  type="monotone"
                  dataKey="issues"
                  name="Issued"
                  stroke="#10b981"
                  fill="url(#issuedGradient)"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="receipts"
                  name="Stock In"
                  stroke="#f59e0b"
                  fill="url(#stockInGradient)"
                  strokeWidth={2.5}
                />
                <defs>
                  <linearGradient id="issuedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="stockInGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="empty-state">
            <strong>No trend data available</strong>
            <p>Post transactions to see activity.</p>
          </div>
        )}
      </div>
    </article>
  );
}
