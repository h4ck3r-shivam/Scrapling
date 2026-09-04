import { test, expect, go as goto } from "./fixtures";

test("job detail page shows the 4 tabs (Results/Live/Exports/Logs)", async ({ adminPage, request }) => {
  // Seed a job via the API so we have something to open.
  const create = await request.post("/api/jobs", {
    data: {
      name: "e2e detail",
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
  const { id } = (await create.json()) as { id: number };

  await goto(adminPage, `/jobs/${id}`);
  await expect(adminPage.getByRole("heading", { name: new RegExp(`job #${id}`) })).toBeVisible();

  // All 4 tabs.
  await expect(adminPage.getByRole("button", { name: /results/i }).first()).toBeVisible();
  await expect(adminPage.getByRole("button", { name: /live ws/i }).first()).toBeVisible();
  await expect(adminPage.getByRole("button", { name: /^exports$/i }).first()).toBeVisible();
  await expect(adminPage.getByRole("button", { name: /^logs$/i }).first()).toBeVisible();
});