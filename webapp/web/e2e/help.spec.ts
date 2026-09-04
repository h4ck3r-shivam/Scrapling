import { test, expect, go as goto } from "./fixtures";

test("help page renders all 6 sections", async ({ adminPage }) => {
  await goto(adminPage, "/help");
  await expect(adminPage.getByRole("heading", { name: /quick start guide/i })).toBeVisible();

  const headings = [
    /what is scraping/i,
    /how to make a fetch/i,
    /how to make a crawl/i,
    /how to interpret results/i,
    /how to export/i,
    /ai integrations/i,
  ];
  for (const re of headings) {
    await expect(adminPage.getByRole("heading", { name: re })).toBeVisible();
  }
});