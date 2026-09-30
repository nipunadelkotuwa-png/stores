import { useState } from "react";
import {
  generatePdfFromElement,
  type GeneratedPdfResult,
} from "~/lib/pdf-export";
import { PdfPreviewDialog } from "./pdf-preview-dialog";

interface ReportActionsProps {
  filename?: string;
  documentTitle?: string;
  targetSelector?: string;
  orientation?: "portrait" | "landscape";
  showPrint?: boolean;
  showPreview?: boolean;
  showDownload?: boolean;
  className?: string;
}

export function ReportActions({
  filename = "document",
  documentTitle = "StoreOPS Document",
  targetSelector = ".print-doc-container, .receipt-print-wrapper, .receipt-panel, .print-panel, table",
  orientation = "portrait",
  showPrint = true,
  showPreview = true,
  showDownload = true,
  className = "heading-actions no-print",
}: ReportActionsProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [pdfResult, setPdfResult] = useState<GeneratedPdfResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "preview" | "download" | null
  >(null);

  const getTargetElement = (): HTMLElement | null => {
    // Look for dedicated print container first
    const selectors = targetSelector.split(",").map((s) => s.trim());
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el instanceof HTMLElement) {
        return el;
      }
    }
    return null;
  };

  const handleGeneratePdf = async (forAction: "preview" | "download") => {
    const el = getTargetElement();
    if (!el) {
      alert("Unable to locate printable document content on this page.");
      return;
    }

    try {
      setIsGenerating(true);
      setActiveAction(forAction);

      if (forAction === "preview") {
        setIsPreviewOpen(true);
      }

      const result = await generatePdfFromElement(el, {
        filename,
        orientation:
          el.matches(".print-landscape") || el.querySelector(".print-landscape")
            ? "landscape"
            : orientation,
        scale: 2,
      });

      setPdfResult(result);

      if (forAction === "download") {
        result.download();
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Falling back to browser print.");
      if (forAction === "download") {
        window.print();
      }
    } finally {
      setIsGenerating(false);
      setActiveAction(null);
    }
  };

  return (
    <>
      <div
        className={`${className} report-actions`}
        style={{ display: "flex", gap: "8px", alignItems: "center" }}
      >
        {showPrint ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.print()}
            title="Open standard browser print dialog"
          >
            Print
          </button>
        ) : null}

        {showPreview ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={isGenerating}
            onClick={() => handleGeneratePdf("preview")}
            title="Preview document in PDF viewer with zoom and page controls"
          >
            {isGenerating && activeAction === "preview"
              ? "Rendering..."
              : "PDF Preview"}
          </button>
        ) : null}

        {showDownload ? (
          <button
            type="button"
            className="button button-primary"
            disabled={isGenerating}
            onClick={() => handleGeneratePdf("download")}
            title="Download true A4 PDF file"
          >
            {isGenerating && activeAction === "download"
              ? "Generating..."
              : "Download PDF"}
          </button>
        ) : null}
      </div>

      <PdfPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfResult={pdfResult}
        isLoading={isGenerating}
        documentTitle={documentTitle}
      />
    </>
  );
}
