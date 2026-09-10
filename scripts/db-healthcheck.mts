/**
 * Proves the RUNTIME database path works end to end.
 *
 *   npm run db:check
 *
 * Deliberately exercises DATABASE_URL — the POOLED endpoint (:6543) the app
 * actually uses — not DIRECT_URL. `prisma migrate` succeeding only proves the
 * direct connection works; pgbouncer in transaction mode is a different code
 * path and can fail independently (prepared statements, session state, the
 * `pgbouncer=true` flag).
 *
 * Writes a row, reads it back, then deletes it, so it leaves no residue.
 */

import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client.ts";

config({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("  DATABASE_URL is not set. Run: npm run provision:env");
  process.exit(1);
}

// Confirm we really are on the pooled port, or the test proves nothing.
const port = new URL(connectionString.replace(/^postgres(ql)?:/, "http:")).port;
const isPooled = port === "6543";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

let exitCode = 0;

try {
  console.log(`\n  endpoint            port ${port} ${isPooled ? "(pooled)" : "(NOT pooled)"}`);
  if (!isPooled) {
    console.warn("  warning: DATABASE_URL should be the pooled endpoint on port 6543");
  }

  const [{ now }] = await prisma.$queryRaw<[{ now: Date }]>`SELECT now() AS now`;
  console.log(`  SELECT now()        ok — server time ${now.toISOString()}`);

  const created = await prisma.systemHealth.create({
    data: { note: "phase-0 healthcheck" },
  });
  console.log(`  INSERT              ok — id ${created.id}`);

  const found = await prisma.systemHealth.findUnique({ where: { id: created.id } });
  if (!found) throw new Error("row written but not readable back");
  console.log(`  SELECT by id        ok — checkedAt ${found.checkedAt.toISOString()}`);

  await prisma.systemHealth.delete({ where: { id: created.id } });
  const remaining = await prisma.systemHealth.count();
  console.log(`  DELETE              ok — ${remaining} row(s) remaining`);

  console.log("\n  Runtime database path verified through the pooler.\n");
} catch (error) {
  exitCode = 1;
  console.error("\n  Database healthcheck FAILED:");
  console.error(`  ${error instanceof Error ? error.message : String(error)}\n`);
} finally {
  await prisma.$disconnect();
}

process.exit(exitCode);
