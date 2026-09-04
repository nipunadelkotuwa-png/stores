import { describe, expect, it } from "vitest";

import {
  buildNavSections,
  isNavItemActive,
  navItemEnd,
  operationsNavConfig,
} from "~/lib/app-navigation";

describe("isNavItemActive", () => {
  it("matches dashboard only on root path", () => {
    expect(isNavItemActive("/", { to: "/", label: "Dashboard", end: true })).toBe(
      true,
    );
    expect(isNavItemActive("/parts", { to: "/", label: "Dashboard", end: true })).toBe(
      false,
    );
  });

  it("does not match /returns when on /returns/bus", () => {
    const returns = operationsNavConfig.find((item) => item.to === "/returns");
    expect(returns).toBeDefined();
    expect(isNavItemActive("/returns/bus", returns!)).toBe(false);
    expect(isNavItemActive("/returns", returns!)).toBe(true);
  });

  it("highlights purchases on /purchases/new", () => {
    const purchases = operationsNavConfig.find((item) => item.to === "/purchases");
    expect(purchases).toBeDefined();
    expect(isNavItemActive("/purchases/new", purchases!)).toBe(true);
    expect(isNavItemActive("/purchases", purchases!)).toBe(true);
  });

  it("does not match /tyres when on /tyres/dag", () => {
    expect(
      isNavItemActive("/tyres/dag", {
        to: "/tyres",
        label: "Tyres",
        exact: true,
      }),
    ).toBe(false);
  });
});

describe("buildNavSections", () => {
  it("hides admin-only operations from operators", () => {
    const operations = buildNavSections("OPERATOR").find(
      (section) => section.id === "operations",
    );
    const paths = operations?.items.map((item) => item.to) ?? [];
    expect(paths).not.toContain("/returns");
    expect(paths).not.toContain("/tires/conversion");
    expect(paths).toContain("/returns/bus");
  });

  it("shows admin-only operations to administrators", () => {
    const operations = buildNavSections("ADMIN").find(
      (section) => section.id === "operations",
    );
    const paths = operations?.items.map((item) => item.to) ?? [];
    expect(paths).toContain("/returns");
    expect(paths).toContain("/tires/conversion");
  });
});

describe("navItemEnd", () => {
  it("maps exact routes to NavLink end", () => {
    expect(navItemEnd({ to: "/returns", label: "Returns", exact: true })).toBe(
      true,
    );
    expect(navItemEnd({ to: "/purchases", label: "Purchases" })).toBeUndefined();
  });
});
