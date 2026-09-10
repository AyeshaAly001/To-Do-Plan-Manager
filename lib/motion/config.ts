/**
 * Motion tokens — the single source for every animation in the app.
 *
 * Rules these encode (from the design system):
 *   - No infinite decorative loops.
 *   - Nothing exceeds 320ms on a user-initiated action.
 *   - Drag feedback is instant; it is never put behind a transition.
 *   - Everything collapses under `prefers-reduced-motion: reduce`.
 *
 * Durations are seconds here because that is what `motion` expects; the CSS
 * equivalents live in globals.css as --dur-fast / --dur-mid / --dur-slow and
 * must stay in step with these.
 */

import type { Transition, Variants } from "motion/react";

export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

export const DURATION = {
  fast: 0.12, // hover, press
  mid: 0.22, // panels, drawers, modals
  slow: 0.32, // page / view transitions
} as const;

/** Settle for a dropped card. Snappy enough not to feel laggy under the cursor. */
export const SPRING_DROP: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 32,
};

export const EASED = (duration: number = DURATION.mid): Transition => ({
  duration,
  ease: EASE_OUT,
});

/* --- shared variants ------------------------------------------------------ */

/** Modals and popovers: a small scale-up reads as "arriving", not "growing". */
export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: EASED(DURATION.mid) },
  exit: { opacity: 0, scale: 0.97, transition: EASED(DURATION.fast) },
};

/** Right-hand task drawer. */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: EASED(DURATION.mid) },
  exit: { opacity: 0, x: 24, transition: EASED(DURATION.fast) },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: EASED(DURATION.mid) },
  exit: { opacity: 0, transition: EASED(DURATION.fast) },
};

/**
 * List/board entrance. Stagger is capped because past roughly a dozen items
 * the last one arrives late enough to feel broken rather than choreographed.
 */
export const MAX_STAGGER_ITEMS = 12;
export const STAGGER_STEP = 0.03; // 30ms

export const staggerContainer = (count: number): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: STAGGER_STEP,
      delayChildren: 0,
      staggerDirection: 1,
      // Beyond the cap, drop the stagger rather than stretching it.
      ...(count > MAX_STAGGER_ITEMS ? { staggerChildren: 0 } : {}),
    },
  },
});

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: EASED(DURATION.fast) },
};

/**
 * Reduced-motion equivalents. `motion` can swap variants wholesale, so a
 * component renders `reduced ? NO_MOTION.scaleFade : scaleFade` and keeps one
 * code path. Opacity-only: state changes stay perceivable without movement.
 */
export const NO_MOTION = {
  scaleFade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0 } },
    exit: { opacity: 0, transition: { duration: 0 } },
  } satisfies Variants,
  slideInRight: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0 } },
    exit: { opacity: 0, transition: { duration: 0 } },
  } satisfies Variants,
  item: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0 } },
  } satisfies Variants,
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0 } },
  } satisfies Variants,
} as const;
