import { test, expect, go as goto } from "./fixtures";

test("admin can create a user", async ({ adminPage }) => {
  await goto(adminPage, "/users");
  await expect(adminPage.getByRole("heading", { name: /^users$/i })).toBeVisible();

  // Use a unique email per run so we don't hit the 409 conflict.
  const email = `e2e-user-${Date.now()}@example.com`;

  await adminPage.getByPlaceholder(/^newuser@example\.com$/).fill(email);
  await adminPage.getByPlaceholder(/^•+$/).fill("e2e-user-pw");
  // Click "Create user".
  await adminPage.getByRole("button", { name: /^create user$/i }).click();

  // Success banner: "User created — id <n>"
  await expect(adminPage.getByText(/user created — id \d+/i)).toBeVisible({ timeout: 10_000 });

  // The new row should appear in the table.
  await expect(adminPage.getByText(email)).toBeVisible();
});