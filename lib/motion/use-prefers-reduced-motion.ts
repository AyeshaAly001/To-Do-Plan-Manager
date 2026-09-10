"use client";

import { useReducedMotion } from "motion/react";

/**
 * `motion`'s hook returns `boolean | null` (null before it has read the media
 * query). Treating null as "reduce" would flash static content for everyone on
 * first paint; treating it as "animate" would flash motion at users who asked
 * for none. Null resolves synchronously on the client in practice, so we
 * default to false and let the CSS backstop in globals.css cover the gap.
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
