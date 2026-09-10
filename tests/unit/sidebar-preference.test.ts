import { describe, expect, it } from "vitest";
import { SIDEBAR_COLLAPSED_CLASS } from "../../app/lib/sidebar-preference";

describe("sidebar preference", () => {
  it("uses a dedicated html class for the collapsed rail", () => {
    expect(SIDEBAR_COLLAPSED_CLASS).toBe("sidebar-collapsed");
  });
});
