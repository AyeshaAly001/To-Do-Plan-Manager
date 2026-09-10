/**
 * Prints the full contrast table and exits non-zero on any failure.
 *
 *   npm run audit:contrast
 *
 * The palette lives in lib/design/palette.ts — this file is only the printer,
 * so the numbers here and the ones the app renders can never drift apart.
 * Run directly by Node (v22.6+ strips types natively); no build step.
 */

import { auditPalette, type ThemeName } from "../lib/design/palette.ts";

const checks = auditPalette();
let failed = 0;

for (const theme of ["light", "dark"] as ThemeName[]) {
  console.log(`\n  ${theme.toUpperCase()}`);
  console.log("  " + "-".repeat(60));

  for (const check of checks.filter((c) => c.theme === theme)) {
    if (!check.pass) failed++;
    const mark = check.pass ? "pass" : "FAIL";
    const ratio = check.ratio.toFixed(2).padStart(5);
    console.log(`  ${mark}  ${ratio}:1  (min ${check.required.toFixed(1)})  ${check.label}`);
  }
}

console.log("");

if (failed > 0) {
  console.error(`  ${failed} contrast failure(s). Adjust the token — do not lower the bar.\n`);
  process.exit(1);
}

console.log(`  All ${checks.length} pairs clear WCAG AA in both themes.\n`);
