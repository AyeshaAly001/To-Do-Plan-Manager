// Prisma 7 moved connection configuration out of schema.prisma into this file.
// `directUrl` was removed entirely, which actually suits Supabase well:
//
//   - MIGRATIONS (this file)  -> DIRECT_URL, port 5432, session mode.
//     pgbouncer in transaction mode cannot run DDL or advisory locks, so
//     migrations must not go through the pooled endpoint.
//
//   - RUNTIME (lib/db/prisma.ts) -> DATABASE_URL, port 6543, pooled.
//     Serverless functions open and drop connections constantly; the pooler is
//     what keeps that from exhausting Postgres' connection limit.
//
// The Prisma CLI runs outside Next.js, so it does not get Next's automatic
// .env.local loading — dotenv has to be pointed at it explicitly. Order
// matters: dotenv does not overwrite already-set keys, so .env.local wins over
// .env, matching Next's own precedence.
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mts",
  },

  datasource: {
    url: env("DIRECT_URL"),
  },
});
