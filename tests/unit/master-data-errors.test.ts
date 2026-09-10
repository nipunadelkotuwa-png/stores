import { describe, expect, it } from "vitest";
import { BusLifecycleError } from "../../app/features/master-data/bus-lifecycle";
import { masterDataActionError } from "../../app/features/master-data/errors";

describe("masterDataActionError", () => {
  it("maps unique violations", () => {
    expect(
      masterDataActionError(
        Object.assign(new Error("duplicate"), { code: "23505" }),
        "Already exists.",
        "Fallback",
      ),
    ).toBe("Already exists.");
  });

  it("maps barcode unique violations separately from SKU", () => {
    expect(
      masterDataActionError(
        Object.assign(new Error("duplicate barcode"), {
          code: "23505",
          constraint: "parts_barcode_unique",
        }),
        "A part with that SKU already exists.",
        "Fallback",
      ),
    ).toBe("A part with that barcode already exists.");
    expect(
      masterDataActionError(
        Object.assign(new Error("duplicate sku"), {
          code: "23505",
          constraint: "parts_sku_unique",
        }),
        "Already exists.",
        "Fallback",
      ),
    ).toBe("A part with that SKU already exists.");
  });

  it("hides Failed query messages", () => {
    expect(
      masterDataActionError(
        new Error("Failed query: insert into parts"),
        "Already exists.",
        "Unable to add part.",
      ),
    ).toBe("Unable to add part.");
  });

  it("surfaces bus lifecycle errors", () => {
    expect(
      masterDataActionError(
        new BusLifecycleError("This bus has 1 unresolved job card."),
        "Already exists.",
        "Fallback",
      ),
    ).toBe("This bus has 1 unresolved job card.");
  });
});
