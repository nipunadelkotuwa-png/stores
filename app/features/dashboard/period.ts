const ALLOWED_PERIOD_DAYS = [7, 30, 90] as const;

export type PeriodDays = (typeof ALLOWED_PERIOD_DAYS)[number];

export function parsePeriodDays(value: string | null | undefined): PeriodDays {
  const days = Number(value);
  if (days === 7 || days === 30 || days === 90) return days;
  return 30;
}

export function periodBounds(days: PeriodDays = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const previousEnd = new Date(start);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);

  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

  return {
    periodDays: days,
    periodStart: toDateStr(start),
    periodEnd: toDateStr(end),
    previousStart: toDateStr(previousStart),
    previousEnd: toDateStr(previousEnd),
    periodLabel: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  };
}

export const PERIOD_OPTIONS = ALLOWED_PERIOD_DAYS;
