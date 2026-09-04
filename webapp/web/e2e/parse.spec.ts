import { test, expect, go as goto } from "./fixtures";

test("parse page runs a CSS step and saves a selector", async ({ adminPage }) => {
  await goto(adminPage, "/parse");
  await expect(adminPage.getByRole("heading", { name: /parse playground/i })).toBeVisible();

  // The default HTML has an <h1>Hello</h1> and the default step is {method:css, selector:h1}.
  // Hit "Run POST /parse" — results panel appears with a Save button.
  await adminPage.getByRole("button", { name: /run post \/parse/i }).click();

  // Wait for the "Results" label to appear (inside the playground).
  await expect(adminPage.getByText(/^results$/i).first()).toBeVisible({ timeout: 10_000 });

  // The Save-to-library flow uses window.prompt; stub it before clicking Save.
  await adminPage.evaluate(() => {
    window.prompt = () => "e2e selector";
  });
  await adminPage.getByRole("button", { name: /save to library/i }).click();

  // Switch to the Library tab and confirm the new selector is listed.
  await adminPage.getByRole("button", { name: /^library$/i }).click();
  await expect(adminPage.getByText("e2e selector")).toBeVisible({ timeout: 10_000 });
});