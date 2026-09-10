import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Reuse the `@/*` alias from tsconfig instead of restating it here.
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // Playwright owns e2e; without this exclusion vitest tries to run those
    // specs and fails on the missing test runner globals.
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    // No globals: tests import describe/it/expect explicitly, so `tsc` resolves
    // them without pulling a global type package into the whole project.
    globals: false,
  },
});
