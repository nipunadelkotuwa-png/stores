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
import { getUnusualIssues } from "~/features/inventory/queries.server";
import {
  UNUSUAL_ISSUE_THRESHOLD,
  UNUSUAL_ISSUE_WINDOW_DAYS,
} from "~/features/workshop/constants";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.unusual-issues";

export async function loader({ request }: Route.LoaderArgs) {
  return {
    rows: await getUnusualIssues(
      await requirePermission(request, "reports.read"),
    ),
    threshold: UNUSUAL_ISSUE_THRESHOLD,
    windowDays: UNUSUAL_ISSUE_WINDOW_DAYS,
  };
}

export default function UnusualIssuesPage({
  loaderData,
}: Route.ComponentProps) {
  const totalQty = loaderData.rows.reduce(
    (sum, r) => sum + (Number(r.totalQty) || 0),
    0,
  );
  const currentDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Unusual / Repetitive Issues</h1>
          <p className="muted">
            Parts issued to the same bus {loaderData.threshold}+ times in the last {loaderData.windowDays} days.
          </p>
        </div>
        <ReportActions
          filename={`unusual-issues-${currentDate}`}
          documentTitle={`Unusual Repetitive Issues Audit • ${currentDate}`}
          targetSelector="#printable-report"
        />
      </div>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Unusual / Repetitive Issues Audit"
            department="Maintenance Quality Control & Internal Audit"
            date={currentDate}
            subtitle={`Auditing repetitive part consumption: ${loaderData.threshold}+ issues within rolling ${loaderData.windowDays} days`}
          />

          <div style={{ marginBottom: "14px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Trigger Threshold", value: `${loaderData.threshold}+ issues`, highlight: true },
                { label: "Rolling Window", value: `Last ${loaderData.windowDays} days` },
                { label: "Flagged Combinations", value: loaderData.rows.length, highlight: loaderData.rows.length > 0 },
                { label: "Total Flagged Units", value: totalQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          {loaderData.rows.length === 0 ? (
            <ReportEmptyState message="No unusual or repetitive spare part issues detected in this window. System compliant." />
          ) : (
            <ReportTable
              headers={[
                { label: "SKU / Code", width: "18%" },
                { label: "Part Description", width: "32%" },
                { label: "Bus / Fleet", width: "16%" },
                { label: "Issue Count", align: "right", width: "11%" },
                { label: "Total Qty", align: "right", width: "11%" },
                { label: "Last Issued", width: "12%" },
              ]}
            >
              {loaderData.rows.map((row) => (
                <tr
                  key={`${row.partId}-${row.busId}`}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: "#fffbeb",
                  }}
                >
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <span className="mono" style={{ fontWeight: "700", color: "#111827" }}>
                      {row.sku}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <div style={{ fontSize: "9pt", fontWeight: "600", color: "#111827" }}>
                      {row.part}
                    </div>
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    <strong style={{ fontSize: "9pt", color: "#92400e" }}>
                      {row.fleetNumber}
                    </strong>
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "700",
                      fontSize: "9pt",
                      color: "#b45309",
                    }}
                  >
                    {row.issueCount}x
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: "700",
                      fontSize: "9pt",
                      color: "#111827",
                    }}
                  >
                    {row.totalQty}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "top", fontSize: "8.5pt", color: "#4b5563" }}>
                    {row.lastDate}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          <div style={{ marginTop: "12px" }}>
            <ReportSummary
              items={[
                { label: "Total Audit Flags", value: loaderData.rows.length },
                { label: "Aggregated Units Under Review", value: totalQty.toFixed(2), highlight: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Workshop Foreman", description: "Technical Inspection" },
                { role: "Internal Auditor", description: "Fraud Prevention Audit" },
              ]}
            />
          </div>

          <ReportFooter
            reportName="Unusual / Repetitive Issues Audit"
            documentId={`AUDIT-UNUSUAL-${currentDate}`}
          />
        </ReportLayout>
      </div>
    </>
  );
}
