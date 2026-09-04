import { test, expect, go as goto } from "./fixtures";

test("job new page renders all 4 tabs and saves a Basic job", async ({ adminPage }) => {
  await goto(adminPage, "/jobs/new");
  await expect(adminPage.getByRole("heading", { name: /new job/i })).toBeVisible();

  // All 4 tab triggers must be present.
  await expect(adminPage.getByRole("button", { name: /^basic$/i })).toBeVisible();
  await expect(adminPage.getByRole("button", { name: /^advanced$/i })).toBeVisible();
  await expect(adminPage.getByRole("button", { name: /^template$/i })).toBeVisible();
  await expect(adminPage.getByRole("button", { name: /export & json/i })).toBeVisible();

  // Basic tab is default — fill the Name field.
  const nameInput = adminPage.getByPlaceholder(/daily product crawl/i);
  await expect(nameInput).toBeVisible();
  await nameInput.fill("e2e smoke job");

  // Jump to the Export & JSON tab and hit "Create job".
  await adminPage.getByRole("button", { name: /export & json/i }).click();
  await adminPage.getByRole("button", { name: /create job/i }).click();

  // Should navigate to /jobs/{id} detail on success.
  await adminPage.waitForURL(/\/jobs\/\d+/, { timeout: 15_000 });
  await expect(adminPage.getByRole("heading", { name: /job #\d+/i })).toBeVisible();
});