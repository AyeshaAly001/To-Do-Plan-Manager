import { cn } from "@/lib/utils";

/**
 * Loading placeholder. The design system uses skeletons, never spinners: a
 * skeleton tells you what is about to appear and where, a spinner tells you
 * only to wait.
 *
 * The shimmer is a CSS animation, so the blanket `prefers-reduced-motion` rule
 * in globals.css flattens it to a static block automatically.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("bg-surface-2 animate-pulse rounded-[--radius-sm]", className)}
      {...props}
    />
  );
}

/** Convenience: a block of text lines, last one short like real prose. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/5" : "w-full")} />
      ))}
    </div>
  );
}
