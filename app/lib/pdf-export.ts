/**
 * PDF generation and export utility for StoreOPS (DS Gunasekara Group)
 * Uses client-side jsPDF and html2canvas with dynamic imports for SSR safety.
 */

export interface PdfExportOptions {
  filename?: string;
  orientation?: "portrait" | "landscape";
  unit?: "mm" | "pt" | "px";
  format?: "a4" | [number, number];
  scale?: number;
}

export interface GeneratedPdfResult {
  pdf: any;
  blob: Blob;
  blobUrl: string;
  filename: string;
  totalPages: number;
  download: () => void;
  print: () => void;
}

/**
 * Generate a high-quality A4 PDF from a DOM element.
 * Supports multi-page splitting, high-DPI canvas capture, and returns
 * a downloadable file and blob URL for interactive previewing.
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: PdfExportOptions = {},
): Promise<GeneratedPdfResult> {
  if (typeof window === "undefined") {
    throw new Error("PDF generation is only supported in client-side browser environments.");
  }

  const {
    filename = "document.pdf",
    orientation = "portrait",
    scale = 2, // High DPI for crisp vector-like text and barcodes
  } = options;

  // Dynamically import jsPDF and html2canvas for safe SSR bundling
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const html2canvas = html2canvasModule.default || html2canvasModule;

  // A4 dimensions in mm
  const a4WidthMm = orientation === "landscape" ? 297 : 210;
  const a4HeightMm = orientation === "landscape" ? 210 : 297;

  // Ensure element styles are fully captured
  const canvas = await html2canvas(element, {
    scale: scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
    onclone: (clonedDoc: Document) => {
      // Force all elements inside clone to be visible as if printing
      const clonedEl = clonedDoc.querySelector(".print-doc-container, .receipt-print-wrapper, .receipt-panel, .print-panel, table") as HTMLElement;
      if (clonedEl) {
        clonedEl.style.display = "block";
        clonedEl.style.visibility = "visible";
      }
      // Ensure all no-print elements in clonedDoc are hidden
      const noPrintElements = clonedDoc.querySelectorAll(".no-print");
      noPrintElements.forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
      // Ensure all print-only elements in clonedDoc are visible
      const printOnlyElements = clonedDoc.querySelectorAll(".print-only, .only-print");
      printOnlyElements.forEach((el) => {
        (el as HTMLElement).style.display = "block";
      });
    },
  });

  const pdf = new jsPDF({
    orientation: orientation,
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  const canvasWidthPx = canvas.width;
  const canvasHeightPx = canvas.height;

  // Calculate the height of the image in mm when fitted to A4 width
  const imgWidthMm = a4WidthMm;
  const imgHeightMm = (canvasHeightPx * a4WidthMm) / canvasWidthPx;

  let totalPages = 1;

  if (imgHeightMm <= a4HeightMm) {
    // Single page document
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidthMm, imgHeightMm, undefined, "FAST");
  } else {
    // Multi-page document: slice the canvas image across pages
    let heightLeftMm = imgHeightMm;
    let positionYMm = 0;

    pdf.addImage(imgData, "JPEG", 0, positionYMm, imgWidthMm, imgHeightMm, undefined, "FAST");
    heightLeftMm -= a4HeightMm;

    while (heightLeftMm > 0) {
      positionYMm -= a4HeightMm;
      pdf.addPage();
      totalPages += 1;
      pdf.addImage(imgData, "JPEG", 0, positionYMm, imgWidthMm, imgHeightMm, undefined, "FAST");
      heightLeftMm -= a4HeightMm;
    }
  }

  const blob = pdf.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const cleanFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

  const download = () => {
    pdf.save(cleanFilename);
  };

  const print = () => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
  };

  return {
    pdf,
    blob,
    blobUrl,
    filename: cleanFilename,
    totalPages,
    download,
    print,
  };
}
