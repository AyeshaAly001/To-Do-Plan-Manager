import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * Derives a project key from its name — the ASH-42 prefix.
 *
 * Initials for multi-word names ("Website Redesign" -> WR), otherwise the
 * first letters ("Marketing" -> MAR). Uniqueness is per workspace, and
 * collisions get a numeric suffix rather than a random one so keys stay
 * readable and stable.
 *
 * Racy by nature — two projects created at once can pick the same candidate.
 * The unique index on (workspaceId, key) is the real guarantee; this only
 * proposes a good starting point.
 */
export async function deriveProjectKey(name: string, workspaceId: string): Promise<string> {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let base: string;
  if (words.length >= 2) {
    base = words
      .map((w) => w[0]!)
      .join("")
      .slice(0, 4);
  } else {
    base = (words[0] ?? "PRJ").slice(0, 3);
  }

  // Must start with a letter and be at least 2 characters, per the schema.
  base = base.replace(/^[0-9]+/, "");
  if (base.length < 2) base = (base + "PRJ").slice(0, 3);

  const existing = await prisma.project.findMany({
    where: { workspaceId, key: { startsWith: base } },
    select: { key: true },
  });
  const taken = new Set(existing.map((p) => p.key));

  if (!taken.has(base)) return base;

  for (let n = 2; n < 100; n++) {
    // Keys are capped at 6 characters, so trim the base to make room.
    const suffix = String(n);
    const candidate = base.slice(0, 6 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }

  return base.slice(0, 3) + Date.now().toString(36).slice(-3).toUpperCase();
}
