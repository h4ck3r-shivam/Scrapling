import { test, expect } from "./fixtures";

test("home renders with 4 status cards and a working New fetch button", async ({ adminPage }) => {
  await expect(adminPage.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  // Status cards: Active jobs / Recent runs / Disk usage / MCP server
  await expect(adminPage.getByText(/active jobs/i)).toBeVisible();
  await expect(adminPage.getByText(/recent runs/i)).toBeVisible();
  await expect(adminPage.getByText(/disk usage/i)).toBeVisible();
  await expect(adminPage.getByText(/mcp server/i)).toBeVisible();

  // The "New fetch" link in the top-right of the dashboard.
  const newFetch = adminPage.getByRole("link", { name: /new fetch/i }).first();
  await expect(newFetch).toBeVisible();
  await newFetch.click();
  await adminPage.waitForURL("**/fetch");
  await expect(adminPage.getByRole("heading", { name: /fetch console/i })).toBeVisible();
});