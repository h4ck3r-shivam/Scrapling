import { test, expect, go as goto } from "./fixtures";

test("system page shows status cards (version, deps, disk, MCP)", async ({ adminPage }) => {
  await goto(adminPage, "/system");
  await expect(adminPage.getByRole("heading", { name: /^system$/i })).toBeVisible();

  // The four primary cards on System.tsx.
  await expect(adminPage.getByText(/info — get \/api\/system\/info/i)).toBeVisible();
  await expect(adminPage.getByText(/disk — get \/api\/system\/disk/i)).toBeVisible();
  await expect(adminPage.getByText(/install browsers/i)).toBeVisible();
  await expect(adminPage.getByText(/mcp — post/i)).toBeVisible();

  // The JSON blobs from /system/info and /system/disk render inside <pre> tags.
  // Wait for at least one to populate (the home dashboard depends on these too).
  await expect(adminPage.locator("pre").first()).not.toBeEmpty({ timeout: 15_000 });
});