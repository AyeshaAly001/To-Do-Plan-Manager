import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Small status chip.
 *
 * Uses the validated tint pattern — `bg-{token}/15` with `text-{token}` — the
 * status colors were contrast-solved specifically so this composite clears
 * WCAG AA on every surface (see lib/design/palette.ts). Do not invent new
 * tint opacities: 15% is the value the audit checks.
 *
 * The accent variant is the exception: it uses `--accent-soft` with `--ink`
 * rather than a self-tint, because the accent is a brand color, not a status.
 *
 * IMPORTANT: a badge must always carry text. Colour alone never encodes status
 * here — the clay accent and `danger` are only ~24 degrees apart in hue, and
 * red/orange is exactly the pair red-green colour blindness collapses. The
 * label is what makes it unambiguous (WCAG 1.4.1).
 */
const badgeVariants = cva(
  "font-display inline-flex items-center gap-1 rounded-[--radius-sm] px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted",
        accent: "bg-accent-soft text-ink",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/15 text-danger",
        info: "bg-info/15 text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
