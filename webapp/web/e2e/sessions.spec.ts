import { test, expect, go as goto } from "./fixtures";

test("sessions page renders with key controls", async ({ adminPage }) => {
  await goto(adminPage, "/sessions");
  await expect(adminPage.getByRole("heading", { name: /^sessions$/i })).toBeVisible();

  // The "Open" button is always visible (top of the Open-session card).
  await expect(adminPage.getByRole("button", { name: /^open$/i })).toBeVisible();

  // The Name input is pre-filled with "sess-1".
  await expect(adminPage.getByPlaceholder(/^sess-1$/)).toBeVisible();

  // The "Live sessions" card title is rendered.
  await expect(adminPage.getByText(/live sessions/i)).toBeVisible();
});