import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 emits the client into the repo (see prisma/schema.prisma `output`),
// not into node_modules/@prisma/client. Run `npm run db:generate` after any
// schema change, or this import will not resolve.
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Single Prisma client, reused across hot reloads.
 *
 * Without the global cache, every dev-server reload leaks a new client and its
 * connection pool, and you hit Supabase's connection limit within minutes.
 *
 * Prisma 7 requires an explicit driver adapter — `new PrismaClient()` with no
 * adapter throws. We point it at DATABASE_URL, the POOLED endpoint (:6543):
 * serverless functions churn connections, and the pooler is what stops that
 * from exhausting Postgres. Migrations deliberately use the direct endpoint
 * instead; see prisma.config.ts.
 *
 * IMPORTANT — authorization: this client connects with the database
 * credential and therefore BYPASSES Row Level Security. RLS is enabled
 * deny-all on every table purely as leak insurance for the publishable key.
 * All real authorization happens in `lib/auth/action.ts` (Phase 1). Nothing may
 * query the database around that wrapper.
 */

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Fail loudly at construction rather than with an opaque adapter error on
    // the first query.
    throw new Error(
      "DATABASE_URL is not set. Run `npm run provision:env -- --db-password '<pw>'`.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
