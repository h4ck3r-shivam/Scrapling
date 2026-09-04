import { test, expect, go as goto } from "./fixtures";

test("runs page renders and the job_id filter works", async ({ adminPage, request }) => {
  // Create one job so we have a known id to filter by.
  const create = await request.post("/api/jobs", {
    data: {
      name: "e2e runs filter",
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

  await goto(adminPage, "/runs");
  await expect(adminPage.getByRole("heading", { name: /runs — global/i })).toBeVisible();

  // Filter by the created job id.
  const filterInput = adminPage.getByPlaceholder(/e\.g\. 1 \(empty = all\)/i);
  await filterInput.fill(String(id));
  await adminPage.getByRole("button", { name: /^apply$/i }).click();

  // The "Filtered by job_id=…" indicator should appear (Runs.tsx renders it when hasJobFilter is true).
  await expect(adminPage.getByText(new RegExp(`filtered by job_id=${id}`))).toBeVisible();
});