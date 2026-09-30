import { Link } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  readHiddenQuickActions,
  resetHiddenQuickActions,
  writeHiddenQuickActions,
} from "~/lib/pos-hub-preferences";
import { greetingName } from "~/lib/display-name";

type LowStockRow = {
  storeId: string;
  partId: string;
  part: string;
  sku: string;
  onHand: string;
  reorderLevel: string;
};

type ActivityRow = {
  id: string;
  href: string;
  actor: string;
  time: Date | null;
  type: string;
  tone: "green" | "blue" | "purple" | "orange";
  label: string;
};

export type PosHubData = {
  lowStock: LowStockRow[];
  reorderCategoryCount: number;
  openJobCardCount: number;
  pendingApprovals: number;
  todayTransactions: number;
  transactionTrend: number | null;
  recentActivity: ActivityRow[];
};

type PosHubProps = {
  userName: string;
  canManage: boolean;
  data: PosHubData;
};

const quickActions = [
  {
    to: "/stock-in/new",
    title: "Stock in",
    description: "Receive parts into store inventory",
    tone: "orange" as const,
    featured: false,
  },
  {
    to: "/scan",
    title: "Scan barcode",
    description: "Look up a part by barcode or SKU",
    tone: "blue" as const,
    featured: false,
  },
  {
    to: "/job-cards",
    title: "Job cards",
    description: "Open and manage workshop job cards",
    tone: "purple" as const,
    featured: false,
  },
  {
    to: "/balances",
    title: "Balances",
    description: "On-hand by store",
    tone: "green" as const,
    featured: false,
  },
  {
    to: "/alerts/low-stock",
    title: "Low stock",
    description: "Reorder alerts",
    tone: "orange" as const,
    featured: false,
  },
  {
    to: "/returns/bus",
    title: "Bus return",
    description: "Return unused parts",
    tone: "blue" as const,
    featured: false,
  },
  {
    to: "/purchases",
    title: "Purchases",
    description: "Local purchase receipts",
    tone: "purple" as const,
    featured: false,
  },
  {
    to: "/approvals",
    title: "Approvals",
    description: "Review pending issues",
    tone: "purple" as const,
    featured: false,
    adminOnly: true,
  },
] as const;

function formatTime(iso: Date | null) {
  if (!iso) return "—";
  return iso.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTrend(value: number | null) {
  if (value === null) return "— vs yesterday";
  const sign = value >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(value).toFixed(0)}% vs yesterday`;
}

function HubIcon({
  tone,
  children,
}: {
  tone: "green" | "blue" | "purple" | "orange";
  children: ReactNode;
}) {
  return (
    <span className={`pos-hub-icon tone-${tone}`} aria-hidden="true">
      {children}
    </span>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function JobCardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 8h8M8 12h8M8 16h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

function ApprovalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 11l2 2 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
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

function IssueIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function StockInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 16V8M8 12l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 20h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 12h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BalanceIcon() {
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

function ReturnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 14 4 9l5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 20v-7a4 4 0 0 0-4-4H4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PurchaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6h15l-1.5 9h-12L6 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ActivityTypeIcon({ type }: { type: string }) {
  if (type === "STOCK_RECEIPT") return <StockInIcon />;
  if (type === "BUS_ISSUE") return <IssueIcon />;
  if (type === "BUS_RETURN") return <ReturnIcon />;
  if (type === "ADJUSTMENT") return <TransactionIcon />;
  return <ApprovalIcon />;
}

function actionIcon(title: string) {
  switch (title) {
    case "Stock in":
      return <StockInIcon />;
    case "Scan barcode":
      return <ScanIcon />;
    case "Job cards":
      return <JobCardIcon />;
    case "Balances":
      return <BalanceIcon />;
    case "Low stock":
      return <AlertIcon />;
    case "Bus return":
      return <ReturnIcon />;
    case "Purchases":
      return <PurchaseIcon />;
    case "Approvals":
      return <ApprovalIcon />;
    default:
      return <TransactionIcon />;
  }
}

export function PosHub({ userName, canManage, data }: PosHubProps) {
  const lowStockCount = data.lowStock.length;
  const firstName = greetingName(userName);
  const [customizing, setCustomizing] = useState(false);
  const [hiddenActions, setHiddenActions] = useState<string[]>([]);

  useEffect(() => {
    setHiddenActions(readHiddenQuickActions());
  }, []);

  const toggleActionVisibility = (path: string) => {
    setHiddenActions((current) => {
      const next = current.includes(path)
        ? current.filter((value) => value !== path)
        : [...current, path];
      writeHiddenQuickActions(next);
      return next;
    });
  };

  const resetQuickActions = () => {
    resetHiddenQuickActions();
    setHiddenActions([]);
  };

  const statCards = [
    {
      label: "Open job cards",
      value: data.openJobCardCount,
      tone: "green" as const,
      href: "/job-cards",
      icon: <JobCardIcon />,
      trend: null,
    },
    {
      label: "Low stock items",
      value: lowStockCount,
      tone: "orange" as const,
      href: "/alerts/low-stock",
      icon: <AlertIcon />,
      trend: null,
    },
    ...(canManage
      ? [
          {
            label: "Pending approvals",
            value: data.pendingApprovals,
            tone: "purple" as const,
            href: "/approvals",
            icon: <ApprovalIcon />,
            trend: null,
          },
        ]
      : []),
    {
      label: "Today's transactions",
      value: data.todayTransactions,
      tone: "blue" as const,
      href: "/reports/movements",
      icon: <TransactionIcon />,
      trend: data.transactionTrend,
    },
  ];

  const visibleActions = quickActions.filter(
    (action) =>
      (!("adminOnly" in action && action.adminOnly) || canManage) &&
      !hiddenActions.includes(action.to),
  );

  const statSpan = statCards.length === 4 ? 3 : 4;

  return (
    <div className="pos-hub-page">
      <header className="pos-hub-header">
        <p className="pos-hub-welcome">Welcome back, {firstName}</p>
        <h1>Operations Hub</h1>
        <p className="muted">
          Your fast-action workspace for daily store operations and inventory
          control.
        </p>
      </header>

      <div className="bento bento-dense animate-slide-up">
        {statCards.map((card) => (
          <Link
            key={card.label}
            to={card.href}
            className={`bento-cell pos-hub-stat bento-span-${statSpan}`}
          >
            <HubIcon tone={card.tone}>{card.icon}</HubIcon>
            <div className="pos-hub-stat-copy">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.trend !== null ? (
                <em className={card.trend >= 0 ? "up" : "down"}>
                  {formatTrend(card.trend)}
                </em>
              ) : null}
            </div>
          </Link>
        ))}

        <div className="pos-hub-section-head bento-span-12">
          <h2>Quick actions</h2>
          <div className="pos-hub-section-actions">
            {customizing ? (
              <button
                type="button"
                className="pos-hub-customize-btn subtle"
                onClick={resetQuickActions}
              >
                Reset
              </button>
            ) : null}
            <button
              type="button"
              className="pos-hub-customize-btn"
              onClick={() => setCustomizing((value) => !value)}
              aria-pressed={customizing}
            >
              {customizing ? "Done" : "Customize"}
            </button>
          </div>
        </div>

        <Link
          to="/pos/issue"
          className="bento-cell pos-hub-action featured bento-span-6 bento-row-2"
        >
          <span className="pos-hub-badge">Most used</span>
          <HubIcon tone="green">
            <IssueIcon />
          </HubIcon>
          <div>
            <strong>Issue parts</strong>
            <span>Scan or search, build a cart, post to a job card</span>
          </div>
          <span className="pos-hub-chevron" aria-hidden="true">
            <ChevronRight />
          </span>
        </Link>

        {customizing
          ? quickActions
              .filter(
                (action) =>
                  !("adminOnly" in action && action.adminOnly) || canManage,
              )
              .map((action) => {
                const hidden = hiddenActions.includes(action.to);
                return (
                  <label
                    key={action.to}
                    className={`bento-cell pos-hub-action pos-hub-action-edit bento-span-3${
                      hidden ? " is-hidden" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() => toggleActionVisibility(action.to)}
                    />
                    <HubIcon tone={action.tone}>
                      {actionIcon(action.title)}
                    </HubIcon>
                    <div>
                      <strong>{action.title}</strong>
                      <span>{action.description}</span>
                    </div>
                  </label>
                );
              })
          : visibleActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="bento-cell pos-hub-action bento-span-3"
              >
                <HubIcon tone={action.tone}>{actionIcon(action.title)}</HubIcon>
                <div>
                  <strong>{action.title}</strong>
                  <span>{action.description}</span>
                </div>
                <span className="pos-hub-chevron" aria-hidden="true">
                  <ChevronRight />
                </span>
              </Link>
            ))}

        <article className="bento-cell pos-hub-widget bento-span-4 bento-row-2">
          <div className="pos-hub-widget-head">
            <h2>Recent activity</h2>
            <Link to="/reports/movements">View all</Link>
          </div>
          <div className="pos-hub-widget-body">
            {data.recentActivity.length > 0 ? (
              <ul className="pos-hub-activity-list">
                {data.recentActivity.map((row) => (
                  <li key={row.id}>
                    <HubIcon tone={row.tone}>
                      <ActivityTypeIcon type={row.type} />
                    </HubIcon>
                    <div className="pos-hub-activity-copy">
                      <Link to={row.href}>{row.label}</Link>
                      <span>{row.actor}</span>
                    </div>
                    <time dateTime={row.time?.toISOString()}>
                      {formatTime(row.time)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <strong>No activity yet</strong>
                <p>Posted transactions will appear here.</p>
              </div>
            )}
          </div>
        </article>

        <article className="bento-cell pos-hub-widget bento-span-4 bento-row-2">
          <div className="pos-hub-widget-head">
            <h2>Today&apos;s priority</h2>
            <Link to="/alerts/low-stock">View all</Link>
          </div>
          <div className="pos-hub-widget-body">
            {data.lowStock.length > 0 ? (
              <ol className="pos-hub-priority-list">
                {data.lowStock.slice(0, 3).map((row, index) => (
                  <li key={`${row.storeId}-${row.partId}`}>
                    <span className="pos-hub-priority-rank">{index + 1}</span>
                    <div className="pos-hub-priority-copy">
                      <strong>{row.part}</strong>
                      <span>
                        Min: {row.reorderLevel} · Current: {row.onHand}
                      </span>
                    </div>
                    <Link
                      to={`/stock-in/new?part=${row.partId}&store=${row.storeId}`}
                      className="pos-hub-reorder-btn"
                    >
                      Reorder
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-state">
                <strong>All clear</strong>
                <p>No parts are below reorder level.</p>
              </div>
            )}
          </div>
        </article>

        <article className="bento-cell pos-hub-widget bento-span-4 bento-row-2">
          <div className="pos-hub-widget-head">
            <h2>Approvals &amp; reorder</h2>
            <Link to="/alerts/low-stock">View all</Link>
          </div>
          <div className="pos-hub-widget-body">
            <div className="pos-hub-side-cards">
              {canManage ? (
                <Link to="/approvals" className="pos-hub-side-card tone-purple">
                  <div>
                    <strong>Pending approvals</strong>
                    <span>
                      {data.pendingApprovals > 0
                        ? `${data.pendingApprovals} item${data.pendingApprovals === 1 ? "" : "s"} waiting review`
                        : "No items waiting review"}
                    </span>
                  </div>
                  <span className="pos-hub-side-cta">Review now</span>
                </Link>
              ) : null}
              <Link
                to="/alerts/low-stock"
                className="pos-hub-side-card tone-orange"
              >
                <div>
                  <strong>Reorder suggestions</strong>
                  <span>
                    {lowStockCount > 0
                      ? `${lowStockCount} item${lowStockCount === 1 ? "" : "s"} below minimum`
                      : "All stock levels healthy"}
                  </span>
                </div>
                <span className="pos-hub-side-cta">View list</span>
              </Link>
              {canManage ? (
                <Link
                  to="/admin/reorder"
                  className="pos-hub-side-card tone-green"
                >
                  <div>
                    <strong>Auto reorder</strong>
                    <span>
                      {data.reorderCategoryCount > 0
                        ? `Configured for ${data.reorderCategoryCount} categor${data.reorderCategoryCount === 1 ? "y" : "ies"}`
                        : "No reorder thresholds configured yet"}
                    </span>
                  </div>
                  <span className="pos-hub-side-cta">Manage levels</span>
                </Link>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
