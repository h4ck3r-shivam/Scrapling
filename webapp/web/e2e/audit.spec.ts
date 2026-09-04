import { test, expect, go as goto } from "./fixtures";

test("admin audit page shows rows from prior actions", async ({ adminPage, request }) => {
  // Generate at least one audit entry by creating a job.
  const create = await request.post("/api/jobs", {
    data: {
      name: "e2e audit seed",
      kind: "crawl",
      engine: "static",
      template: "custom",
      spec: {
        template: "custom",
        engine: "static",
        settings: { start_urls: ["https://example.com"], allowed_domains: [], concurrent_requests: 1 },
        template_config: { fields: [], follow_links: false, max_pages: 1 },
        export_formats: ["json"],
      },
    },
  });
  expect(create.ok()).toBe(true);

  await goto(adminPage, "/audit");
  await expect(adminPage.getByRole("heading", { name: /audit log/i })).toBeVisible();

  // The job.create audit entry should be visible in the table.
  await expect(adminPage.getByText("job.create").first()).toBeVisible({ timeout: 10_000 });
  // The login audit entry from the auth bootstrap should also be visible.
  await expect(adminPage.getByText("login").first()).toBeVisible();
});