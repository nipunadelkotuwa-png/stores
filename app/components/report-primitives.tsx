import type { ReactNode } from "react";

// ==========================================
// 1. REPORT LAYOUT CONTAINER
// ==========================================
interface ReportLayoutProps {
  children: ReactNode;
  mode?: "document" | "report";
  orientation?: "portrait" | "landscape";
  className?: string;
}

export function ReportLayout({
  children,
  mode = "document",
  orientation = "portrait",
  className = "",
}: ReportLayoutProps) {
  return (
    <div
      className={`print-doc-container print-mode-${mode} print-${orientation} ${className}`}
      style={{
        width: "100%",
        maxWidth: "100%",
        margin: "0 auto",
        color: "#111111",
        backgroundColor: "#ffffff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

// ==========================================
// 2. REPORT STATUS BADGE
// ==========================================
interface ReportStatusBadgeProps {
  status: string;
  variant?: "default" | "success" | "warning" | "danger" | "audit";
}

export function ReportStatusBadge({
  status,
  variant = "default",
}: ReportStatusBadgeProps) {
  let bg = "#f1f3f5";
  let border = "#111111";
  let color = "#111111";

  if (variant === "success" || status === "CLOSED" || status === "POSTED" || status === "APPROVED") {
    bg = "#e6f4ea";
    border = "#137333";
    color = "#137333";
  } else if (variant === "warning" || status === "PENDING_APPROVAL" || status === "OPEN") {
    bg = "#fef7e0";
    border = "#b06000";
    color = "#b06000";
  } else if (variant === "danger" || status === "REJECTED" || status === "CANCELLED") {
    bg = "#fce8e6";
    border = "#c5221f";
    color = "#c5221f";
  } else if (variant === "audit" || status === "REVERSED" || status === "ADJUSTMENT") {
    bg = "#f3e8fd";
    border = "#7627bb";
    color = "#7627bb";
  }

  const label = status.replaceAll("_", " ").toUpperCase();

  return (
    <span
      className="report-status-badge"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontWeight: "700",
        fontSize: "8.5pt",
        letterSpacing: "0.05em",
        border: `1.5px solid ${border}`,
        backgroundColor: bg,
        color: color,
        borderRadius: "3px",
        textTransform: "uppercase",
        verticalAlign: "middle",
      }}
    >
      {label}
    </span>
  );
}

// ==========================================
// 3. TWO-COLUMN REPORT HEADER
// ==========================================
interface ReportHeaderProps {
  department?: string;
  storeName?: string;
  title: string;
  documentNumber?: string;
  date?: string;
  status?: string;
  statusVariant?: "default" | "success" | "warning" | "danger" | "audit";
  subtitle?: string;
}

export function ReportHeader({
  department = "Central Stores & Workshop Management",
  storeName,
  title,
  documentNumber,
  date,
  status,
  statusVariant,
  subtitle,
}: ReportHeaderProps) {
  const displayDate =
    date ||
    new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div
      className="print-header-bar"
      style={{
        borderBottom: "2.5px solid #111111",
        paddingBottom: "10px",
        marginBottom: "14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "16px",
      }}
    >
      {/* Left side: Company branding & Department */}
      <div style={{ flex: "1 1 auto" }}>
        <div
          style={{
            fontSize: "13.5pt",
            fontWeight: "900",
            letterSpacing: "0.04em",
            color: "#111111",
            textTransform: "uppercase",
            lineHeight: 1.15,
          }}
        >
          DS GUNASEKARA GROUP
        </div>
        <div
          style={{
            fontSize: "9pt",
            fontWeight: "700",
            color: "#444444",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginTop: "3px",
          }}
        >
          {department}
        </div>
        {storeName ? (
          <div
            style={{
              fontSize: "8.5pt",
              color: "#555555",
              marginTop: "2px",
            }}
          >
            Store / Location: <strong>{storeName}</strong>
          </div>
        ) : null}
        {subtitle ? (
          <div
            style={{
              fontSize: "8.5pt",
              color: "#666666",
              marginTop: "2px",
              fontStyle: "italic",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {/* Right side: Report Title, Document Number, Date, Status */}
      <div
        style={{
          textAlign: "right",
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            fontSize: "15pt",
            fontWeight: "900",
            color: "#111111",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            lineHeight: 1.15,
          }}
        >
          {title}
        </div>

        {documentNumber ? (
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11.5pt",
              fontWeight: "700",
              color: "#111111",
              marginTop: "3px",
              letterSpacing: "0.02em",
            }}
          >
            {documentNumber}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "4px",
            fontSize: "8.5pt",
            color: "#444444",
          }}
        >
          <span>{displayDate}</span>
          {status ? (
            <ReportStatusBadge status={status} variant={statusVariant} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. REPORT SECTION
// ==========================================
interface ReportSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
  noMargin?: boolean;
  headerRight?: ReactNode;
}

export function ReportSection({
  title,
  children,
  className = "",
  noMargin = false,
  headerRight,
}: ReportSectionProps) {
  return (
    <div
      className={`print-section-box ${className}`}
      style={{
        border: "1.5px solid #111111",
        marginBottom: noMargin ? "0" : "12px",
        breakInside: "avoid",
        pageBreakInside: "avoid",
        backgroundColor: "#ffffff",
      }}
    >
      {title ? (
        <div
          className="print-section-title"
          style={{
            backgroundColor: "#f1f3f5",
            borderBottom: "1.5px solid #111111",
            padding: "4px 8px",
            fontWeight: "700",
            fontSize: "9pt",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "#111111",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{title}</span>
          {headerRight ? <div>{headerRight}</div> : null}
        </div>
      ) : null}
      <div
        className="print-section-body"
        style={{
          padding: "8px 10px",
          fontSize: "9.5pt",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ==========================================
// 5. REPORT INFO GRID (2, 3, or 4 columns)
// ==========================================
interface ReportInfoItemProps {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}

export function ReportInfoItem({
  label,
  value,
  highlight = false,
}: ReportInfoItemProps) {
  return (
    <div>
      <div
        style={{
          fontSize: "7.5pt",
          fontWeight: "700",
          color: "#666666",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "1px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "9.5pt",
          fontWeight: highlight ? "700" : "600",
          color: highlight ? "#000000" : "#111111",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

interface ReportInfoGridProps {
  columns?: 2 | 3 | 4;
  items: Array<ReportInfoItemProps>;
  style?: React.CSSProperties;
}

export function ReportInfoGrid({
  columns = 4,
  items,
  style = {},
}: ReportInfoGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "10px 14px",
        ...style,
      }}
    >
      {items.map((item, idx) => (
        <ReportInfoItem
          key={idx}
          label={item.label}
          value={item.value}
          highlight={item.highlight}
        />
      ))}
    </div>
  );
}

// ==========================================
// 6. REPORT TABLE
// ==========================================
interface TableHeaderItem {
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
}

interface ReportTableProps {
  headers: Array<TableHeaderItem>;
  children: ReactNode;
  className?: string;
}

export function ReportTable({
  headers,
  children,
  className = "",
}: ReportTableProps) {
  return (
    <table
      className={`print-table ${className}`}
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "9pt",
      }}
    >
      <thead style={{ display: "table-header-group" }}>
        <tr>
          {headers.map((h, i) => (
            <th
              key={i}
              style={{
                backgroundColor: "#f1f3f5",
                borderTop: "1.5px solid #111111",
                borderBottom: "1.5px solid #111111",
                padding: "5px 7px",
                textAlign: h.align || "left",
                fontWeight: "700",
                fontSize: "8.5pt",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "#111111",
                width: h.width,
              }}
            >
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

// ==========================================
// 7. REPORT SUMMARY / TOTALS ROW
// ==========================================
interface ReportSummaryProps {
  items: Array<{
    label: string;
    value: ReactNode;
    isCurrency?: boolean;
    highlight?: boolean;
  }>;
}

export function ReportSummary({ items }: ReportSummaryProps) {
  return (
    <div
      style={{
        padding: "6px 10px",
        backgroundColor: "#f8f9fa",
        borderTop: "1.5px solid #111111",
        display: "flex",
        justifyContent: "flex-end",
        gap: "20px",
        fontSize: "9pt",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {items.map((item, idx) => (
        <div key={idx} style={{ textAlign: "right" }}>
          <span style={{ color: "#666666", fontWeight: "600" }}>
            {item.label}:{" "}
          </span>
          <strong
            style={{
              fontSize: item.highlight ? "10pt" : "9pt",
              color: "#111111",
            }}
          >
            {item.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 8. COMPACT EMPTY STATE (Other Activity)
// ==========================================
interface ReportEmptyStateProps {
  items?: Array<{
    label: string;
    message?: string;
  }>;
  message?: string;
  title?: string;
}

export function ReportEmptyState({
  items,
  message,
  title = "Other Workshop Activity",
}: ReportEmptyStateProps) {
  if (message) {
    return (
      <div
        style={{
          padding: "16px 12px",
          textAlign: "center",
          color: "#4b5563",
          fontSize: "9pt",
          fontStyle: "italic",
          backgroundColor: "#f9fafb",
          border: "1px dashed #d1d5db",
          borderRadius: "4px",
          marginBottom: "12px",
        }}
      >
        {message}
      </div>
    );
  }

  const list = items || [];
  return (
    <div
      className="print-section-box"
      style={{
        border: "1.5px solid #111111",
        marginBottom: "12px",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      <div
        className="print-section-title"
        style={{
          backgroundColor: "#f1f3f5",
          borderBottom: "1.5px solid #111111",
          padding: "3px 8px",
          fontWeight: "700",
          fontSize: "8.5pt",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#333333",
        }}
      >
        {title}
      </div>
      <div
        style={{
          padding: "6px 10px",
          fontSize: "8.5pt",
          display: "flex",
          gap: "24px",
          color: "#555555",
        }}
      >
        {list.map((it, idx) => (
          <div key={idx}>
            <strong style={{ color: "#333333" }}>{it.label}: </strong>
            <span style={{ fontStyle: "italic" }}>
              {it.message || "No activity recorded"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 9. REPORT NOTES / REMARKS
// ==========================================
interface ReportNotesProps {
  title?: string;
  notes?: string | null;
}

export function ReportNotes({
  title = "Remarks / Notes",
  notes,
}: ReportNotesProps) {
  if (!notes) return null;

  return (
    <div
      className="print-section-box"
      style={{
        border: "1.5px solid #111111",
        marginBottom: "12px",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      <div
        className="print-section-title"
        style={{
          backgroundColor: "#f1f3f5",
          borderBottom: "1.5px solid #111111",
          padding: "3px 8px",
          fontWeight: "700",
          fontSize: "8.5pt",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#333333",
        }}
      >
        {title}
      </div>
      <div
        style={{
          padding: "6px 10px",
          fontSize: "9pt",
          color: "#222222",
          lineHeight: "1.35",
        }}
      >
        {notes}
      </div>
    </div>
  );
}

// ==========================================
// 10. REPORT SIGNATURES (2 or 3 columns)
// ==========================================
interface SignerItem {
  title?: string;
  role?: string;
  name?: string | null;
  date?: string;
  caption?: string;
  description?: string;
}

interface ReportSignaturesProps {
  signers?: Array<SignerItem>;
  signatures?: Array<SignerItem>;
  variant?: "two-column" | "three-column";
  title?: string;
}

export function ReportSignatures({
  signers,
  signatures,
  variant = "two-column",
  title = "Verification & Authorization",
}: ReportSignaturesProps) {
  const defaultTwo: Array<SignerItem> = [
    { title: "Issued / Prepared By", caption: "Storekeeper / Author" },
    { title: "Authorized / Received By", caption: "Supervisor / Manager" },
  ];

  const defaultThree: Array<SignerItem> = [
    { title: "Mechanic / Technician", caption: "Work Completed" },
    { title: "Storekeeper", caption: "Parts Issued Verified" },
    { title: "Workshop Supervisor", caption: "Final Approval" },
  ];

  const list =
    signatures || signers || (variant === "three-column" ? defaultThree : defaultTwo);
  const colCount = list.length;

  return (
    <div
      className="print-section-box"
      style={{
        border: "1.5px solid #111111",
        marginTop: "14px",
        marginBottom: "10px",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      <div
        className="print-section-title"
        style={{
          backgroundColor: "#f1f3f5",
          borderBottom: "1.5px solid #111111",
          padding: "3px 8px",
          fontWeight: "700",
          fontSize: "8.5pt",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#333333",
        }}
      >
        {title}
      </div>
      <div
        style={{
          padding: "12px 14px 6px 14px",
          display: "grid",
          gridTemplateColumns: `repeat(${colCount}, 1fr)`,
          gap: "20px",
        }}
      >
        {list.map((s, idx) => (
          <div key={idx}>
            <div
              style={{
                fontWeight: "700",
                fontSize: "9pt",
                color: "#111111",
                marginBottom: "28px",
              }}
            >
              {s.title || s.role || "Officer"}
            </div>
            <div
              style={{
                borderTop: "1.5px solid #111111",
                paddingTop: "3px",
              }}
            >
              <div style={{ fontSize: "8.5pt", color: "#222222" }}>
                Name: <strong>{s.name || "____________________"}</strong>
              </div>
              <div style={{ fontSize: "8.5pt", color: "#333333", marginTop: "2px" }}>
                Date: {s.date || "____________________"}
              </div>
              {s.caption || s.description ? (
                <div
                  style={{
                    fontSize: "7.5pt",
                    color: "#666666",
                    marginTop: "3px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {s.caption || s.description}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 11. AUDIT FOOTER
// ==========================================
interface ReportFooterProps {
  documentId?: string;
  reportName?: string;
  printedAt?: string;
  pageText?: string;
}

export function ReportFooter({
  documentId,
  reportName,
  printedAt,
  pageText,
}: ReportFooterProps) {
  const printed =
    printedAt ||
    new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className="print-footer-bar"
      style={{
        borderTop: "1px solid #777777",
        marginTop: "14px",
        paddingTop: "4px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "8pt",
        color: "#555555",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div>StoreOPS • DS Gunasekara Group</div>
      <div>
        {reportName || ""}
        {documentId ? ` • Ref: ${documentId}` : ""}
      </div>
      <div>
        Printed: {printed}
        {pageText ? ` • ${pageText}` : ""}
      </div>
    </div>
  );
}
