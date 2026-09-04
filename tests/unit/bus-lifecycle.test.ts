import { describe, expect, it } from "vitest";
import {
  busStatusBadgeClass,
  busStatusLabel,
  busUnavailableForJobCardMessage,
  BusLifecycleError,
  unresolvedJobCardsMessage,
} from "../../app/features/master-data/bus-lifecycle";
import { masterDataActionError } from "../../app/features/master-data/errors";

describe("bus lifecycle copy", () => {
  it("labels and badges sold separately from inactive", () => {
    expect(busStatusLabel("ACTIVE")).toBe("Active");
    expect(busStatusLabel("INACTIVE")).toBe("Inactive");
    expect(busStatusLabel("SOLD")).toBe("Sold");
    expect(busStatusBadgeClass("ACTIVE")).toBe("badge success");
    expect(busStatusBadgeClass("INACTIVE")).toBe("badge");
    expect(busStatusBadgeClass("SOLD")).toBe("badge warning");
  });

  it("names unresolved job cards when blocking a sale", () => {
    expect(unresolvedJobCardsMessage(["JC-MAIN-2026-000001"])).toBe(
      "This bus has 1 unresolved job card (JC-MAIN-2026-000001). Close or cancel them before marking the bus as sold.",
    );
    expect(
      unresolvedJobCardsMessage(["JC-A-2026-000001", "JC-A-2026-000002"]),
    ).toBe(
      "This bus has 2 unresolved job cards (JC-A-2026-000001, JC-A-2026-000002). Close or cancel them before marking the bus as sold.",
    );
  });

  it("rejects sold buses with a distinct job-card error", () => {
    expect(busUnavailableForJobCardMessage("SOLD", false)).toBe(
      "This bus has been sold and cannot be used for job cards.",
    );
    expect(busUnavailableForJobCardMessage("INACTIVE", false)).toBe(
      "Bus is not available",
    );
    expect(busUnavailableForJobCardMessage("ACTIVE", true)).toBeNull();
  });
});

describe("masterDataActionError", () => {
  it("surfaces bus lifecycle errors", () => {
    expect(
      masterDataActionError(
        new BusLifecycleError("This bus has been sold."),
        "Duplicate",
        "Fallback",
      ),
    ).toBe("This bus has been sold.");
  });
});
