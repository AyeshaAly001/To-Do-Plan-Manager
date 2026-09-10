"use client";

import { animate, useInView } from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion/config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";

type CountUpProps = {
  value: number;
  /** Render the in-flight number. Defaults to a rounded, locale-formatted integer. */
  format?: (value: number) => string;
  durationMs?: number;
  className?: string;
};

/**
 * A dashboard KPI that counts up when it scrolls into view.
 *
 * Writes straight to `textContent` rather than through state: a KPI row holds
 * several of these, and re-rendering React 60 times a second per tile for a
 * 600ms flourish is a bad trade.
 *
 * Under `prefers-reduced-motion` it renders the final value immediately — the
 * number is the information, the animation is decoration.
 */
export function CountUp({ value, format, durationMs = 600, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.3 });

  const fmt = format ?? ((v: number) => Math.round(v).toLocaleString());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduced || !inView) {
      // Always leave the true value in the DOM when not animating, so the
      // number is correct for screen readers and for a reduced-motion user.
      el.textContent = fmt(value);
      return;
    }

    const controls = animate(0, value, {
      duration: durationMs / 1000,
      ease: EASE_OUT,
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
      onComplete: () => {
        el.textContent = fmt(value);
      },
    });

    return () => controls.stop();
    // `fmt` is derived from the `format` prop; depending on it directly would
    // restart the animation on every render for inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduced, durationMs]);

  return (
    <span
      ref={ref}
      // KPI figures are display type per the design system, but they must still
      // be announced as a single value, so the live number is the text content.
      className={cn("font-display text-3xl font-semibold tracking-tight", className)}
    >
      {fmt(value)}
    </span>
  );
}
