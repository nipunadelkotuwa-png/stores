import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { validateReturnableQuantities } from "../../app/features/inventory/returnable";

describe("validateReturnableQuantities", () => {
  it("rejects parts never issued on the job card", () => {
    const error = validateReturnableQuantities(
      new Map([["part-a", { available: new Decimal("2") }]]),
      [{ partId: "part-b", quantity: new Decimal("1") }],
    );
    expect(error).toMatch(/not issued/i);
  });

  it("rejects over-return", () => {
    const error = validateReturnableQuantities(
      new Map([["part-a", { available: new Decimal("2") }]]),
      [{ partId: "part-a", quantity: new Decimal("3") }],
    );
    expect(error).toMatch(/Only 2.000 units/);
  });

  it("allows return within available qty", () => {
    const error = validateReturnableQuantities(
      new Map([["part-a", { available: new Decimal("2") }]]),
      [
        { partId: "part-a", quantity: new Decimal("1") },
        { partId: "part-a", quantity: new Decimal("1") },
      ],
    );
    expect(error).toBeNull();
  });
});
