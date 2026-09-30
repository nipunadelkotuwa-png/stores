import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ReportPrintFooter,
  ReportPrintHeader,
} from "~/components/report-print-header";
import { getBalances } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.balances";

export async function loader({ request }: Route.LoaderArgs) {
  return {
    balances: await getBalances(
      await requirePermission(request, "balances.read"),
    ),
  };
}

export default function BalancesPage({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get("q")?.trim() ?? "",
  );

  useEffect(() => {
    setSearchQuery(searchParams.get("q")?.trim() ?? "");
  }, [searchParams]);

  const rows = loaderData.balances.filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      row.sku.toLowerCase().includes(q) || row.part.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <ReportPrintHeader
        title="Stock Balances Register"
        subtitle="Current On-Hand Inventory Valuation & Balances"
        metadata={[
          ...(searchQuery ? [{ label: "Search Filter", value: searchQuery }] : []),
          { label: "Total Listed Items", value: rows.length },
        ]}
      />

      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Live inventory</p>
          <h1>Stock balances</h1>
          <p className="muted">
            Current on-hand quantity for every part and accessible location.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <section className="panel">
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "1rem",
          }}
        >
          <input
            type="search"
            placeholder="Search parts or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            style={{
              padding: "0.5rem",
              borderRadius: "4px",
              border: "1px solid var(--border, #c5c9d4)",
            }}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>SKU</th>
                <th>Part</th>
                <th>On hand</th>
                <th>Reorder level</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {searchQuery
                      ? "No balances match that search."
                      : "No on-hand balances yet."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.storeCode}-${row.partId}`}>
                    <td>
                      <strong>{row.storeCode}</strong>
                      <small>{row.store}</small>
                    </td>
                    <td className="mono">{row.sku}</td>
                    <td>{row.part}</td>
                    <td className="quantity">
                      {row.onHand} {row.unit}
                    </td>
                    <td>{row.reorderLevel ?? "Not set"}</td>
                    <td className="no-print">
                      <Link
                        to={`/issues/new?part=${row.partId}&store=${row.storeId}`}
                      >
                        Issue
                      </Link>
                      {" · "}
                      <Link
                        to={`/stock-in/new?part=${row.partId}&store=${row.storeId}`}
                      >
                        Stock in
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ReportPrintFooter reportName="Stock Balances Register" />
    </>
  );
}
