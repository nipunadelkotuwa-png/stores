import { describe, expect, it } from "vitest";
import { normalizeBarcode } from "../../app/features/master-data/barcode";

describe("normalizeBarcode", () => {
  it("stores empty and whitespace as null", () => {
    expect(normalizeBarcode("")).toBeNull();
    expect(normalizeBarcode("   ")).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
    expect(normalizeBarcode(undefined)).toBeNull();
  });

  it("trims real barcodes", () => {
    expect(normalizeBarcode("  8901234567890  ")).toBe("8901234567890");
  });
});
