import { test, expect, go as goto } from "./fixtures";

test("jobs list renders the table and the New button works", async ({ adminPage }) => {
  await goto(adminPage, "/jobs");
  await expect(adminPage.getByRole("heading", { name: /^jobs$/i })).toBeVisible();

  // The page renders a Table with header cells: ID, Name, Engine, Template, Status, Actions
  for (const col of ["ID", "Name", "Engine", "Template", "Status", "Actions"]) {
    await expect(adminPage.getByRole("columnheader", { name: col })).toBeVisible();
  }

  // The New Job button lives in the header row, exact text "New Job".
  const newBtn = adminPage.getByRole("button", { name: /^new job$/i });
  await expect(newBtn).toBeVisible();
  await newBtn.click();
  await adminPage.waitForURL("**/jobs/new");
  await expect(adminPage.getByRole("heading", { name: /new job/i })).toBeVisible();
});