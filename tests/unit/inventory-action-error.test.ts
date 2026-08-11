import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  InsufficientStockError,
  inventoryActionError,
} from "../../app/features/inventory/errors";

describe("inventoryActionError", () => {
  it("hides raw SQL / unique constraint failures", () => {
    expect(
      inventoryActionError(
        new Error(
          'Failed query: insert into "stock_documents" ... duplicate key',
        ),
        "Unable to post receipt",
      ),
    ).toBe("Unable to post receipt");
  });

  it("surfaces insufficient stock clearly", () => {
    expect(
      inventoryActionError(
        new InsufficientStockError("part-1"),
        "Unable to post issue",
      ),
    ).toBe("Insufficient stock. No quantities were changed.");
  });

  it("uses the first Zod issue message", () => {
    const error = new ZodError([
      {
        code: "custom",
        message: "Quantity must be a positive decimal",
        path: ["lines", 0, "quantity"],
      },
    ]);
    expect(inventoryActionError(error, "Unable to post receipt")).toBe(
      "Quantity must be a positive decimal",
    );
  });
});
