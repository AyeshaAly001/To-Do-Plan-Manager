"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { DURATION, EASE_OUT } from "@/lib/motion/config";

/**
 * App-wide motion defaults.
 *
 * `reducedMotion="user"` makes `motion` honour the OS setting for transform and
 * layout animations automatically — that is the primary guard. globals.css has
 * a blanket `prefers-reduced-motion` rule as a second backstop for plain CSS
 * transitions, and components that animate something motion can't infer (the
 * dashboard count-ups, the 3D drag tilt) check `useReducedMotion()` themselves.
 * Three layers, because a missed animation is an accessibility bug, not a
 * cosmetic one.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.mid, ease: EASE_OUT }}>
      {children}
    </MotionConfig>
  );
}
