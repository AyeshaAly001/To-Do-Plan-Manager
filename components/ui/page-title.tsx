import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Standard page header: display-face title, optional muted subtitle, actions
 * pinned right. Used by every route so headings stay consistent in size and
 * rhythm rather than each screen inventing its own.
 */
export function PageTitle({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl">{title}</h1>
        {subtitle ? <p className="text-muted text-sm">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
