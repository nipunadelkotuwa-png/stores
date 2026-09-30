import { Link } from "react-router";
import { lazy, Suspense, type ReactNode } from "react";

import { PERIOD_OPTIONS, type PeriodDays } from "~/features/dashboard/period";
import type { getDashboard } from "~/features/dashboard/queries.server";
import { greetingName } from "~/lib/display-name";

const ClassicDashboardChart = lazy(() =>
  import("~/components/classic-dashboard-chart").then((module) => ({
    default: module.ClassicDashboardChart,
  })),
);

export type ClassicDashboardData = Awaited<ReturnType<typeof getDashboard>> & {
  canManage: boolean;
};

type ClassicDashboardProps = {
  loaderData: ClassicDashboardData;
  userName: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  STOCK_RECEIPT: "Stock In",
  BUS_ISSUE: "Issue",
  BUS_RETURN: "Bus Return",
  ADJUSTMENT: "Adjustment",
  REVERSAL: "Reversal",
  TYRE_DAG_SEND: "DAG Send",
  TYRE_DAG_RECEIVE: "DAG Receive",
  TYRE_DISPOSAL: "Tyre Disposal",
  TRANSFER_OUT: "Transfer Out",
  TRANSFER_IN: "Transfer In",
};

const RECEIPT_TYPES = new Set([
  "STOCK_RECEIPT",
  "TRANSFER_IN",
  "BUS_RETURN",
  "TYRE_DAG_RECEIVE",
]);
const ISSUE_TYPES = new Set([
  "BUS_ISSUE",
  "TRANSFER_OUT",
  "TYRE_DAG_SEND",
  "TYRE_DISPOSAL",
]);

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
    if (RECEIPT_TYPES.has(row.type)) entry.receipts += Number(row.count);
    else if (ISSUE_TYPES.has(row.type)) entry.issues += Number(row.count);
    byDate.set(row.date, entry);
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

function formatLkr(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "LKR 0";
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatQuantity(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(
    amount,
  );
}

function formatRelativeTime(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTrend(value: number | null, periodDays: number) {
  if (value === null) return null;
  const sign = value >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(value).toFixed(1)}% vs prior ${periodDays} days`;
}

function formatGrowth(count: number) {
  if (count <= 0) return "No new this period";
  return `+${count} new this period`;
}

function formatKpiTrend(
  kind: "stores" | "parts" | "buses" | "transactions",
  trend: number | null,
  growth: { stores: number; parts: number; buses: number },
  periodDays: number,
) {
  if (kind === "parts") return formatGrowth(growth.parts);
  if (kind === "buses") return formatGrowth(growth.buses);
  if (kind === "stores") {
    return growth.stores > 0
      ? formatGrowth(growth.stores)
      : trend === null
        ? null
        : formatTrend(trend, periodDays);
  }
  return formatTrend(trend, periodDays);
}

function MetricIcon({
  tone,
  children,
}: {
  tone: "green" | "blue" | "purple" | "orange" | "red";
  children: ReactNode;
}) {
  return (
    <span className={`dash-metric-icon tone-${tone}`} aria-hidden="true">
      {children}
    </span>
  );
}

function StoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PartsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M4 12h16M4 17h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="5"
        width="16"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 11h16M8 17v2M16 17v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TransactionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 7h10M7 12h6M7 17h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 8v5M12 16.5h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10.3 4.5 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.5a1.5 1.5 0 0 0-2.6 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function txTone(type: string): "green" | "blue" | "purple" | "orange" {
  if (type === "STOCK_RECEIPT") return "orange";
  if (type === "BUS_ISSUE") return "purple";
  if (type === "BUS_RETURN") return "blue";
  return "green";
}

function PeriodSelector({
  periodDays,
  periodLabel,
}: {
  periodDays: PeriodDays;
  periodLabel: string;
}) {
  return (
    <div className="dash-period">
      <span className="dash-period-label">{periodLabel}</span>
      <div
        className="dash-period-options"
        role="group"
        aria-label="Reporting period"
      >
        {PERIOD_OPTIONS.map((days) => (
          <Link
            key={days}
            to={`?days=${days}`}
            className={days === periodDays ? "active" : undefined}
            aria-current={days === periodDays ? "true" : undefined}
          >
            {days} days
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ClassicDashboard({
  loaderData,
  userName,
}: ClassicDashboardProps) {
  const chartData = processTrendData(loaderData.trendData);
  const firstName = greetingName(userName);
  const periodDays = loaderData.periodDays;

  const kpiCards = [
    {
      key: "stores" as const,
      label: "Stores",
      value: loaderData.storeCount,
      subtitle: "Active stores",
      trend: loaderData.trends.stores,
      tone: "green" as const,
      icon: <StoreIcon />,
    },
    {
      key: "parts" as const,
      label: "Active Parts",
      value: loaderData.partCount,
      subtitle: "In inventory",
      trend: loaderData.trends.parts,
      tone: "blue" as const,
      icon: <PartsIcon />,
    },
    {
      key: "buses" as const,
      label: "Buses",
      value: loaderData.busCount,
      subtitle: "In operation",
      trend: loaderData.trends.buses,
      tone: "purple" as const,
      icon: <BusIcon />,
    },
    {
      key: "transactions" as const,
      label: "Posted Transactions",
      value: loaderData.transactionCount,
      subtitle: `Last ${periodDays} days`,
      trend: loaderData.trends.transactions,
      tone: "orange" as const,
      icon: <TransactionIcon />,
    },
  ];

  const summaryCards = [
    {
      label: "Total Units On Hand",
      value: formatQuantity(loaderData.totalItems),
      subtitle: "Sum of quantities across stores",
      tone: "green" as const,
    },
    {
      label: "Total Value",
      value: formatLkr(loaderData.totalValue),
      subtitle: "Inventory valuation",
      tone: "blue" as const,
    },
    {
      label: "Total Issued (This Period)",
      value: formatLkr(loaderData.periodIssuedValue),
      subtitle: "Across all channels",
      tone: "purple" as const,
    },
    {
      label: "Total Stock In (This Period)",
      value: formatLkr(loaderData.periodStockInValue),
      subtitle: "Across all channels",
      tone: "orange" as const,
    },
  ];

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-copy">
          <p className="dash-welcome">Welcome back, {firstName}</p>
          <h1>Inventory Dashboard</h1>
          <p className="muted">
            Real-time overview of inventory operations across all stores.
          </p>
        </div>
        <div className="dash-header-actions">
          {loaderData.canManage ? (
            <Link
              className="button dash-btn dash-btn-outline-green"
              to="/parts#add-part-form"
            >
              + Add New Item
            </Link>
          ) : null}
          <Link
            className="button dash-btn dash-btn-outline-blue"
            to="/pos/issue"
          >
            Issue (POS)
          </Link>
          <Link
            className="button dash-btn dash-btn-outline-purple"
            to="/issues/new"
          >
            Issue to Bus
          </Link>
          <Link className="button dash-btn dash-btn-solid" to="/stock-in/new">
            Record Stock In
          </Link>
        </div>
      </header>

      <PeriodSelector
        periodDays={periodDays}
        periodLabel={loaderData.periodLabel}
      />

      <div className="bento bento-tall animate-slide-up">
        {kpiCards.map((card) => {
          const trendLabel = formatKpiTrend(
            card.key,
            card.trend,
            loaderData.growth,
            periodDays,
          );
          return (
            <article
              className="bento-cell dash-kpi-card bento-span-2"
              key={card.label}
            >
              <div className="dash-kpi-top">
                <MetricIcon tone={card.tone}>{card.icon}</MetricIcon>
                <span className="dash-kpi-label">{card.label}</span>
              </div>
              <strong className="dash-kpi-value">{card.value}</strong>
              <p className="dash-kpi-subtitle">{card.subtitle}</p>
              {trendLabel ? (
                <p
                  className={`dash-kpi-trend${
                    card.key === "transactions" && card.trend !== null
                      ? card.trend >= 0
                        ? " up"
                        : " down"
                      : trendLabel.startsWith("+")
                        ? " up"
                        : ""
                  }`}
                >
                  {trendLabel}
                </p>
              ) : null}
            </article>
          );
        })}
        <article className="bento-cell dash-kpi-card dash-kpi-alert bento-span-4">
          <div className="dash-kpi-top">
            <MetricIcon tone="red">
              <AlertIcon />
            </MetricIcon>
            <span className="dash-kpi-label">Low-Stock Alerts</span>
          </div>
          <strong className="dash-kpi-value">{loaderData.lowStockCount}</strong>
          <p className="dash-kpi-subtitle">Items below minimum</p>
          <Link className="dash-kpi-link" to="/alerts/low-stock">
            Review now →
          </Link>
        </article>

        <Suspense
          fallback={
            <article className="bento-cell dash-panel dash-chart-panel bento-span-8 bento-row-2">
              <div className="empty-state">
                <strong>Loading chart…</strong>
              </div>
            </article>
          }
        >
          <ClassicDashboardChart
            chartData={chartData}
            periodDays={periodDays}
          />
        </Suspense>

        <article className="bento-cell dash-panel dash-low-stock-panel bento-span-4 bento-row-2">
          <div className="dash-panel-head">
            <h2>Low Stock Items</h2>
            <Link to="/alerts/low-stock">View all</Link>
          </div>
          {loaderData.lowStock.length > 0 ? (
            <ul className="dash-low-stock-list">
              {loaderData.lowStock.slice(0, 5).map((row) => {
                const onHand = Number(row.onHand);
                const reorder = Math.max(Number(row.reorderLevel), 1);
                const pct = Math.min((onHand / reorder) * 100, 100);
                return (
                  <li key={`${row.store}-${row.sku}`}>
                    <span className="dash-part-thumb" aria-hidden="true">
                      {row.part.slice(0, 1)}
                    </span>
                    <div className="dash-low-stock-copy">
                      <strong>{row.part}</strong>
                      <span className="mono">{row.sku}</span>
                      <div className="dash-stock-bar">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="dash-low-stock-qty">
                      <strong>
                        {onHand} / {row.reorderLevel}
                      </strong>
                      <span>Min: {row.reorderLevel}</span>
                      <Link
                        to={`/stock-in/new?part=${row.partId}&store=${row.storeId}`}
                        className="dash-restock-link"
                      >
                        Stock in
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>All clear</strong>
              <p>No parts are below reorder level.</p>
            </div>
          )}
        </article>

        <div className="bento-cell bento-span-8 bento-row-2 dash-summary-shell">
          <div className="dash-summary-grid">
            {summaryCards.map((card) => (
              <article
                className={`dash-summary-card tone-${card.tone}`}
                key={card.label}
              >
                <p className="dash-summary-label">{card.label}</p>
                <strong className="dash-summary-value">{card.value}</strong>
                <span className="dash-summary-subtitle">{card.subtitle}</span>
                <span
                  className={`dash-summary-icon tone-${card.tone}`}
                  aria-hidden="true"
                />
              </article>
            ))}
          </div>
        </div>

        <article className="bento-cell dash-panel dash-recent-panel bento-span-4 bento-row-2">
          <div className="dash-panel-head">
            <h2>Recent Transactions</h2>
            <Link to="/reports/movements">View all</Link>
          </div>
          {loaderData.recentTransactions.length > 0 ? (
            <ul className="dash-recent-list">
              {loaderData.recentTransactions.map((row) => (
                <li key={row.id}>
                  <MetricIcon tone={txTone(row.type)}>
                    <TransactionIcon />
                  </MetricIcon>
                  <div className="dash-recent-copy">
                    <strong>{DOC_TYPE_LABELS[row.type] ?? row.type}</strong>
                    <Link to={`/receipts/${row.id}`} className="mono">
                      {row.number}
                    </Link>
                  </div>
                  <div className="dash-recent-meta">
                    <span>
                      {formatRelativeTime(
                        row.postedAt ? row.postedAt.toISOString() : null,
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>No transactions yet</strong>
              <p>Posted documents will appear here.</p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
