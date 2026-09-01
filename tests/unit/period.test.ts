import { describe, expect, it } from "vitest";
import { parsePeriodDays, periodBounds } from "~/features/dashboard/period";

describe("parsePeriodDays", () => {
  it("returns allowed values", () => {
    expect(parsePeriodDays("7")).toBe(7);
    expect(parsePeriodDays("30")).toBe(30);
    expect(parsePeriodDays("90")).toBe(90);
  });

  it("defaults to 30 for invalid input", () => {
    expect(parsePeriodDays(null)).toBe(30);
    expect(parsePeriodDays("14")).toBe(30);
    expect(parsePeriodDays("abc")).toBe(30);
  });
});

describe("periodBounds", () => {
  it("includes the selected period length", () => {
    const bounds = periodBounds(7);
    expect(bounds.periodDays).toBe(7);
    expect(bounds.periodLabel).toMatch(/–/);
  });
});
