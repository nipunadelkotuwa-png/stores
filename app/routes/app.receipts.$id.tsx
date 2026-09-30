import { data, Link } from "react-router";
import {
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportNotes,
  ReportSection,
  ReportSignatures,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
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

function getDocumentConfig(doc: {
  type: string;
  number: string;
  status: string;
}) {
  switch (doc.type) {
    case "STOCK_RECEIPT":
      return {
        title: "Goods Receipt Note (GRN)",
        department: "Central Stores & Inventory Procurement",
        showCosts: true,
        signers: [
          { title: "Goods Received By", caption: "Storekeeper / Receiving Officer" },
          { title: "Verified & Approved By", caption: "Stores Supervisor / Accountant" },
        ],
      };
    case "BUS_ISSUE":
      return {
        title: "Store Issue Voucher (SIV)",
        department: "Workshop & Fleet Maintenance Stores",
        showCosts: false,
        signers: [
          { title: "Parts Issued By", caption: "Storekeeper" },
          { title: "Received By", caption: "Mechanic / Technician" },
          { title: "Authorized By", caption: "Workshop Supervisor" },
        ],
      };
    case "BUS_RETURN":
      return {
        title: "Store Return Note (SRN)",
        department: "Workshop & Fleet Maintenance Stores",
        showCosts: false,
        signers: [
          { title: "Parts Returned By", caption: "Mechanic / Lead Technician" },
          { title: "Stock Accepted By", caption: "Storekeeper" },
        ],
      };
    case "ADJUSTMENT":
      return {
        title: "Inventory Adjustment Voucher",
        department: "Stores Audit & Inventory Control",
        showCosts: false,
        signers: [
          { title: "Stock Counted By", caption: "Storekeeper / Auditor" },
          { title: "Adjustment Authorized By", caption: "General Manager / Finance" },
        ],
      };
    case "REVERSAL":
      return {
        title: "Document Reversal Voucher",
        department: "Stores Audit & Transaction Control",
        showCosts: true,
        signers: [
          { title: "Reversal Requested By", caption: "Storekeeper / Operator" },
          { title: "Reversal Authorized By", caption: "Stores Manager / Supervisor" },
        ],
      };
    case "TRANSFER_OUT":
      return {
        title: "Inter-Store Transfer Note (Dispatch)",
        department: "Supply Chain & Multi-Store Logistics",
        showCosts: false,
        signers: [
          { title: "Dispatched By", caption: "Issuing Storekeeper" },
          { title: "Carrier / Driver", caption: "Transport Officer" },
          { title: "Destination Receiver", caption: "Receiving Storekeeper" },
        ],
      };
    case "TRANSFER_IN":
      return {
        title: "Inter-Store Transfer Receipt",
        department: "Supply Chain & Multi-Store Logistics",
        showCosts: false,
        signers: [
          { title: "Goods Received By", caption: "Receiving Storekeeper" },
          { title: "Verified By", caption: "Stores Supervisor" },
        ],
      };
    case "TYRE_DAG_SEND":
      return {
        title: "Tyre Retreading Dispatch (DAG OUT)",
        department: "Tyre Management & Retreading Division",
        showCosts: false,
        signers: [
          { title: "Tyres Inspected & Sent By", caption: "Tyre Officer / Storekeeper" },
          { title: "Retreading Agent / Driver", caption: "Supplier Representative" },
        ],
      };
    case "TYRE_DAG_RECEIVE":
      return {
        title: "Tyre Retreading Receipt (DAG IN)",
        department: "Tyre Management & Retreading Division",
        showCosts: true,
        signers: [
          { title: "Tyres Inspected & Accepted", caption: "Tyre Inspector" },
          { title: "Received into Stock By", caption: "Storekeeper" },
        ],
      };
    case "TYRE_DISPOSAL":
      return {
        title: "Tyre Condemnation & Disposal Certificate",
        department: "Fleet Asset & Tyre Management Division",
        showCosts: false,
        signers: [
          { title: "Inspected & Condemned By", caption: "Senior Tyre Technician" },
          { title: "Scrap Disposal Authorized By", caption: "Fleet Engineer / Manager" },
        ],
      };
    default:
      return {
        title: "Stock Transaction Voucher",
        department: "Central Stores & Inventory Management",
        showCosts: false,
        signers: [
          { title: "Prepared / Issued By", caption: "Storekeeper" },
          { title: "Received / Authorized By", caption: "Supervisor" },
        ],
      };
  }
}

export default function ReceiptPage({ loaderData }: Route.ComponentProps) {
  const { doc, isAdmin } = loaderData;
  const config = getDocumentConfig(doc);

  const isAdjustment = doc.type === "ADJUSTMENT";
  const isReversal = doc.type === "REVERSAL";
  const isTransfer = doc.type === "TRANSFER_OUT" || doc.type === "TRANSFER_IN";
  const isReceipt = doc.type === "STOCK_RECEIPT";
  const isBusDoc = doc.type === "BUS_ISSUE" || doc.type === "BUS_RETURN";

  // Total calculation if costs available
  const hasUnitCosts = doc.lines.some((l) => l.unitCost != null && Number(l.unitCost) > 0);
  const totalAmount = doc.lines.reduce((sum, l) => {
    const cost = Number(l.unitCost ?? 0);
    const qty = Number(l.quantity);
    return sum + cost * qty;
  }, 0);

  return (
    <>
      {/* Screen action bar */}
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Transaction Document</p>
          <h1>{config.title} • {doc.number}</h1>
        </div>
        <div className="heading-actions">
          <Link to="/reports/movements" className="button button-secondary">
            Movement Ledger
          </Link>
          {doc.jobCardId ? (
            <Link to={`/job-cards/${doc.jobCardId}`} className="button button-secondary">
              View Job Card
            </Link>
          ) : null}
          <button
            className="button button-primary"
            onClick={() => window.print()}
          >
            Print A4 Voucher
          </button>
        </div>
      </div>

      {/* Main Print Container using ReportPrimitives */}
      <ReportLayout mode="document" className="receipt-print-wrapper">
        {/* Document Header */}
        <ReportHeader
          department={config.department}
          storeName={`${doc.storeCode} — ${doc.store}`}
          title={config.title}
          documentNumber={doc.number}
          date={doc.date}
          status={doc.status}
          subtitle={`Reference: ${doc.id}`}
        />

        {/* High-Visibility Audit Banner for Reversals */}
        {isReversal ? (
          <div
            style={{
              backgroundColor: "#f3e8fd",
              border: "2px solid #7627bb",
              padding: "10px 14px",
              marginBottom: "12px",
              borderRadius: "4px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ color: "#581c87", fontSize: "11pt", textTransform: "uppercase" }}>
                  Official Transaction Reversal Voucher
                </strong>
                <div style={{ fontSize: "9pt", color: "#3b0764", marginTop: "2px" }}>
                  This document officially and permanently reverses document:{" "}
                  <strong>{doc.reversedDocNumber || "Unknown Original Document"}</strong>
                  {doc.reversedDocType ? ` (${doc.reversedDocType.replaceAll("_", " ")})` : ""}
                </div>
              </div>
              <span
                style={{
                  backgroundColor: "#7627bb",
                  color: "#ffffff",
                  padding: "4px 10px",
                  fontSize: "8.5pt",
                  fontWeight: 700,
                  borderRadius: "3px",
                  letterSpacing: "0.04em",
                }}
              >
                REVERSAL AUDITED
              </span>
            </div>
          </div>
        ) : null}

        {/* High-Visibility Audit Banner for Adjustments */}
        {isAdjustment ? (
          <div
            style={{
              backgroundColor: "#fff8e1",
              border: "2px solid #b06000",
              padding: "10px 14px",
              marginBottom: "12px",
              borderRadius: "4px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ color: "#7c2d12", fontSize: "10.5pt", textTransform: "uppercase" }}>
                  Inventory Discrepancy / Stock Count Adjustment
                </strong>
                <div style={{ fontSize: "8.5pt", color: "#451a03", marginTop: "2px" }}>
                  Adjusts ledger balances to reflect physical stock verification. Requires management authorization.
                </div>
              </div>
              <span
                style={{
                  backgroundColor: "#b06000",
                  color: "#ffffff",
                  padding: "4px 8px",
                  fontSize: "8pt",
                  fontWeight: 700,
                  borderRadius: "3px",
                }}
              >
                AUDIT ADJUSTMENT
              </span>
            </div>
          </div>
        ) : null}

        {/* Pending Verification Banner */}
        {doc.status === "PENDING_APPROVAL" ? (
          <div
            style={{
              backgroundColor: "#fef7e0",
              border: "1.5px solid #b06000",
              padding: "8px 12px",
              marginBottom: "12px",
              fontSize: "9pt",
              color: "#b06000",
              fontWeight: 600,
            }}
          >
            ⚠ Notice: This document is currently <strong>AWAITING APPROVAL</strong>. Inventory ledger balances are not affected until verified.
          </div>
        ) : null}

        {/* Primary Metadata Section */}
        <ReportSection title="Document & Operational Context">
          <ReportInfoGrid
            columns={4}
            items={[
              { label: "Document No", value: doc.number, highlight: true },
              { label: "Transaction Date", value: doc.date },
              { label: "Store / Warehouse", value: `${doc.storeCode} — ${doc.store}` },
              { label: "Document Status", value: doc.status.replaceAll("_", " ") },

              ...(isBusDoc || doc.bus
                ? [
                    { label: "Fleet Number", value: doc.bus || "—", highlight: true },
                    { label: "Registration No", value: doc.busRegistration || "—" },
                    {
                      label: "Vehicle Model",
                      value: [doc.busMake, doc.busModel].filter(Boolean).join(" ") || "—",
                    },
                    {
                      label: "Associated Job Card",
                      value: doc.jobNumber ? (
                        <span>
                          {doc.jobNumber} {doc.jobCardType ? `(${doc.jobCardType})` : ""}
                        </span>
                      ) : (
                        "—"
                      ),
                      highlight: true,
                    },
                  ]
                : []),

              ...(isTransfer || doc.destinationStore
                ? [
                    {
                      label: "Origin Store",
                      value: `${doc.storeCode} (${doc.store})`,
                    },
                    {
                      label: "Destination Store",
                      value: `${doc.destinationStoreCode ?? "—"} (${doc.destinationStore ?? "—"})`,
                      highlight: true,
                    },
                    {
                      label: "Transfer Direction",
                      value: doc.type === "TRANSFER_OUT" ? "OUTGOING (DISPATCH)" : "INCOMING (RECEIPT)",
                    },
                    {
                      label: "Linked Transfer Ref",
                      value: doc.linkedDocNumber || "Direct Transfer",
                    },
                  ]
                : []),

              ...(isReceipt || doc.supplierName || doc.localPurchaseNumber
                ? [
                    { label: "Supplier / Vendor", value: doc.supplierName || "—", highlight: true },
                    { label: "Invoice / PO Ref", value: doc.supplierInvoiceReference || "—" },
                    { label: "Local Purchase Ref", value: doc.localPurchaseNumber || "—" },
                    {
                      label: "Purchase Currency",
                      value: doc.purchaseCurrency || "LKR",
                    },
                  ]
                : []),

              { label: "Created By", value: doc.createdByName || "System" },
              { label: "Posted By", value: doc.postedByName || "—" },
              {
                label: "Posting Timestamp",
                value: doc.postedAt ? new Date(doc.postedAt).toLocaleString("en-GB") : "—",
              },
              { label: "Reason / Category", value: doc.reason || "Standard Operation" },
            ]}
          />
        </ReportSection>

        {/* Line Items Table */}
        <ReportSection title="Stock Movement Items & Quantities">
          {isAdjustment ? (
            /* Specialized Adjustment Table: Before -> Change -> After */
            <ReportTable
              headers={[
                { label: "#", width: "35px" },
                { label: "SKU", width: "110px" },
                { label: "Part Description", width: "auto" },
                { label: "Unit", width: "60px" },
                { label: "Adjustment Qty", align: "right", width: "110px" },
                { label: "Balance After", align: "right", width: "110px" },
                { label: "Line Remark / Discrepancy", width: "180px" },
              ]}
            >
              {doc.lines.map((line, idx) => {
                const deltaNum = Number(line.quantityDelta ?? line.quantity);
                const isPositive = deltaNum > 0;
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "5px 7px", color: "#666" }}>{idx + 1}</td>
                    <td style={{ padding: "5px 7px", fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                      {line.sku}
                    </td>
                    <td style={{ padding: "5px 7px" }}>{line.name}</td>
                    <td style={{ padding: "5px 7px", color: "#555" }}>{line.unit}</td>
                    <td
                      style={{
                        padding: "5px 7px",
                        textAlign: "right",
                        fontWeight: 700,
                        color: isPositive ? "#137333" : "#c5221f",
                      }}
                    >
                      {isPositive ? `+${line.quantity}` : `-${line.quantity}`}
                    </td>
                    <td style={{ padding: "5px 7px", textAlign: "right", fontWeight: 600 }}>
                      {line.balanceAfter != null ? Number(line.balanceAfter).toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "5px 7px", fontSize: "8pt", color: "#666" }}>
                      {line.note || doc.reason || "Physical count correction"}
                    </td>
                  </tr>
                );
              })}
            </ReportTable>
          ) : (
            /* Standard Table for Receipts, Issues, Transfers, Reversals */
            <ReportTable
              headers={[
                { label: "#", width: "35px" },
                { label: "SKU", width: "120px" },
                { label: "Part Description", width: "auto" },
                { label: "Unit", width: "70px" },
                { label: "Quantity", align: "right", width: "90px" },
                ...(hasUnitCosts
                  ? [
                      { label: "Unit Cost (LKR)", align: "right" as const, width: "120px" },
                      { label: "Total Amount (LKR)", align: "right" as const, width: "130px" },
                    ]
                  : []),
                { label: "Line Remarks", width: hasUnitCosts ? "120px" : "200px" },
              ]}
            >
              {doc.lines.map((line, idx) => {
                const qty = Number(line.quantity);
                const cost = line.unitCost != null ? Number(line.unitCost) : null;
                const lineTotal = cost != null ? cost * qty : null;

                return (
                  <tr key={idx} style={{ borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "5px 7px", color: "#666" }}>{idx + 1}</td>
                    <td style={{ padding: "5px 7px", fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                      {line.sku}
                    </td>
                    <td style={{ padding: "5px 7px" }}>{line.name}</td>
                    <td style={{ padding: "5px 7px", color: "#555" }}>{line.unit}</td>
                    <td style={{ padding: "5px 7px", textAlign: "right", fontWeight: 700 }}>
                      {qty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                    </td>
                    {hasUnitCosts ? (
                      <>
                        <td style={{ padding: "5px 7px", textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                          {cost != null
                            ? cost.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td style={{ padding: "5px 7px", textAlign: "right", fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>
                          {lineTotal != null
                            ? lineTotal.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"}
                        </td>
                      </>
                    ) : null}
                    <td style={{ padding: "5px 7px", fontSize: "8pt", color: "#666" }}>
                      {line.note || "—"}
                    </td>
                  </tr>
                );
              })}
            </ReportTable>
          )}

          {/* Table Summary Bar */}
          <ReportSummary
            items={[
              {
                label: "Total Line Items",
                value: doc.lines.length.toString(),
              },
              {
                label: "Total Quantity",
                value: doc.lines
                  .reduce((sum, l) => sum + Number(l.quantity), 0)
                  .toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
              },
              ...(hasUnitCosts
                ? [
                    {
                      label: "Total Value (LKR)",
                      value: `LKR ${totalAmount.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      highlight: true,
                    },
                  ]
                : []),
            ]}
          />
        </ReportSection>

        {/* Specialized Tyre Details Section if tyre events are linked */}
        {doc.tyres && doc.tyres.length > 0 ? (
          <ReportSection title="Tyre Identification & Serial Numbers">
            <ReportTable
              headers={[
                { label: "#", width: "35px" },
                { label: "Tyre Serial Number", width: "160px" },
                { label: "Tyre Model / Size", width: "auto" },
                { label: "Position", width: "120px" },
                { label: "Stage", width: "90px" },
                { label: "Odometer", align: "right", width: "110px" },
                { label: "Tyre Remarks", width: "160px" },
              ]}
            >
              {doc.tyres.map((t, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #e0e0e0" }}>
                  <td style={{ padding: "5px 7px", color: "#666" }}>{idx + 1}</td>
                  <td style={{ padding: "5px 7px", fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>
                    {t.serialNumber}
                  </td>
                  <td style={{ padding: "5px 7px" }}>{t.partName} ({t.sku})</td>
                  <td style={{ padding: "5px 7px", fontWeight: 600 }}>
                    {t.toPosition || t.fromPosition || "In Store"}
                  </td>
                  <td style={{ padding: "5px 7px" }}>
                    <span style={{ fontSize: "8pt", fontWeight: 700, padding: "1px 5px", border: "1px solid #666" }}>
                      {t.toStage || t.fromStage || "ORG"}
                    </span>
                  </td>
                  <td style={{ padding: "5px 7px", textAlign: "right" }}>
                    {t.odometerKm ? `${Number(t.odometerKm).toLocaleString()} km` : "—"}
                  </td>
                  <td style={{ padding: "5px 7px", fontSize: "8pt", color: "#666" }}>
                    {t.notes || "—"}
                  </td>
                </tr>
              ))}
            </ReportTable>
          </ReportSection>
        ) : null}

        {/* Document Remarks / Notes */}
        <ReportNotes
          title="Document Notes & Justification"
          notes={doc.notes || doc.reason}
        />

        {/* Approvals Admin Link on Screen */}
        {isAdmin && (doc.status === "PENDING_APPROVAL" || doc.status === "REJECTED") ? (
          <div className="no-print" style={{ margin: "10px 0" }}>
            <Link to="/approvals?tab=issues" className="button button-secondary">
              Review in Approvals Center
            </Link>
          </div>
        ) : null}

        {/* Dual / Triple Signatures Block */}
        <ReportSignatures
          title="Verification, Custody & Authorization"
          signers={config.signers.map((s, idx) => ({
            title: s.title,
            caption: s.caption,
            name: idx === 0 ? doc.createdByName : idx === 1 ? doc.postedByName : null,
            date: doc.date,
          }))}
        />

        {/* Standard Audit Footer */}
        <ReportFooter
          documentId={doc.number}
          reportName={config.title}
          pageText="Official StoreOPS Inventory Document"
        />
      </ReportLayout>
    </>
  );
}
