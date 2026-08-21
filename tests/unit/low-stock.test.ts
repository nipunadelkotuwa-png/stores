import { describe, expect, it } from "vitest";
import { isBelowReorder } from "../../app/features/inventory/low-stock";

describe("isBelowReorder", () => {
  it("does not alert when reorder is 0", () => {
    expect(isBelowReorder(0, 0)).toBe(false);
    expect(isBelowReorder(12, 0)).toBe(false);
    expect(isBelowReorder(0, null)).toBe(false);
  });

  it("alerts when on-hand is at or below a positive threshold", () => {
    expect(isBelowReorder(1, 1)).toBe(true);
    expect(isBelowReorder(2, 4)).toBe(true);
    expect(isBelowReorder(5, 4)).toBe(false);
  });
});
