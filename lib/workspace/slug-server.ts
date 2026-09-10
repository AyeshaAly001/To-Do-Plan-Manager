import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isReservedSlug, slugify } from "@/lib/workspace/slug";

/**
 * A slug that is free, derived from `name`.
 *
 * Appends `-2`, `-3`, … on collision rather than a random suffix, so the first
 * "Acme" gets `acme` and the second `acme-2` — predictable and readable, where
 * a hash would be neither.
 *
 * This is inherently racy: two simultaneous creations can both see the same
 * slug as free. The unique index on `workspaces.slug` is the real guarantee;
 * this only picks a good candidate.
 */
export async function uniqueWorkspaceSlug(name: string): Promise<string> {
  const base = slugify(name) || "workspace";
  // A reserved word is only a problem as the whole slug, not as a prefix.
  const seed = isReservedSlug(base) ? `${base}-workspace` : base;

  const existing = await prisma.workspace.findMany({
    where: { slug: { startsWith: seed } },
    select: { slug: true },
  });

  const taken = new Set(existing.map((w) => w.slug));
  if (!taken.has(seed)) return seed;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${seed}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }

  // Practically unreachable, and better than looping forever.
  return `${seed}-${Date.now().toString(36)}`;
}
