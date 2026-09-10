/**
 * Fails if a color is hardcoded outside the token layer.
 *
 *   npm run lint:colors
 *
 * The design system only holds together if every color resolves through a
 * token — otherwise the light/dark swap silently misses things and the contrast
 * audit stops meaning anything, because it only knows about the tokens.
 *
 * Allowed to hold literal colors:
 *   - app/globals.css        the token definitions themselves
 *   - lib/design/palette.ts  the same values for JS consumers
 *   - any line tagged `allow-hardcoded-color` with a reason
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["app", "components", "lib"];
const EXTENSIONS = [".ts", ".tsx", ".css"];

const EXEMPT_FILES = new Set(["app/globals.css", "lib/design/palette.ts"]);

/** Tests assert on literal colors by nature — that's the point of a fixture. */
const isTest = (rel: string) => /\.test\.tsx?$/.test(rel);

const ESCAPE_HATCH = "allow-hardcoded-color";

/** 3/4/6/8-digit hex, plus the functional color notations. */
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "hex color", re: /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/ },
  { name: "rgb()", re: /\brgba?\(/ },
  { name: "hsl()", re: /\bhsla?\(/ },
  { name: "oklch()", re: /\boklch\(/ },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (EXTENSIONS.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

type Violation = { file: string; line: number; kind: string; text: string };

const violations: Violation[] = [];

for (const root of ROOTS) {
  let files: string[];
  try {
    files = walk(root);
  } catch {
    continue; // root not created yet
  }

  for (const file of files) {
    const rel = relative(".", file);
    if (EXEMPT_FILES.has(rel) || isTest(rel)) continue;

    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((line, i) => {
      if (line.includes(ESCAPE_HATCH)) return;
      // Shadow tints are declared as bare channel triples (`42 39 36`) and
      // consumed via rgb(var(--shadow-rgb) / a); the rgb() there wraps a token.
      if (/rgba?\(\s*var\(--/.test(line)) return;

      for (const { name, re } of PATTERNS) {
        if (re.test(line)) {
          violations.push({ file: rel, line: i + 1, kind: name, text: line.trim() });
          break;
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`\n  ${violations.length} hardcoded color(s) found:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.kind}`);
    console.error(`    ${v.text.slice(0, 100)}`);
  }
  console.error(
    `\n  Use a token (see app/globals.css). If a literal is genuinely required,\n` +
      `  tag the line with "${ESCAPE_HATCH}" and say why.\n`,
  );
  process.exit(1);
}

console.log("  No hardcoded colors outside the token layer.\n");
