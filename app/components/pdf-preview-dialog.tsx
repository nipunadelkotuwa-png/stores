import { useEffect, useState } from "react";
import type { GeneratedPdfResult } from "~/lib/pdf-export";

interface PdfPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pdfResult: GeneratedPdfResult | null;
  isLoading?: boolean;
  documentTitle?: string;
}

export function PdfPreviewDialog({
  isOpen,
  onClose,
  pdfResult,
  isLoading = false,
  documentTitle = "Document Preview",
}: PdfPreviewDialogProps) {
  const [zoom, setZoom] = useState<number>(100);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 175));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 60));
  const handleResetZoom = () => setZoom(100);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(17, 24, 39, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1000px",
          height: "92vh",
          backgroundColor: "#1e293b",
          borderRadius: "8px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #334155",
        }}
      >
        {/* Modal Toolbar */}
        <div
          style={{
            backgroundColor: "#0f172a",
            color: "#ffffff",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #334155",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {/* Title & Document Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.2rem" }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "9.5pt", letterSpacing: "0.02em" }}>
                {documentTitle}
              </div>
              {pdfResult ? (
                <div style={{ fontSize: "7.5pt", color: "#94a3b8", fontFamily: "var(--font-mono, monospace)" }}>
                  {pdfResult.filename} • {pdfResult.totalPages} page(s) • A4
                </div>
              ) : null}
            </div>
          </div>

          {/* Zoom & View Controls */}
          {pdfResult && !isLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "#1e293b",
                padding: "3px 8px",
                borderRadius: "4px",
                border: "1px solid #334155",
              }}
            >
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 60}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  fontSize: "12pt",
                  cursor: zoom <= 60 ? "not-allowed" : "pointer",
                  padding: "0 6px",
                  lineHeight: 1,
                }}
                title="Zoom Out"
              >
                −
              </button>
              <span
                style={{
                  fontSize: "8.5pt",
                  minWidth: "42px",
                  textAlign: "center",
                  fontFamily: "var(--font-mono, monospace)",
                  color: "#e2e8f0",
                }}
              >
                {zoom}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 175}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  fontSize: "12pt",
                  cursor: zoom >= 175 ? "not-allowed" : "pointer",
                  padding: "0 6px",
                  lineHeight: 1,
                }}
                title="Zoom In"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                style={{
                  background: "#334155",
                  border: "none",
                  color: "#cbd5e1",
                  fontSize: "7.5pt",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  marginLeft: "4px",
                }}
                title="Reset to 100%"
              >
                Reset
              </button>
            </div>
          ) : null}

          {/* Action Buttons: Print, Download, Close */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {pdfResult && !isLoading ? (
              <>
                <button
                  type="button"
                  onClick={pdfResult.print}
                  style={{
                    backgroundColor: "#334155",
                    color: "#ffffff",
                    border: "1px solid #475569",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    fontSize: "8.5pt",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>🖨️</span> Print PDF
                </button>
                <button
                  type="button"
                  onClick={pdfResult.download}
                  style={{
                    backgroundColor: "#166534",
                    color: "#ffffff",
                    border: "1px solid #22c55e",
                    padding: "6px 14px",
                    borderRadius: "4px",
                    fontSize: "8.5pt",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>⬇️</span> Download PDF
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: "#dc2626",
                color: "#ffffff",
                border: "none",
                width: "28px",
                height: "28px",
                borderRadius: "4px",
                fontSize: "12pt",
                fontWeight: 700,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                marginLeft: "6px",
              }}
              title="Close Preview (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        {/* Modal Body / Viewer */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#334155",
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "20px",
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#ffffff",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  border: "4px solid rgba(255, 255, 255, 0.2)",
                  borderTopColor: "#22c55e",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `,
                }}
              />
              <div style={{ fontWeight: 600, fontSize: "10.5pt" }}>
                Rendering High-Resolution PDF...
              </div>
              <div style={{ fontSize: "8.5pt", color: "#94a3b8" }}>
                Generating vector pages and multi-page layout via PDF engine
              </div>
            </div>
          ) : pdfResult ? (
            <div
              style={{
                width: `${zoom}%`,
                maxWidth: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                transition: "width 0.15s ease-out",
              }}
            >
              <iframe
                src={`${pdfResult.blobUrl}#toolbar=0&navpanes=0`}
                title="PDF Preview"
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "750px",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                }}
              />
            </div>
          ) : (
            <div style={{ color: "#cbd5e1", marginTop: "40px" }}>
              No document available for preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
