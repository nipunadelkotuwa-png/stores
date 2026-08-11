import { describe, expect, it } from "vitest";
import { postStockSchema } from "../../app/features/inventory/schemas";

describe("postStockSchema", () => {
  it("accepts a valid stock command", () => {
    const result = postStockSchema.safeParse({
      storeId: "11111111-1111-4111-8111-111111111111",
      businessDate: "2026-07-21",
      idempotencyKey: "0123456789abcdef",
      lines: [
        { partId: "22222222-2222-4222-8222-222222222222", quantity: "2.5" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero and negative quantities", () => {
    const result = postStockSchema.safeParse({
      storeId: "11111111-1111-4111-8111-111111111111",
      businessDate: "2026-07-21",
      idempotencyKey: "0123456789abcdef",
      lines: [{ partId: "22222222-2222-4222-8222-222222222222", quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });
});
