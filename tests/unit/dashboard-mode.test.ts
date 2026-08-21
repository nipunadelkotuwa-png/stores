import { describe, expect, it } from "vitest";
import {
  parseDashboardMode,
  resolveDashboardMode,
  toggleDashboardMode,
} from "../../app/lib/dashboard-mode";

describe("dashboard mode", () => {
  it("parses only valid modes", () => {
    expect(parseDashboardMode("pos")).toBe("pos");
    expect(parseDashboardMode("classic")).toBe("classic");
    expect(parseDashboardMode("other")).toBeNull();
  });

  it("defaults operators to POS and admins to classic", () => {
    expect(resolveDashboardMode(null, "OPERATOR")).toBe("pos");
    expect(resolveDashboardMode(undefined, "ADMIN")).toBe("classic");
    expect(resolveDashboardMode("classic", "OPERATOR")).toBe("classic");
    expect(resolveDashboardMode("pos", "ADMIN")).toBe("pos");
  });

  it("toggles between modes", () => {
    expect(toggleDashboardMode("pos")).toBe("classic");
    expect(toggleDashboardMode("classic")).toBe("pos");
  });
});
