import { test, expect, go as goto } from "./fixtures";

test("magic page fills the form and creates a job", async ({ adminPage }) => {
  await goto(adminPage, "/magic");
  await expect(adminPage.getByRole("heading", { name: /magic scraper/i })).toBeVisible();

  // Fill the Job name (optional).
  const nameInput = adminPage.getByPlaceholder(/auto: list - example\.com/i);
  await nameInput.fill("e2e magic test job");

  // Fill the start URL (textarea).
  const urlTextarea = adminPage.locator("textarea").first();
  await urlTextarea.fill("https://example.com");

  // Pick the "List" mode card.
  await adminPage.getByRole("button", { name: /^list/i }).click();

  // Submit — Magic navigates to /jobs/{id} on success.
  await adminPage.getByRole("button", { name: /create.*list.*job/i }).click();
  await adminPage.waitForURL(/\/jobs\/\d+/, { timeout: 15_000 });
  await expect(adminPage.getByRole("heading", { name: /job #\d+/i })).toBeVisible();
});