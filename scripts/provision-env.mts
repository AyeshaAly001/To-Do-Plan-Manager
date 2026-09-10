/**
 * Fills the Supabase values in .env.local from the Management API.
 *
 *   npm run provision:env
 *
 * Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from .env.local, fetches
 * the project's publishable and secret keys, and writes them back in place —
 * preserving comments and any value already set.
 *
 * Secrets are never printed: the summary is masked. Nothing here touches a
 * committed file; .env.local is gitignored.
 *
 * Connection strings need the database password, which Supabase does not expose
 * after project creation. Supply it once and it is composed into DATABASE_URL
 * (pooled, 6543) and DIRECT_URL (direct, 5432).
 *
 * PREFER the environment variable — process arguments are visible to other
 * local processes via `ps`, and npm additionally writes argv into its debug log
 * on failure:
 *
 *   read -rs "PW?DB password: " && SUPABASE_DB_PASSWORD="$PW" \
 *     node scripts/provision-env.ts && unset PW
 *
 * `--db-password '<pw>'` still works for convenience, but is less private.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const ENV_PATH = ".env.local";

// --- tiny .env reader/writer that keeps comments and ordering ---------------

function readEnvFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`${path} not found. Copy .env.example to .env.local first.`);
  }
}

function getValue(content: string, key: string): string {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

/** Replaces KEY=... in place, or appends if the key is absent. */
function setValue(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
}

const mask = (v: string) =>
  v.length <= 12 ? "*".repeat(v.length) : `${v.slice(0, 8)}…${v.slice(-4)} (${v.length} chars)`;

// --- args -------------------------------------------------------------------

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
// Env var first: it does not appear in `ps` output or npm's debug log.
const dbPassword = process.env.SUPABASE_DB_PASSWORD || argValue("--db-password");

if (argValue("--db-password")) {
  console.warn(
    "  note: --db-password was passed as an argument, which is visible to other\n" +
      "        local processes. Prefer SUPABASE_DB_PASSWORD=... next time.",
  );
}

// --- main -------------------------------------------------------------------

let env = readEnvFile(ENV_PATH);

const token = getValue(env, "SUPABASE_ACCESS_TOKEN");
if (!token) {
  console.error("  SUPABASE_ACCESS_TOKEN is empty in .env.local.");
  process.exit(1);
}

const ref = getValue(env, "SUPABASE_PROJECT_REF");
if (!ref) {
  console.error(
    "  SUPABASE_PROJECT_REF is empty in .env.local.\n" +
      "  Set it to the project ref (the subdomain of your project URL).",
  );
  process.exit(1);
}

type ApiKey = { name?: string; type?: string; api_key?: string; apiKey?: string };

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});

if (!response.ok) {
  console.error(`  Management API returned ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const keys = (await response.json()) as ApiKey[];
const valueOf = (type: string) => {
  const k = keys.find((k) => k.type === type);
  return (k?.api_key ?? k?.apiKey ?? "").trim();
};

// Prefer the modern scoped keys over the legacy anon/service_role JWTs.
const publishable = valueOf("publishable");
const secret = valueOf("secret");

if (!publishable) {
  console.error(
    "  Could not find a publishable key on this project.\n" +
      `  Types returned: ${keys.map((k) => k.type).join(", ")}`,
  );
  process.exit(1);
}

/**
 * The Management API returns the SECRET key redacted — the middle is replaced
 * with U+00B7 middle dots. Writing that would look like success and then fail
 * at runtime with "Invalid API key", so refuse it and say what to do instead.
 * The publishable key is public and comes back whole.
 */
const isRedacted = (value: string) => value.includes("·") || value.includes("*");

env = setValue(env, "NEXT_PUBLIC_SUPABASE_URL", `https://${ref}.supabase.co`);
env = setValue(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishable);

let secretStatus: string;
if (!secret) {
  secretStatus = "not returned by the API — copy it from the dashboard";
} else if (isRedacted(secret)) {
  // Don't overwrite a good value the user pasted by hand with a redacted one.
  const existing = getValue(env, "SUPABASE_SECRET_KEY");
  secretStatus =
    existing && !isRedacted(existing)
      ? "kept the value already in .env.local (API only returns it redacted)"
      : "REDACTED by the API — must be pasted by hand";
  if (existing && isRedacted(existing)) {
    // Clear the placeholder so nothing silently uses a broken key.
    env = setValue(env, "SUPABASE_SECRET_KEY", "");
  }
} else {
  env = setValue(env, "SUPABASE_SECRET_KEY", secret);
  secretStatus = mask(secret);
}

// Cron endpoints are unauthenticated without this, so generate one if absent.
if (!getValue(env, "CRON_SECRET")) {
  env = setValue(env, "CRON_SECRET", randomBytes(32).toString("hex"));
}

if (dbPassword) {
  // Supabase's pooler host is regional and the username encodes the project
  // ref. The pooled endpoint (6543) is for the app; migrations need the direct
  // one (5432) because pgbouncer in transaction mode can't run them.
  const encoded = encodeURIComponent(dbPassword);
  const region = argValue("--region") ?? "ap-northeast-1";
  const pooled = `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`;
  const direct = `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  env = setValue(env, "DATABASE_URL", pooled);
  env = setValue(env, "DIRECT_URL", direct);
}

writeFileSync(ENV_PATH, env, { mode: 0o600 });

console.log(`\n  Wrote ${ENV_PATH} (mode 600, gitignored)\n`);
console.log(`  NEXT_PUBLIC_SUPABASE_URL             https://${ref}.supabase.co`);
console.log(`  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ${mask(publishable)}`);
console.log(`  SUPABASE_SECRET_KEY                  ${secretStatus}`);
console.log(`  CRON_SECRET                          ${mask(getValue(env, "CRON_SECRET"))}`);
// Report what the FILE now holds, not merely what this run supplied — running
// without a password leaves any existing values untouched, and saying
// "NOT SET" in that case is alarming and wrong.
const hasConnStrings = Boolean(getValue(env, "DATABASE_URL") && getValue(env, "DIRECT_URL"));
console.log(
  `  DATABASE_URL / DIRECT_URL            ${
    hasConnStrings
      ? dbPassword
        ? "set (password masked)"
        : "already set — left untouched"
      : "NOT SET — rerun with SUPABASE_DB_PASSWORD=... in the environment"
  }\n`,
);

if (!getValue(env, "SUPABASE_SECRET_KEY")) {
  console.log(
    `  SUPABASE_SECRET_KEY still needs to be set. The Management API only ever\n` +
      `  returns it redacted, so copy it from:\n\n` +
      `    https://supabase.com/dashboard/project/${ref}/settings/api-keys\n\n` +
      `  and add it to .env.local by hand. It is server-only — it must never be\n` +
      `  prefixed NEXT_PUBLIC_ or imported into a client component.\n` +
      `  Not needed until Phase 1 (privileged server operations).\n`,
  );
}
