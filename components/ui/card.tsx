import { cn } from "@/lib/utils";

/**
 * A flat, raised surface.
 *
 * Deliberately NOT glass. Glass is reserved for surfaces that float above
 * content (see the `.glass` utility in globals.css); cards are the calm,
 * readable ground the app is mostly made of. `interactive` opts into the hover
 * lift for cards that are actually clickable.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "bg-surface border-border rounded-[--radius-lg] border",
        interactive ? "lift cursor-pointer" : "elev-rest",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted text-sm", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border-border flex items-center gap-2 border-t px-5 py-3", className)}
      {...props}
    />
  );
}

/**
 * KPI tile. `paper-edge` adds the 1px inner highlight that reads as a pressed
 * paper edge — the design system's substitute for a gradient fill.
 */
export function StatTile({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-surface border-border paper-edge flex flex-col gap-1 rounded-[--radius-lg] border p-4",
        className,
      )}
      {...props}
    />
  );
}
