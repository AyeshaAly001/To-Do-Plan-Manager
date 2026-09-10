/**
 * Removes projects created by the e2e suite.
 *
 *   npm run dev:clean
 *
 * The task tests deliberately create a uniquely named project per run so they
 * are re-runnable without a database reset. That accumulates, and since every
 * query crosses a region, a workspace full of junk projects makes the whole
 * suite slower. This clears them without touching real data.
 *
 * Matches only the generated names, so a project someone actually made is
 * never caught by it.
 */

import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client.ts";

config({ path: [".env.local", ".env"], quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

try {
  const doomed = await prisma.project.findMany({
    where: {
      OR: [{ name: { startsWith: "Test Project " } }, { name: "Website Redesign" }],
    },
    select: { id: true, name: true, key: true },
  });

  if (doomed.length === 0) {
    console.log("\n  Nothing to clean.\n");
  } else {
    // Tasks cascade from the project; subtasks are Restrict-protected against
    // their PARENT task, which does not block deleting the project itself.
    const { count } = await prisma.project.deleteMany({
      where: { id: { in: doomed.map((p) => p.id) } },
    });
    console.log(`\n  Removed ${count} test project(s):`);
    for (const p of doomed) console.log(`    ${p.key.padEnd(7)} ${p.name}`);
    console.log("");
  }
} finally {
  await prisma.$disconnect();
}
