import { data, Link } from "react-router";
import { getDocumentForReceipt } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import { can } from "~/lib/auth/permissions";
import type { Route } from "./+types/app.receipts.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "reports.read");
  const doc = await getDocumentForReceipt(actor, params.id);
  if (!doc) {
    throw data("Receipt not found or you don't have permission to view it.", {
      status: 404,
    });
  }
  return { doc, isAdmin: can(actor.role, "approvals.manage") };
}

export default function ReceiptPage({ loaderData }: Route.ComponentProps) {
  const { doc, isAdmin } = loaderData;
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Transaction</p>
          <h1>Receipt {doc.number}</h1>
        </div>
        <div className="heading-actions">
          <Link to="/reports/movements" className="button button-secondary">
            Movement ledger
          </Link>
          <button
            className="button button-primary"
            onClick={() => window.print()}
          >
            Print Receipt
          </button>
        </div>
      </div>

      <section
        className="panel receipt-panel"
        style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ letterSpacing: "0.04em", margin: 0, fontSize: "1.35rem", fontWeight: 800 }}>
            DS GUNASEKARA GROUP
          </h2>
          <p
            style={{
              margin: "3px 0 0 0",
              fontWeight: 700,
              color: "#555",
              textTransform: "uppercase",
              fontSize: "0.85rem",
              letterSpacing: "0.05em",
            }}
          >
            Central Stores & Fleet Inventory Management
          </p>
          <p style={{ margin: "3px 0 0 0", color: "#444", fontSize: "0.85rem" }}>
            Store: <strong>{doc.storeCode} — {doc.store}</strong>
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            gap: "1rem",
            borderTop: "1.5px solid #111",
            borderBottom: "1.5px solid #111",
            padding: "8px 0",
          }}
        >
          <div>
            <p style={{ margin: "2px 0" }}>
              <strong>Document Number:</strong> <span className="mono">{doc.number}</span>
            </p>
            <p style={{ margin: "2px 0" }}>
              <strong>Type:</strong> {doc.type.replaceAll("_", " ")}
            </p>
            <p style={{ margin: "2px 0" }}>
              <strong>Status:</strong> {doc.status.replaceAll("_", " ")}
            </p>
            <p style={{ margin: "2px 0" }}>
              <strong>Date:</strong> {doc.date}
            </p>
            {doc.destinationStore ? (
              <p style={{ margin: "2px 0" }}>
                <strong>Transfer Note:</strong> {doc.storeCode} ({doc.store}) ➔{" "}
                {doc.destinationStoreCode} ({doc.destinationStore})
              </p>
            ) : null}
          </div>
          <div style={{ textAlign: "right" }}>
            {doc.jobNumber ? (
              <p style={{ margin: "2px 0" }}>
                <strong>Job Card:</strong>{" "}
                <Link
                  to={`/job-cards/${doc.jobCardId}`}
                  style={{ textDecoration: "underline", fontWeight: 700 }}
                >
                  {doc.jobNumber}
                </Link>
                {doc.jobCardType ? ` (${doc.jobCardType})` : ""}
              </p>
            ) : null}
            {doc.bus ? (
              <p style={{ margin: "2px 0" }}>
                <strong>Fleet Number:</strong> {doc.bus}
                {doc.busRegistration ? ` (${doc.busRegistration})` : ""}
              </p>
            ) : null}
            {doc.createdByName ? (
              <p style={{ margin: "2px 0" }}>
                <strong>Prepared By:</strong> {doc.createdByName}
              </p>
            ) : null}
            {doc.postedByName ? (
              <p style={{ margin: "2px 0" }}>
                <strong>Posted By:</strong> {doc.postedByName}
              </p>
            ) : null}
            <p style={{ margin: "2px 0" }}>
              <strong>Posted At:</strong>{" "}
              {doc.postedAt ? new Date(doc.postedAt).toLocaleString("en-GB") : "—"}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #000" }}>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>SKU</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>
                  Description
                </th>
                <th style={{ textAlign: "right", padding: "0.5rem 0" }}>Qty</th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0.5rem 0",
                    paddingLeft: "0.5rem",
                  }}
                >
                  Unit
                </th>
                {doc.lines.some((line) => line.unitCost) ? (
                  <th style={{ textAlign: "right", padding: "0.5rem 0" }}>
                    Unit cost
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #ccc" }}>
                  <td style={{ padding: "0.5rem 0" }} className="mono">
                    {line.sku}
                  </td>
                  <td style={{ padding: "0.5rem 0" }}>{line.name}</td>
                  <td style={{ padding: "0.5rem 0", textAlign: "right" }}>
                    {line.quantity}
                  </td>
                  <td style={{ padding: "0.5rem 0", paddingLeft: "0.5rem" }}>
                    {line.unit}
                  </td>
                  {doc.lines.some((row) => row.unitCost) ? (
                    <td style={{ padding: "0.5rem 0", textAlign: "right" }}>
                      {line.unitCost ?? "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {doc.status === "PENDING_APPROVAL" ? (
          <p className="badge warning">
            Awaiting verification — stock not deducted yet
          </p>
        ) : null}
        {doc.status === "REJECTED" ? (
          <p className="badge danger">Rejected</p>
        ) : null}
        {doc.lastApprovalAttemptedAt ? (
          <p className="muted">
            Last verification attempt:{" "}
            {new Date(doc.lastApprovalAttemptedAt).toLocaleString()}
          </p>
        ) : null}
        {doc.lastApprovalError ? (
          <p className="form-error">{doc.lastApprovalError}</p>
        ) : null}
        {isAdmin &&
        (doc.status === "PENDING_APPROVAL" || doc.status === "REJECTED") ? (
          <p className="no-print">
            <Link to="/approvals?tab=issues">Open Approvals Center</Link>
          </p>
        ) : null}

        {doc.reason && (
          <div
            style={{
              marginTop: "1.5rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid #eee",
            }}
          >
            <p>
              <strong>Reason / Remarks:</strong> {doc.reason}
            </p>
          </div>
        )}

        <div
          className="print-section"
          style={{
            marginTop: "3rem",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2rem",
            textAlign: "center",
          }}
        >
          <div>
            <div
              style={{ borderBottom: "1.5px solid #000", height: "35px" }}
            ></div>
            <p style={{ marginTop: "0.4rem", fontWeight: "600", fontSize: "9pt" }}>
              Issued / Prepared By: {doc.createdByName || "____________________"}
            </p>
          </div>
          <div>
            <div
              style={{ borderBottom: "1.5px solid #000", height: "35px" }}
            ></div>
            <p style={{ marginTop: "0.4rem", fontWeight: "600", fontSize: "9pt" }}>
              Authorized / Received By
            </p>
          </div>
        </div>

        {/* Standard StoreOPS Print Footer */}
        <div className="print-footer-bar print-only">
          <div>StoreOPS • DS Gunasekara Group</div>
          <div>{doc.number}</div>
          <div>
            Printed:{" "}
            {new Date().toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </section>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; padding: 0 !important; }
          .panel, .receipt-panel {
            box-shadow: none !important;
            border: 1.5px solid #111 !important;
            border-radius: 0 !important;
            padding: 12px 16px !important;
            margin: 0 auto !important;
            max-width: 100% !important;
          }
        }
      `,
        }}
      />
    </>
  );
}
