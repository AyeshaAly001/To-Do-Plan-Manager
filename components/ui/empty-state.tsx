import type { ReactNode } from "react";

import { PaperStack } from "@/components/ui/paper-stack";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** One human line in the display face. Not "No data available". */
  title: string;
  /** Optional second line explaining what to do about it. */
  description?: string;
  /** The single primary action that resolves the emptiness. */
  action?: ReactNode;
  className?: string;
};

/**
 * Every list in the app gets one of these — an empty list with no designed
 * empty state is treated as an unfinished screen.
 *
 * Shape: paper motif, one line of Playpen Sans, one action. Resist adding a
 * second action; if the user needs a choice here, the screen above is wrong.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-6 py-16 text-center",
        className,
      )}
    >
      <PaperStack />
      <div className="space-y-1">
        <p className="font-display text-ink text-lg font-semibold">{title}</p>
        {description ? (
          <p className="text-muted mx-auto max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
