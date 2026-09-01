import { describe, expect, it } from "vitest";
import { appLayoutShouldRevalidate } from "~/lib/app-layout-revalidation";

describe("appLayoutShouldRevalidate", () => {
  it("revalidates approval and dashboard-mode actions", () => {
    expect(
      appLayoutShouldRevalidate({
        formAction: "/approvals",
        defaultShouldRevalidate: false,
      }),
    ).toBe(true);
    expect(
      appLayoutShouldRevalidate({
        formAction: "/dashboard-mode",
        defaultShouldRevalidate: false,
      }),
    ).toBe(true);
  });

  it("skips revalidation for notification and POS issue actions", () => {
    expect(
      appLayoutShouldRevalidate({
        formAction: "/notifications",
        defaultShouldRevalidate: true,
      }),
    ).toBe(false);
    expect(
      appLayoutShouldRevalidate({
        formAction: "/pos/issue",
        defaultShouldRevalidate: true,
      }),
    ).toBe(false);
  });

  it("skips revalidation when the URL is unchanged", () => {
    const url = new URL("http://localhost/balances?store=1");
    expect(
      appLayoutShouldRevalidate({
        defaultShouldRevalidate: true,
        currentUrl: url,
        nextUrl: url,
      }),
    ).toBe(false);
  });

  it("revalidates approve/reject intents on other routes", () => {
    expect(
      appLayoutShouldRevalidate({
        formAction: "/receipts/abc/approve",
        defaultShouldRevalidate: false,
      }),
    ).toBe(true);
  });

  it("revalidates dashboard-mode even when redirect URL is unchanged", () => {
    const url = new URL("http://localhost/");
    expect(
      appLayoutShouldRevalidate({
        formAction: "/dashboard-mode",
        defaultShouldRevalidate: false,
        currentUrl: url,
        nextUrl: url,
      }),
    ).toBe(true);
  });
});
