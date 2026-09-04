import { test, expect, go } from "./fixtures";

test.describe("login page", () => {
  test("bad credentials show a 401 error banner", async ({ page }) => {
    // Land unauthenticated.
    await go(page, "/login");
    await page.getByRole("button", { name: /show password/i }).click();
    await page.locator('input[placeholder="you@example.com"]').fill("admin@example.com");
    await page.locator('input[placeholder="••••••••"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    // Login.tsx renders err in a destructive banner with the API message + hint.
    const banner = page.locator(".bg-destructive\\/10").first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/401|invalid|credentials/i);
  });

  test("good credentials redirect to the dashboard", async ({ page }) => {
    await go(page, "/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.locator('input[placeholder="you@example.com"]').fill("admin@example.com");
    await page.locator('input[placeholder="••••••••"]').fill("e2e-admin-pw");
    await page.locator('input[placeholder="••••••••"]').press("Enter");
    await page.waitForFunction(() => location.pathname === "/" || location.pathname === "", null, { timeout: 15_000 });
    // Dashboard H1 (specific to Home page) — use level=1 to avoid the nav link
    await expect(page.getByRole("heading", { name: /^dashboard$/i, level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});