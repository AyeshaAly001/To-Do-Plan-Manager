/**
 * Pure slug helpers — no imports, safe in a client bundle.
 *
 * This file is deliberately dependency-free. The database-backed
 * `uniqueWorkspaceSlug` lives in `slug-server.ts`, because importing Prisma
 * here would drag the `pg` driver (and its `dns`/`net`/`tls`/`fs` requires)
 * into any client component that wants to preview a slug as the user types.
 */

/** Reserved because they would collide with real app routes. */
export const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "login",
  "signup",
  "logout",
  "onboarding",
  "settings",
  "home",
  "inbox",
  "projects",
  "goals",
  "reports",
  "team",
  "my-tasks",
  "design",
  "invite",
  "admin",
  "new",
  "w",
]);

/** Lowercase, alphanumeric-and-hyphen, no leading/trailing/repeated hyphens. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      // Strip combining marks so "Café" becomes "cafe" rather than "caf".
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      // Slicing can leave a trailing hyphen behind.
      .replace(/-+$/g, "")
  );
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
