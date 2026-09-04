import { test as base, expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin@example.com";
export const ADMIN_PASSWORD = "e2e-admin-pw";
export const BASE_URL = "http://localhost:5173";

/**
 * Helper: navigate to a path on the SPA. Works around a Playwright 1.62.1
 * quirk where `page.goto("/login")` doesn't always compose with the configured
 * baseURL — so we construct the absolute URL explicitly.
 */
export async function go(page: Page, path: string): Promise<void> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  await page.goto(url);
}

async function loginAsAdmin(page: Page): Promise<void> {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(
    resp.ok(),
    `admin login failed: ${resp.status()} ${await resp.text()}`,
  ).toBe(true);
  const body = (await resp.json()) as {
    access_token: string;
    user: { email: string; role: string };
  };
  expect(body.access_token).toBeTruthy();
  expect(body.user.email).toBe(ADMIN_EMAIL);

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("scc_token", token);
      localStorage.setItem("scc_user", JSON.stringify(user));
    },
    { token: body.access_token, user: body.user },
  );
}

export const test = base.extend<{ adminPage: Page; goto: typeof go }>({
  adminPage: async ({ page }, use) => {
    await loginAsAdmin(page);
    await go(page, "/");
    await page.waitForLoadState("networkidle");
    await use(page);
  },
  goto: async ({}, use) => {
    await use(go);
  },
});

export { expect };