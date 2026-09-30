/**
 * High-Reliability PDF generation and export utility for StoreOPS (DS Gunasekara Group)
 * Uses client-side jsPDF and html2canvas with dynamic imports for SSR safety.
 */

export interface PdfExportOptions {
  filename?: string;
  orientation?: "portrait" | "landscape";
  scale?: number;
}

export interface GeneratedPdfResult {
  pdf: any;
  blob: Blob;
  blobUrl: string;
  filename: string;
  totalPages: number;
  pageImages: string[];
  download: () => void;
  print: () => void;
}

/**
 * Generate a high-quality A4 PDF from a DOM element.
 * Performs clean multi-page canvas slicing so each page is crisp, with zero clipping errors.
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
    scale = 2, // High DPI for crisp text and barcodes
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

  // Render the target element into a high-DPI canvas
  const canvas = await html2canvas(element, {
    scale: scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    onclone: (clonedDoc: Document) => {
      // Force all print containers inside clone to be visible
      const clonedEls = clonedDoc.querySelectorAll(
        ".print-doc-container, .job-card-sheet, .receipt-print-wrapper, .report-sheet, .receipt-panel, .print-panel",
      );
      clonedEls.forEach((el) => {
        const h = el as HTMLElement;
        h.style.display = "block";
        h.style.visibility = "visible";
      });
      // Hide all no-print controls inside clone
      const noPrintEls = clonedDoc.querySelectorAll(".no-print");
      noPrintEls.forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
    },
  });

  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error("Unable to capture printable content: element was empty or hidden.");
  }

  const pdf = new jsPDF({
    orientation: orientation,
    unit: "mm",
    format: "a4",
    compress: true,
  });

  // Calculate pixel height of one A4 page based on the canvas aspect ratio
  const pageHeightPx = Math.floor((canvas.width * a4HeightMm) / a4WidthMm);
  const totalPages = Math.ceil(canvas.height / pageHeightPx) || 1;
  const pageImages: string[] = [];

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) {
      pdf.addPage();
    }

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pageHeightPx;
    const ctx = pageCanvas.getContext("2d");

    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      const sourceY = i * pageHeightPx;
      const sourceHeight = Math.min(pageHeightPx, canvas.height - sourceY);

      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sourceHeight,
        0,
        0,
        canvas.width,
        sourceHeight,
      );
    }

    const pageDataUrl = pageCanvas.toDataURL("image/jpeg", 0.95);
    pageImages.push(pageDataUrl);

    pdf.addImage(pageDataUrl, "JPEG", 0, 0, a4WidthMm, a4HeightMm, undefined, "FAST");
  }

  const blob = pdf.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const cleanFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

  const download = () => {
    pdf.save(cleanFilename);
  };

  const print = () => {
    const printWindow = window.open(blobUrl);
    if (printWindow) {
      printWindow.focus();
      printWindow.print();
    } else {
      window.print();
    }
  };

  return {
    pdf,
    blob,
    blobUrl,
    filename: cleanFilename,
    totalPages,
    pageImages,
    download,
    print,
  };
}
