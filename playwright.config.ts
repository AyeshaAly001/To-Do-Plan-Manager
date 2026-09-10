import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,

  /**
   * 90s per test, 15s per assertion.
   *
   * Not padding for slow code: the Supabase project is in ap-northeast-1 while
   * development happens at UTC+5, so every query is a long round trip and a
   * page that runs several is genuinely slow. The default 30s produced
   * failures that were purely environmental, which is worse than useless —
   * it trains you to ignore red.
   */
  timeout: 90_000,
  expect: { timeout: 15_000 },
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
