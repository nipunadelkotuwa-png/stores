import { describe, expect, it } from "vitest";
import {
  resolveReportPeriod,
  zonedDayBounds,
  zonedYmdToUtc,
} from "../../app/features/reports/period";

describe("resolveReportPeriod", () => {
  it("defaults to this month", () => {
    const params = new URLSearchParams();
    const range = resolveReportPeriod(params, "Asia/Colombo");
    expect(range.period).toBe("this_month");
    expect(range.start).toMatch(/^\d{4}-\d{2}-01$/);
    expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("supports last 7 days", () => {
    const params = new URLSearchParams({ period: "last_7_days" });
    const range = resolveReportPeriod(params, "UTC");
    expect(range.period).toBe("last_7_days");
    expect(range.start).toBeTruthy();
    expect(range.end).toBeTruthy();
  });

  it("maps Colombo midnight to the correct UTC instant", () => {
    expect(zonedYmdToUtc("2026-09-05", "Asia/Colombo").toISOString()).toBe(
      "2026-09-04T18:30:00.000Z",
    );
    const today = zonedDayBounds("Asia/Colombo", 0);
    expect(today.end.getTime() - today.start.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("falls back from empty custom to this month", () => {
    const params = new URLSearchParams({ period: "custom" });
    const range = resolveReportPeriod(params, "Asia/Colombo");
    expect(range.period).toBe("this_month");
    expect(range.start).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
