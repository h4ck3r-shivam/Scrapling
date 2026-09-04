import { test, expect, go as goto } from "./fixtures";

test("selectors page shows a newly created entry", async ({ adminPage, request }) => {
  // Seed a selector via the API (admin can be the actor).
  const name = `e2e-selector-${Date.now()}`;
  const create = await request.post("/api/selectors", {
    data: {
      name,
      target_url: "https://example.com",
      identifier: "h1",
      selector_spec: { steps: [{ method: "css", selector: "h1" }] },
      auto_save: false,
    },
  });
  expect(create.ok()).toBe(true);

  await goto(adminPage, "/selectors");
  await expect(adminPage.getByRole("heading", { name: /selectors library/i })).toBeVisible();
  await expect(adminPage.getByText(name)).toBeVisible();
});