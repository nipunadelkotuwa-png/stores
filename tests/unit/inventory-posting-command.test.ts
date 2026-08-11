import { describe, expect, it } from "vitest";
import { prepareStockCommand } from "../../app/features/inventory/command";
import { postStockSchema } from "../../app/features/inventory/schemas";

describe("postStockSchema direction", () => {
  it("accepts decrease direction for adjustments", () => {
    const result = postStockSchema.safeParse({
      storeId: "11111111-1111-4111-8111-111111111111",
      businessDate: "2026-07-21",
      direction: "decrease",
      reason: "Stock count write-down",
      idempotencyKey: "0123456789abcdef",
      lines: [
        { partId: "22222222-2222-4222-8222-222222222222", quantity: "1.5" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("prepareStockCommand", () => {
  it("requires a reason for adjustments", () => {
    expect(() =>
      prepareStockCommand("ADJUSTMENT", {
        storeId: "11111111-1111-4111-8111-111111111111",
        businessDate: "2026-07-21",
        idempotencyKey: "0123456789abcdef",
        lines: [
          { partId: "22222222-2222-4222-8222-222222222222", quantity: "1" },
        ],
      }),
    ).toThrow(/reason/i);
  });

  it("defaults direction to increase", () => {
    const command = prepareStockCommand("ADJUSTMENT", {
      storeId: "11111111-1111-4111-8111-111111111111",
      businessDate: "2026-07-21",
      reason: "Found stock",
      idempotencyKey: "0123456789abcdef",
      lines: [
        { partId: "22222222-2222-4222-8222-222222222222", quantity: "2" },
      ],
    });
    expect(command.direction).toBe("increase");
  });

  it("requires a bus for bus issues", () => {
    expect(() =>
      prepareStockCommand("BUS_ISSUE", {
        storeId: "11111111-1111-4111-8111-111111111111",
        businessDate: "2026-07-21",
        idempotencyKey: "0123456789abcdef",
        lines: [
          { partId: "22222222-2222-4222-8222-222222222222", quantity: "1" },
        ],
      }),
    ).toThrow(/bus/i);
  });
});
