import { test, expect, go as goto } from "./fixtures";

test("proxies page can create and delete a proxy", async ({ adminPage }) => {
  await goto(adminPage, "/proxies");
  await expect(adminPage.getByRole("heading", { name: /proxies & groups/i })).toBeVisible();

  // Use a unique label so reruns against the same DB don't 409.
  const label = `e2e-proxy-${Date.now()}`;

  // Fill the Label input and click "Add proxy".
  await adminPage.getByPlaceholder(/^us-east-1$/).fill(label);
  await adminPage.getByRole("button", { name: /add proxy/i }).click();

  // The new row should appear in the table.
  await expect(adminPage.getByText(label)).toBeVisible({ timeout: 10_000 });

  // Delete the row — Proxies.tsx uses window.confirm which we accept automatically.
  adminPage.on("dialog", (dialog) => void dialog.accept());
  const row = adminPage.locator("tr", { hasText: label }).first();
  await row.getByRole("button", { name: /^delete$/i }).click();

  await expect(adminPage.getByText(label)).toHaveCount(0, { timeout: 10_000 });
});