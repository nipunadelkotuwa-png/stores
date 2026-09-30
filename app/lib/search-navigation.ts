import type { DashboardMode } from "~/lib/dashboard-mode";

function looksLikeBarcode(query: string): boolean {
  return /^\d{6,}$/.test(query) || /^[A-Z0-9-]{8,}$/i.test(query);
}

function looksLikeDocumentNumber(query: string): boolean {
  return /^(INV|SIN|ISS|TRF|ADJ)-/i.test(query);
}

function looksLikeJobNumber(query: string): boolean {
  return /^(JOB|JC)[-\s]/i.test(query);
}

export function resolveSearchNavigation(
  mode: DashboardMode,
  rawQuery: string,
): string {
  const query = rawQuery.trim();
  const encoded = encodeURIComponent(query);

  if (!query) {
    return mode === "pos" ? "/pos/issue" : "/";
  }

  if (looksLikeJobNumber(query)) {
    return `/job-cards?q=${encoded}`;
  }

  if (looksLikeDocumentNumber(query)) {
    return `/reports/movements?posted=${encoded}`;
  }

  if (looksLikeBarcode(query)) {
    return `/scan?q=${encoded}`;
  }

  if (mode === "pos") {
    return `/pos/issue?q=${encoded}`;
  }

  return `/parts?q=${encoded}`;
}
