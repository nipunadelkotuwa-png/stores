export const REPORT_PERIODS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
  "this_year",
  "custom",
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  this_month: "This Month",
  last_month: "Last Month",
  this_year: "This Year",
  custom: "Custom Range",
};

function zonedYmd(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDaysYmd(ymd: string, days: number, timeZone: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days, 12));
  return zonedYmd(utc, timeZone);
}

function startOfMonth(ymd: string) {
  return `${ymd.slice(0, 7)}-01`;
}

function endOfMonth(ymd: string, timeZone: string) {
  const [year, month] = ymd.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1, 12));
  const lastDay = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  return zonedYmd(lastDay, timeZone);
}

export function resolveReportPeriod(
  searchParams: URLSearchParams,
  timeZone: string,
  defaults?: { period?: ReportPeriod },
): {
  period: ReportPeriod;
  start?: string;
  end?: string;
} {
  const raw = searchParams.get("period");
  const period = (REPORT_PERIODS as readonly string[]).includes(raw ?? "")
    ? (raw as ReportPeriod)
    : (defaults?.period ?? "this_month");

  const today = zonedYmd(new Date(), timeZone);

  if (period === "custom") {
    const start = searchParams.get("start") || undefined;
    const end = searchParams.get("end") || undefined;
    if (!start && !end) {
      // Avoid unbounded reports when custom is selected with blank dates.
      return resolveReportPeriod(
        new URLSearchParams({ period: "this_month" }),
        timeZone,
      );
    }
    return {
      period,
      start,
      end,
    };
  }

  if (period === "today") {
    return { period, start: today, end: today };
  }
  if (period === "yesterday") {
    const yesterday = addDaysYmd(today, -1, timeZone);
    return { period, start: yesterday, end: yesterday };
  }
  if (period === "last_7_days") {
    return { period, start: addDaysYmd(today, -6, timeZone), end: today };
  }
  if (period === "last_30_days") {
    return { period, start: addDaysYmd(today, -29, timeZone), end: today };
  }
  if (period === "this_month") {
    return { period, start: startOfMonth(today), end: today };
  }
  if (period === "last_month") {
    const lastMonthAnchor = addDaysYmd(startOfMonth(today), -1, timeZone);
    return {
      period,
      start: startOfMonth(lastMonthAnchor),
      end: endOfMonth(lastMonthAnchor, timeZone),
    };
  }
  // this_year
  return { period, start: `${today.slice(0, 4)}-01-01`, end: today };
}
