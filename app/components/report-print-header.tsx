import type { ReactNode } from "react";
import {
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
} from "./report-primitives";

interface ReportPrintHeaderProps {
  title: string;
  subtitle?: string;
  department?: string;
  storeName?: string;
  metadata?: Array<{ label: string; value: ReactNode }>;
}
export function ReportPrintHeader({
  title,
  subtitle,
  department,
  storeName,
  metadata,
}: ReportPrintHeaderProps): ReactNode {
  return (
    <>
      <ReportHeader
        title={title}
        subtitle={subtitle}
        department={department}
        storeName={storeName}
      />
      {metadata?.length ? (
        <ReportInfoGrid items={metadata} columns={3} />
      ) : null}
    </>
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
  pageText,
}: ReportPrintFooterProps): ReactNode {
  return (
    <ReportFooter
      reportName={reportName}
      documentId={documentId}
      pageText={pageText ?? "Official Operational Report"}
    />
  );
}
