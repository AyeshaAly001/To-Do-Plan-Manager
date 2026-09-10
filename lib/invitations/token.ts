import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Invitation tokens.
 *
 * The token goes in the emailed link; only its SHA-256 hash is stored. A
 * database dump therefore yields no usable invitation links — the same reason
 * password hashes exist.
 *
 * SHA-256 rather than bcrypt/argon2 is the right choice here specifically
 * because the token is 256 bits of CSPRNG output. Slow hashing protects
 * low-entropy secrets from brute force; there is nothing to brute-force in a
 * random 32-byte value, and a fast hash keeps accept-flow lookups indexable.
 */

/** Days an invitation stays valid. */
export const INVITATION_TTL_DAYS = 7;

export type GeneratedToken = {
  /** Goes in the link. Never stored. */
  token: string;
  /** Stored in `invitations.token_hash`. */
  tokenHash: string;
  expiresAt: Date;
};

export function generateInvitationToken(): GeneratedToken {
  // base64url: URL-safe with no padding, so it survives being pasted around.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two hashes.
 *
 * Lookups go through the unique index on `token_hash`, so this is belt and
 * braces — but any place that compares a secret should not leak length or
 * prefix information through timing.
 */
export function tokenHashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Absolute URL for an invitation link. */
export function invitationUrl(origin: string, token: string): string {
  return `${origin}/invite/${token}`;
}
