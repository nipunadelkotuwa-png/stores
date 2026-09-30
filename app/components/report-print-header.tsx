import type { ReactNode } from "react";

interface ReportPrintHeaderProps {
  title: string;
  subtitle?: string;
  department?: string;
  storeName?: string;
  metadata?: Array<{
    label: string;
    value: ReactNode;
  }>;
}

export function ReportPrintHeader({
  title,
  subtitle,
  department = "Central Stores & Fleet Management",
  storeName,
  metadata = [],
}: ReportPrintHeaderProps) {
  const printedDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
      <div>
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
          <div style={{ fontSize: "8.5pt", color: "#555555", marginTop: "2px" }}>
            Store / Location: <strong>{storeName}</strong>
          </div>
        ) : null}
        {subtitle ? (
          <div style={{ fontSize: "8.5pt", color: "#666666", marginTop: "2px", fontStyle: "italic" }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          textAlign: "right",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            fontSize: "14pt",
            fontWeight: "900",
            color: "#111111",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            lineHeight: 1.15,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto",
            gap: "2px 10px",
            textAlign: "right",
            fontSize: "8.5pt",
            marginTop: "4px",
            color: "#333333",
          }}
        >
          {metadata.map((item, idx) => (
            <div key={idx} style={{ display: "contents" }}>
              <span style={{ color: "#666666" }}>{item.label}:</span>
              <strong>{item.value || "—"}</strong>
            </div>
          ))}
          <div style={{ display: "contents" }}>
            <span style={{ color: "#666666" }}>Printed:</span>
            <span>{printedDate}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReportPrintFooterProps {
  reportName: string;
  documentId?: string;
  pageText?: string;
}

export function ReportPrintFooter({
  reportName,
  documentId,
  pageText = "Official Operational Report",
}: ReportPrintFooterProps) {
  const printedDate = new Date().toLocaleDateString("en-GB", {
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
        marginTop: "16px",
        paddingTop: "4px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "8pt",
        color: "#555555",
      }}
    >
      <div>StoreOPS • DS Gunasekara Group</div>
      <div>
        {reportName}
        {documentId ? ` • Ref: ${documentId}` : ""}
      </div>
      <div>Printed: {printedDate} • {pageText}</div>
    </div>
  );
}
