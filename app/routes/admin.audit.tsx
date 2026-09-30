import { Link } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSignatures,
  ReportSummary,
  ReportTable,
} from "~/components/report-primitives";
import {
  auditReceiptPath,
  formatAuditDetail,
} from "~/features/inventory/audit-display";
import { getAuditEvents } from "~/features/inventory/queries.server";
import { requireAdmin } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/admin.audit";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { events: await getAuditEvents() };
}

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  const currentDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>System Audit Log</h1>
          <p className="muted">
            Immutable system security log of posted inventory actions, adjustments, and reversals.
          </p>
        </div>
        <ReportActions
          filename={`system-audit-log-${currentDate}`}
          documentTitle={`System Audit Log • ${currentDate}`}
          targetSelector="#printable-report"
        />
      </div>

      {/* Official A4 Printable Report Sheet (Landscape for multi-column security log) */}
      <div id="printable-report" className="print-doc-container report-sheet print-landscape">
        <ReportLayout mode="report" orientation="landscape">
          <ReportHeader
            title="System Audit Log & Security Register"
            department="System Governance & Security Compliance"
            date={currentDate}
            subtitle="Immutable Audit Trail of Inventory Transactions, Adjustments & Access"
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Log Date", value: currentDate },
                { label: "Total Logged Events", value: loaderData.events.length, highlight: true },
                { label: "Scope", value: "All Stores & Modules" },
                { label: "Tamper Protection", value: "CRYPTOGRAPHICALLY IMMUTABLE" },
              ]}
            />
          </div>

          {loaderData.events.length === 0 ? (
            <ReportEmptyState message="No audit log events recorded yet." />
          ) : (
            <ReportTable
              headers={[
                { label: "Timestamp", width: "16%" },
                { label: "Event Type", width: "18%" },
                { label: "Actor / User", width: "14%" },
                { label: "Store", width: "10%" },
                { label: "Entity Ref", width: "14%" },
                { label: "Operational Details", width: "28%" },
              ]}
            >
              {loaderData.events.map((event) => {
                const receiptPath = auditReceiptPath(event);
                return (
                  <tr
                    key={event.id}
                    style={{ borderBottom: "1px solid #e5e7eb" }}
                  >
                    <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8pt" }}>
                      {event.occurredAt
                        ? new Date(event.occurredAt).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: "8pt",
                          fontWeight: "700",
                          color: "#111827",
                        }}
                      >
                        {event.eventType.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                      <strong>{event.actor ?? "System"}</strong>
                    </td>
                    <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                      {event.store ?? "—"}
                    </td>
                    <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                      {receiptPath ? (
                        <Link
                          to={receiptPath}
                          style={{ color: "#2563eb", textDecoration: "none", fontWeight: "600" }}
                        >
                          View Document
                        </Link>
                      ) : (
                        <span style={{ color: "#6b7280" }}>{event.entityType}</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        verticalAlign: "top",
                        fontSize: "8pt",
                        color: "#374151",
                        wordBreak: "break-word",
                      }}
                    >
                      {formatAuditDetail(event.metadata)}
                    </td>
                  </tr>
                );
              })}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Total Security Trail Records", value: loaderData.events.length, highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "System Administrator", description: "Audit Certified" },
                { role: "Chief Internal Auditor", description: "Security Verified" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="System Audit Log & Security Register"
            documentId={`AUDIT-SEC-${currentDate}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
