import { cn } from "@/lib/utils";

/**
 * Text input.
 *
 * Uses `--border-strong`, not `--border`: a form control's boundary has to
 * clear the WCAG 1.4.11 3:1 non-text minimum, which the decorative hairline
 * deliberately does not. Body font, because inputs hold data, not voice.
 */
export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "font-ui bg-surface text-ink border-border-strong h-9 w-full rounded-[--radius-md] border px-3 text-sm",
        "placeholder:text-muted",
        "transition-[border-color,box-shadow] duration-[--dur-fast] ease-[--ease-out]",
        "hover:border-ink/30",
        "disabled:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
        // aria-invalid rather than a prop, so native validation and server
        // errors style identically.
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "font-ui bg-surface text-ink border-border-strong min-h-20 w-full rounded-[--radius-md] border px-3 py-2 text-sm",
        "placeholder:text-muted resize-y",
        "transition-[border-color] duration-[--dur-fast] ease-[--ease-out]",
        "hover:border-ink/30",
        "disabled:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Native select rather than a custom listbox.
 *
 * A hand-rolled dropdown means re-implementing keyboard nav, typeahead and
 * screen-reader semantics; the native control gets all of that free and looks
 * consistent enough once tokenised. Worth revisiting only if we need option
 * groups with rich content.
 */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "font-ui bg-surface text-ink border-border-strong h-9 w-full rounded-[--radius-md] border px-2.5 text-sm",
        "transition-[border-color] duration-[--dur-fast] ease-[--ease-out]",
        "hover:border-ink/30",
        "disabled:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
