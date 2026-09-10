import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // A test that only passes on a retry is a flaky test; surface that locally.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Phase 0 covers the design system; the multi-user flows in Phase 1+ need
    // more browsers, and mobile once the responsive views land in Phase 3.
  ],

  webServer: {
    // Built output, not `dev`: the dev server's compile-on-first-request makes
    // the first navigation slow enough to trip timeouts.
    command: "npm run build && npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
