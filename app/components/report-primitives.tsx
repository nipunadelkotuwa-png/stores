import type { CSSProperties, ReactNode } from "react";

type StatusVariant = "default" | "success" | "warning" | "danger" | "audit";
interface ReportLayoutProps {
  children: ReactNode;
  mode?: "document" | "report";
  orientation?: "portrait" | "landscape";
  className?: string;
}
export function ReportLayout({
  children,
  mode,
  orientation,
  className,
}: ReportLayoutProps): ReactNode {
  return (
    <div
      className={`print-doc-container print-mode-${mode ?? "document"} print-${orientation ?? "portrait"} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
interface ReportStatusBadgeProps {
  status: string;
  variant?: StatusVariant;
}
export function ReportStatusBadge({
  status,
  variant,
}: ReportStatusBadgeProps): ReactNode {
  const statusVariants: Record<string, StatusVariant> = {
    CLOSED: "success",
    POSTED: "success",
    APPROVED: "success",
    PENDING_APPROVAL: "warning",
    OPEN: "warning",
    REJECTED: "danger",
    CANCELLED: "danger",
    REVERSED: "audit",
    ADJUSTMENT: "audit",
  };
  return (
    <span
      className={`report-status-badge report-status-${variant ?? statusVariants[status] ?? "default"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
interface ReportHeaderProps {
  department?: string;
  storeName?: string;
  title: string;
  documentNumber?: string;
  date?: string;
  status?: string;
  statusVariant?: StatusVariant;
  subtitle?: string;
}
export function ReportHeader({
  department,
  storeName,
  title,
  documentNumber,
  date,
  status,
  statusVariant,
  subtitle,
}: ReportHeaderProps): ReactNode {
  const displayDate: string =
    date ??
    new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  return (
    <header className="print-header-bar">
      <div className="report-brand-row">
        <span className="report-brand">DS Gunasekara Group</span>
        <span className="report-department">
          {department ?? "Central Stores & Workshop Management"}
        </span>
      </div>
      <div className="report-title-row">
        <div>
          <h2 className="report-title">{title}</h2>
          {subtitle ? <p className="report-subtitle">{subtitle}</p> : null}
          {storeName ? (
            <p className="report-subtitle">
              Store / Location: <strong>{storeName}</strong>
            </p>
          ) : null}
        </div>
        <div className="report-reference">
          {documentNumber ? (
            <strong className="report-document-number">{documentNumber}</strong>
          ) : null}
          <span>{displayDate}</span>
          {status ? (
            <ReportStatusBadge status={status} variant={statusVariant} />
          ) : null}
        </div>
      </div>
    </header>
  );
}
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
  className,
  noMargin,
  headerRight,
}: ReportSectionProps): ReactNode {
  return (
    <section
      className={`print-section-box ${noMargin ? "report-section-flush" : ""} ${className ?? ""}`}
    >
      {title ? (
        <div className="print-section-title">
          <span>{title}</span>
          {headerRight}
        </div>
      ) : null}
      <div className="print-section-body">{children}</div>
    </section>
  );
}
interface ReportInfoItemProps {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}
export function ReportInfoItem({
  label,
  value,
  highlight,
}: ReportInfoItemProps): ReactNode {
  return (
    <div
      className={`report-info-item ${highlight ? "report-info-highlight" : ""}`}
    >
      <div className="report-field-label">{label}</div>
      <div className="report-field-value">{value ?? "—"}</div>
    </div>
  );
}
interface ReportInfoGridProps {
  columns?: 2 | 3 | 4;
  items: Array<ReportInfoItemProps>;
  style?: CSSProperties;
}
export function ReportInfoGrid({
  columns,
  items,
  style,
}: ReportInfoGridProps): ReactNode {
  return (
    <div
      className={`report-info-grid report-columns-${columns ?? 4}`}
      style={style}
    >
      {items.map((item, index) => (
        <ReportInfoItem key={index} {...item} />
      ))}
    </div>
  );
}
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
  className,
}: ReportTableProps): ReactNode {
  return (
    <div
      className="report-table-scroll"
      role="region"
      aria-label="Report data"
      tabIndex={0}
    >
      <table className={`print-table ${className ?? ""}`}>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                style={{
                  textAlign: header.align ?? "left",
                  width: header.width,
                }}
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
interface ReportSummaryProps {
  items: Array<{
    label: string;
    value: ReactNode;
    isCurrency?: boolean;
    highlight?: boolean;
  }>;
}
export function ReportSummary({ items }: ReportSummaryProps): ReactNode {
  return (
    <div className="report-summary">
      {items.map((item, index) => (
        <div
          key={index}
          className={item.highlight ? "report-summary-highlight" : ""}
        >
          <span className="report-field-label">{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
interface ReportEmptyStateProps {
  items?: Array<{ label: string; message?: string }>;
  message?: string;
  title?: string;
}
export function ReportEmptyState({
  items,
  message,
  title,
}: ReportEmptyStateProps): ReactNode {
  if (message)
    return (
      <div className="report-empty">
        <strong>No records to display</strong>
        <p>{message}</p>
      </div>
    );
  return (
    <ReportSection title={title ?? "Other Workshop Activity"}>
      <div className="report-activity">
        {items?.map((item, index) => (
          <div key={index}>
            <strong>{item.label}</strong>
            <p>{item.message ?? "No activity recorded"}</p>
          </div>
        ))}
      </div>
    </ReportSection>
  );
}
interface ReportNotesProps {
  title?: string;
  notes?: string | null;
}
export function ReportNotes({ title, notes }: ReportNotesProps): ReactNode {
  return notes ? (
    <ReportSection title={title ?? "Remarks / Notes"}>
      <p className="report-notes">{notes}</p>
    </ReportSection>
  ) : null;
}
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
  variant,
  title,
}: ReportSignaturesProps): ReactNode {
  const standardSigners: SignerItem[] =
    variant === "three-column"
      ? [
          { title: "Mechanic / Technician", caption: "Work Completed" },
          { title: "Storekeeper", caption: "Parts Issued Verified" },
          { title: "Workshop Supervisor", caption: "Final Approval" },
        ]
      : [
          { title: "Issued / Prepared By", caption: "Storekeeper / Author" },
          {
            title: "Authorized / Received By",
            caption: "Supervisor / Manager",
          },
        ];
  const officers: SignerItem[] = signatures ?? signers ?? standardSigners;
  return (
    <section className="report-signatures">
      <div className="print-section-title">
        {title ?? "Verification & Authorization"}
      </div>
      <div
        className="report-signature-grid"
        style={{
          gridTemplateColumns: `repeat(${officers.length}, minmax(0, 1fr))`,
        }}
      >
        {officers.map((officer, index) => (
          <div className="report-signature" key={index}>
            <strong>{officer.title ?? officer.role ?? "Officer"}</strong>
            <div className="report-signature-line">Signature</div>
            <p>
              Name: <strong>{officer.name ?? "____________________"}</strong>
            </p>
            <p>Date: {officer.date ?? "____________________"}</p>
            {officer.caption || officer.description ? (
              <span className="report-field-label">
                {officer.caption ?? officer.description}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
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
}: ReportFooterProps): ReactNode {
  const printed: string =
    printedAt ??
    new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <footer className="print-footer-bar">
      <div>
        <strong>StoreOPS</strong>
        <span>
          {reportName}
          {documentId ? ` · Ref: ${documentId}` : ""}
        </span>
      </div>
      <div>
        <span>Printed {printed}</span>
        {pageText ? <span>{pageText}</span> : null}
      </div>
    </footer>
  );
}
