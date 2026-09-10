/**
 * Verifies the database-side security posture.
 *
 *   npm run verify:security
 *
 * The plan calls for this every phase after Phase 1, because multi-tenancy is
 * the highest-risk area in the app and the failure mode is silent: a table
 * added without RLS looks completely fine until a key leaks.
 *
 * Checks, in order of how badly each would hurt:
 *   1. Every table in `public` has RLS enabled.
 *   2. `anon` and `authenticated` hold no grants on those tables — so they are
 *      absent from the PostgREST surface, not merely unreadable.
 *   3. The auth.users -> profiles triggers exist (insert/update/delete).
 *   4. The publishable key really cannot read anything over HTTP. This is the
 *      end-to-end proof; 1 and 2 are the mechanism.
 *
 * Exits non-zero on any failure.
 */

import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client.ts";

config({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("  DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Tables intentionally exempt from the checks, with a reason. */
const EXEMPT = new Set<string>([
  // Prisma's own migration bookkeeping. Not application data, and Prisma
  // manages it directly as the table owner.
  "_prisma_migrations",
]);

let failures = 0;
const fail = (message: string) => {
  failures++;
  console.error(`  FAIL  ${message}`);
};
const pass = (message: string) => console.log(`  pass  ${message}`);

try {
  // --- 1. RLS enabled on every public table -------------------------------
  const tables = await prisma.$queryRaw<{ table_name: string; rls: boolean }[]>`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname
  `;

  console.log(`\n  Row Level Security (${tables.length} tables in public)`);
  console.log("  " + "-".repeat(62));
  for (const { table_name, rls } of tables) {
    if (EXEMPT.has(table_name)) {
      console.log(`  skip  ${table_name} (exempt: Prisma migration bookkeeping)`);
      continue;
    }
    if (rls) {
      pass(`RLS enabled on ${table_name}`);
    } else {
      fail(`RLS NOT enabled on ${table_name}`);
    }
  }

  // --- 2. No grants to the public-facing roles ----------------------------
  const grants = await prisma.$queryRaw<
    { table_name: string; grantee: string; privilege_type: string }[]
  >`
    SELECT table_name, grantee, privilege_type
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
     ORDER BY table_name, grantee
  `;

  console.log("\n  Grants to anon / authenticated");
  console.log("  " + "-".repeat(62));
  const leaked = grants.filter((g) => !EXEMPT.has(g.table_name));
  if (leaked.length === 0) {
    pass("no grants held by anon or authenticated on any public table");
  } else {
    for (const g of leaked) {
      fail(`${g.grantee} still holds ${g.privilege_type} on ${g.table_name}`);
    }
  }

  // --- 3. auth.users triggers --------------------------------------------
  const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
    SELECT tgname
      FROM pg_trigger
     WHERE tgrelid = 'auth.users'::regclass
       AND NOT tgisinternal
     ORDER BY tgname
  `;
  const names = triggers.map((t) => t.tgname);

  console.log("\n  auth.users -> profiles triggers");
  console.log("  " + "-".repeat(62));
  for (const expected of [
    "on_auth_user_created",
    "on_auth_user_updated",
    "on_auth_user_deleted",
  ]) {
    if (names.includes(expected)) {
      pass(`${expected} present`);
    } else {
      fail(`${expected} MISSING — profiles will drift from auth.users`);
    }
  }

  // --- 4. End-to-end: the publishable key must read nothing ---------------
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  console.log("\n  Publishable key cannot read application data");
  console.log("  " + "-".repeat(62));

  if (!url || !key) {
    fail("NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY missing — cannot verify");
  } else {
    /**
     * Retries transient network errors.
     *
     * This link drops connections intermittently, and a dropped request must
     * never be read as "the table is secure" — that would turn the check into
     * decoration. So: retry, and if it still cannot be determined, report it
     * as INCONCLUSIVE and fail. Unverified is not the same as safe.
     */
    const probe = async (table: string, attempts = 4) => {
      let lastError = "";
      for (let i = 1; i <= attempts; i++) {
        try {
          const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(30_000),
          });
          const body = await res.text();

          // A 200 with rows is the real failure. 401/403/404 all mean "not
          // reachable with this key", which is what we want.
          if (res.ok && body.trim() !== "[]") {
            fail(`${table} IS READABLE with the publishable key (HTTP ${res.status})`);
          } else if (res.ok) {
            fail(`${table} is queryable with the publishable key (200, empty body)`);
          } else {
            pass(`${table} refused (HTTP ${res.status})`);
          }
          return;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * i));
        }
      }
      fail(`${table} INCONCLUSIVE after ${attempts} attempts (${lastError}) — not verified`);
    };

    for (const table of ["profiles", "workspaces", "workspace_members", "invitations"]) {
      await probe(table);
    }
  }
} catch (error) {
  failures++;
  console.error(`\n  Verification errored: ${error instanceof Error ? error.message : error}`);
} finally {
  await prisma.$disconnect();
}

console.log("");
if (failures > 0) {
  console.error(`  ${failures} security check(s) failed.\n`);
  process.exit(1);
}
console.log("  Database security posture verified.\n");
