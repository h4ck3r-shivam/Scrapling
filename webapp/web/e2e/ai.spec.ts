import { test, expect, go as goto } from "./fixtures";

test("ai page fetches example.com and shows a markdown preview", async ({ adminPage }) => {
  await goto(adminPage, "/ai");
  await expect(adminPage.getByRole("heading", { name: /ai helpers/i })).toBeVisible();

  // URL is pre-filled with https://example.com. Click the Fetch+markdown button.
  await adminPage.getByRole("button", { name: /fetch \+ markdown/i }).click();

  // The page renders a monaco editor with the markdown content. The parent
  // card title "SiteToMarkdown preview" should still be visible, and the
  // underlying <pre>/.monaco-editor should contain SOMETHING (not the
  // default empty placeholder "No markdown returned").
  await expect(adminPage.getByText(/sitetoMarkdown preview/i)).toBeVisible();

  // Wait for the editor to populate — the .monaco-editor renders inside a div.
  await adminPage.waitForFunction(
    () => {
      const editors = document.querySelectorAll(".monaco-editor");
      for (const el of editors) {
        const txt = (el.textContent ?? "").trim();
        if (txt.length > 20) return true;
      }
      return false;
    },
    { timeout: 30_000 },
  );
});