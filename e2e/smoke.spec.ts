import { expect, test } from "@playwright/test";

const adminEmail = "admin@dsgunasekara.local";
const temporaryPassword = "ChangeMe123!";
const smokePassword = "Smoke-Test-Password-2026!";

test("Admin can sign in and view the inventory dashboard", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Store Management" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/login-page.png",
    fullPage: true,
  });
  await page.getByLabel("Email address").fill(adminEmail);
  await page.getByLabel("Password").fill(temporaryPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/change-password$/);

  if (/\/change-password$/.test(page.url())) {
    await page.getByLabel("New password").fill(smokePassword);
    await page.getByLabel("Confirm password").fill(smokePassword);
    await page.getByRole("button", { name: "Update password" }).click();
  }

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Inventory dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Active parts")).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-page.png",
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);
});
