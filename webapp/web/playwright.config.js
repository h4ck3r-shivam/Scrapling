import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        baseURL: "http://localhost:5173",
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command:
        "rm -f /tmp/scc-e2e.db /tmp/scc-e2e.db-wal /tmp/scc-e2e.db-shm /tmp/scc-e2e-first-run && " +
        "SCC_DB_PATH=/tmp/scc-e2e.db " +
        "SCC_ADMIN_PASSWORD=e2e-admin-pw " +
        "SCC_ADMIN_EMAIL=admin@example.com " +
        "SCC_CORS_ORIGINS=http://127.0.0.1:5173 " +
        "SCC_SECRET_KEY=ci-test-secret " +
        "../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --app-dir .",
      cwd: "../api",
      url: "http://127.0.0.1:8001/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});