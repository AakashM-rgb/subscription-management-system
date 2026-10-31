import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running frontend + backend.
 *   E2E_BASE_URL       frontend URL (default http://localhost:3000)
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD   an existing admin account (never hard-coded)
 *   E2E_ALLOW_WRITES=1 also run flows that create records (signup, quote → invoice → payment).
 *                      Only enable against a disposable database.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL || undefined } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.E2E_CHANNEL || undefined }, grep: /@responsive/ },
  ],
});
