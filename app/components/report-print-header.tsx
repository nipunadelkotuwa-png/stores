import type { ReactNode } from "react";

interface ReportPrintHeaderProps {
  title: string;
  subtitle?: string;
  metadata?: Array<{
    label: string;
    value: ReactNode;
  }>;
}

export function ReportPrintHeader({
  title,
  subtitle = "Central Workshop & Fleet Inventory Management",
  metadata = [],
}: ReportPrintHeaderProps) {
  const printedDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="print-header-bar print-only" style={{ marginBottom: "14px" }}>
      <div>
        <div
          style={{
            fontSize: "14pt",
            fontWeight: "800",
            letterSpacing: "0.04em",
            color: "#111111",
          }}
        >
          DS GUNASEKARA GROUP
        </div>
        <div
          style={{
            fontSize: "9pt",
            fontWeight: "700",
            color: "#555555",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginTop: "2px",
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            fontSize: "13pt",
            fontWeight: "700",
            color: "#111111",
            marginTop: "6px",
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          textAlign: "right",
          fontSize: "9pt",
          color: "#333333",
          lineHeight: "1.4",
        }}
      >
        {metadata.map((item, idx) => (
          <div key={idx}>
            <span style={{ color: "#666666" }}>{item.label}: </span>
            <strong>{item.value || "—"}</strong>
          </div>
        ))}
        <div>
          <span style={{ color: "#666666" }}>Generated: </span>
          <strong>{printedDate}</strong>
        </div>
      </div>
    </div>
  );
}

interface ReportPrintFooterProps {
  reportName: string;
}

export function ReportPrintFooter({ reportName }: ReportPrintFooterProps) {
  const printedDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="print-footer-bar print-only">
      <div>StoreOPS • DS Gunasekara Group</div>
      <div>{reportName}</div>
      <div>Printed: {printedDate}</div>
    </div>
  );
}
