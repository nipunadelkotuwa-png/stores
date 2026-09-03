import { describe, expect, it } from "vitest";
import { resolveReportPeriod } from "../../app/features/reports/period";

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

  it("falls back from empty custom to this month", () => {
    const params = new URLSearchParams({ period: "custom" });
    const range = resolveReportPeriod(params, "Asia/Colombo");
    expect(range.period).toBe("this_month");
    expect(range.start).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
