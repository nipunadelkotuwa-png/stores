import { describe, expect, it } from "vitest";

import { resolveSearchNavigation } from "../../app/lib/search-navigation";

describe("resolveSearchNavigation", () => {
  it("routes empty POS search to issue screen", () => {
    expect(resolveSearchNavigation("pos", "")).toBe("/pos/issue");
  });

  it("routes empty classic search to dashboard", () => {
    expect(resolveSearchNavigation("classic", "")).toBe("/");
  });

  it("routes part queries to POS issue with q param", () => {
    expect(resolveSearchNavigation("pos", "brake pad")).toBe(
      "/pos/issue?q=brake%20pad",
    );
  });

  it("routes job numbers to job cards", () => {
    expect(resolveSearchNavigation("pos", "JOB-2026-001")).toBe(
      "/job-cards?q=JOB-2026-001",
    );
    expect(resolveSearchNavigation("classic", "JC-TR-MAIN-2026-001")).toBe(
      "/job-cards?q=JC-TR-MAIN-2026-001",
    );
    expect(resolveSearchNavigation("pos", "JC-TO-MAIN-2026-001")).toBe(
      "/job-cards?q=JC-TO-MAIN-2026-001",
    );
  });

  it("routes document numbers to movements report", () => {
    expect(resolveSearchNavigation("classic", "INV-CMB-2026-1")).toBe(
      "/reports/movements?posted=INV-CMB-2026-1",
    );
  });

  it("routes barcode-like values to scan", () => {
    expect(resolveSearchNavigation("classic", "1234567890")).toBe(
      "/scan?q=1234567890",
    );
  });

  it("routes classic part search to parts catalogue", () => {
    expect(resolveSearchNavigation("classic", "oil filter")).toBe(
      "/parts?q=oil%20filter",
    );
  });
});
