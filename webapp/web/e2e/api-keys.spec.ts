import { test, expect, go as goto } from "./fixtures";

test("admin creates an API key and sees the full key once", async ({ adminPage }) => {
  await goto(adminPage, "/api-keys");
  await expect(adminPage.getByRole("heading", { name: /^api keys$/i })).toBeVisible();

  const name = `e2e-key-${Date.now()}`;
  await adminPage.getByPlaceholder(/^my-service-key$/).fill(name);

  await adminPage.getByRole("button", { name: /^create key$/i }).click();

  // After creation, the "Key created — copy now (shown once)" banner appears
  // and contains a code element with the full scc_… key.
  await expect(adminPage.getByText(/key created — copy now/i)).toBeVisible({ timeout: 10_000 });
  const code = adminPage.locator("code").filter({ hasText: /^scc_/ }).first();
  await expect(code).toBeVisible();
  await expect(code).toContainText(/^scc_/);
});