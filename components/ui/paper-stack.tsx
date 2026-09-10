import { cn } from "@/lib/utils";

/**
 * Three offset sheets of paper.
 *
 * This is the app's only piece of purely decorative depth — it appears on empty
 * states and the auth screens and nowhere else. Built from tokenised divs
 * rather than an image so it follows the theme, and marked aria-hidden because
 * it carries no information.
 */
export function PaperStack({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-20 w-16", className)}>
      {/* back sheet, furthest and most rotated */}
      <div className="bg-surface border-border elev-rest absolute inset-0 -rotate-6 rounded-[--radius-sm] border" />
      {/* middle sheet */}
      <div className="bg-surface border-border elev-rest absolute inset-0 rotate-3 rounded-[--radius-sm] border" />
      {/* front sheet, square to the viewer, with a few ruled lines */}
      <div className="bg-surface border-border elev-hover absolute inset-0 flex flex-col justify-center gap-1.5 rounded-[--radius-sm] border px-3">
        <div className="bg-border h-1 w-full rounded-full" />
        <div className="bg-border h-1 w-4/5 rounded-full" />
        <div className="bg-border h-1 w-full rounded-full" />
        <div className="bg-border h-1 w-1/2 rounded-full" />
      </div>
    </div>
  );
}
