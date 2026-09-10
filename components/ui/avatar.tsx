import { cn } from "@/lib/utils";

/** Initials from a display name, falling back to the email's local part. */
export function initialsFor(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

const SIZES = {
  sm: "size-6 text-[0.625rem]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-16 text-lg",
} as const;

/**
 * Avatar with an initials fallback.
 *
 * Deliberately not `next/image`: these are small, often remote Supabase
 * Storage URLs, and routing them through the optimizer costs a round trip for
 * a 32px square. Plain <img> with explicit dimensions avoids layout shift just
 * as well at this size.
 */
export function Avatar({
  src,
  name,
  email,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  email: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = initialsFor(name, email);
  const label = name?.trim() || email;

  return (
    <span
      className={cn(
        "bg-accent-soft text-ink font-display relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        SIZES[size],
        className,
      )}
      // The initials are decorative when a name is shown alongside; the title
      // covers the case where the avatar stands alone.
      title={label}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
