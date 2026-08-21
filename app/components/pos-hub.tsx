import { Link } from "react-router";

type PosHubProps = {
  lowStockCount: number;
  openJobCardCount: number;
  pendingApprovals: number;
  canManage: boolean;
};

const primaryTiles = [
  {
    to: "/pos/issue",
    title: "Issue parts",
    description: "Scan or search, build a cart, post to a job card",
    tone: "primary",
  },
  {
    to: "/stock-in/new",
    title: "Stock in",
    description: "Receive parts into store inventory",
    tone: "secondary",
  },
  {
    to: "/scan",
    title: "Scan",
    description: "Look up a part by barcode or SKU",
    tone: "secondary",
  },
  {
    to: "/job-cards",
    title: "Job cards",
    description: "Open and manage workshop job cards",
    tone: "secondary",
  },
] as const;

const secondaryTiles = [
  { to: "/balances", title: "Balances", description: "On-hand by store" },
  {
    to: "/alerts/low-stock",
    title: "Low stock",
    description: "Reorder alerts",
  },
  {
    to: "/returns/bus",
    title: "Bus return",
    description: "Return unused parts",
  },
  {
    to: "/purchases",
    title: "Purchases",
    description: "Local purchase receipts",
  },
] as const;

export function PosHub({
  lowStockCount,
  openJobCardCount,
  pendingApprovals,
  canManage,
}: PosHubProps) {
  return (
    <div className="pos-hub">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Store keeper</p>
          <h1>Operations hub</h1>
          <p className="muted">
            Fast access to the actions you use all day. Switch to Classic for
            charts and reports.
          </p>
        </div>
      </div>

      <section className="pos-status-strip" aria-label="Status">
        <Link to="/job-cards" className="pos-status-item">
          <span>Open job cards</span>
          <strong>{openJobCardCount}</strong>
        </Link>
        <Link
          to="/alerts/low-stock"
          className={`pos-status-item${lowStockCount > 0 ? " warn" : ""}`}
        >
          <span>Low stock</span>
          <strong>{lowStockCount}</strong>
        </Link>
        {canManage ? (
          <Link
            to="/approvals"
            className={`pos-status-item${pendingApprovals > 0 ? " warn" : ""}`}
          >
            <span>Pending approvals</span>
            <strong>{pendingApprovals}</strong>
          </Link>
        ) : null}
      </section>

      <section className="pos-tile-grid primary" aria-label="Primary actions">
        {primaryTiles.map((tile) => (
          <Link key={tile.to} to={tile.to} className={`pos-tile ${tile.tone}`}>
            <strong>{tile.title}</strong>
            <span>{tile.description}</span>
          </Link>
        ))}
      </section>

      <section className="pos-tile-grid secondary" aria-label="More actions">
        {secondaryTiles.map((tile) => (
          <Link key={tile.to} to={tile.to} className="pos-tile">
            <strong>{tile.title}</strong>
            <span>{tile.description}</span>
          </Link>
        ))}
        {canManage ? (
          <Link to="/approvals" className="pos-tile">
            <strong>Approvals</strong>
            <span>
              {pendingApprovals > 0
                ? `${pendingApprovals} waiting`
                : "Review pending issues"}
            </span>
          </Link>
        ) : null}
      </section>
    </div>
  );
}
