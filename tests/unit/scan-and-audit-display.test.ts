import { describe, expect, it } from "vitest";
import {
  auditReceiptPath,
  formatAuditDetail,
} from "../../app/features/inventory/audit-display";
import { movementFiltersFromSearch } from "../../app/features/inventory/movement-filters";
import { matchesScan } from "../../app/features/inventory/scan";

describe("matchesScan", () => {
  const part = { sku: "OIL-FILTER-01", barcode: "8901234567890" };

  it("matches SKU case-insensitively", () => {
    expect(matchesScan(part, "oil-filter-01")).toBe(true);
  });

  it("matches barcode case-insensitively", () => {
    expect(matchesScan(part, "8901234567890")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(matchesScan(part, "  OIL-FILTER-01  ")).toBe(true);
  });

  it("does not match a different SKU or empty input", () => {
    expect(matchesScan(part, "BRAKE-PAD-F")).toBe(false);
    expect(matchesScan(part, "   ")).toBe(false);
  });

  it("does not treat a null barcode as a match", () => {
    expect(matchesScan({ sku: "ALT-BELT-01", barcode: null }, "null")).toBe(
      false,
    );
  });
});

describe("formatAuditDetail", () => {
  it("prefers a notification message", () => {
    expect(formatAuditDetail({ message: "Low stock: CMB — filter" })).toBe(
      "Low stock: CMB — filter",
    );
  });

  it("shows purchase to receipt mapping", () => {
    expect(
      formatAuditDetail({
        purchaseNumber: "LPO-20260813-AB",
        receiptNumber: "SIN-CMB-2026-1",
      }),
    ).toBe("LPO-20260813-AB → SIN-CMB-2026-1");
  });

  it("includes the reversed document number", () => {
    expect(
      formatAuditDetail({
        documentNumber: "REV-CMB-2026-1",
        reverses: "ISS-CMB-2026-4",
      }),
    ).toBe("REV-CMB-2026-1 reverses ISS-CMB-2026-4");
  });

  it("falls back to a posted document number", () => {
    expect(formatAuditDetail({ documentNumber: "SIN-CMB-2026-1" })).toBe(
      "SIN-CMB-2026-1",
    );
  });
});

describe("auditReceiptPath", () => {
  it("links stock documents to the receipt page", () => {
    expect(
      auditReceiptPath({
        entityType: "stock_document",
        entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toBe("/receipts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("does not invent a receipt path for other entities", () => {
    expect(
      auditReceiptPath({ entityType: "part", entityId: "part-1" }),
    ).toBeNull();
  });
});

describe("movementFiltersFromSearch", () => {
  it("reads posted and purchase query params", () => {
    expect(
      movementFiltersFromSearch(new URLSearchParams("posted=SIN-CMB-2026-1")),
    ).toEqual({
      documentNumber: "SIN-CMB-2026-1",
      purchaseNumber: undefined,
    });
    expect(
      movementFiltersFromSearch(
        new URLSearchParams("purchase=LPO-20260813-AB"),
      ),
    ).toEqual({
      documentNumber: undefined,
      purchaseNumber: "LPO-20260813-AB",
    });
  });

  it("trims blank values to undefined", () => {
    expect(
      movementFiltersFromSearch(new URLSearchParams("posted=%20&purchase=")),
    ).toEqual({
      documentNumber: undefined,
      purchaseNumber: undefined,
    });
  });
});
