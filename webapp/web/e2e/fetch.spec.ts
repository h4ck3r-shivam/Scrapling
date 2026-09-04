import { test, expect, go as goto } from "./fixtures";

test("fetch page returns 200 for example.com", async ({ adminPage }) => {
  await goto(adminPage, "/fetch");
  await expect(adminPage.getByRole("heading", { name: /fetch console/i })).toBeVisible();

  // The URL input is pre-filled with https://example.com already.
  // Just click Fetch and wait for the response card.
  await adminPage.getByRole("button", { name: /^fetch$/i }).click();

  // The response card title contains "{status} {reason} · {url}".
  // Wait for a 200 status to appear in the response header.
  await expect(adminPage.getByText(/^200\b/).first()).toBeVisible({ timeout: 20_000 });
});