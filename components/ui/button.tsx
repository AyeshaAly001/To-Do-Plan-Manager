import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

/**
 * Buttons are display type — they are part of the app's voice.
 *
 * Note `active:translate-y-px`: the press feedback is a 1px push *into* the
 * page, the inverse of the `.lift` hover. Together they make the surface feel
 * physical without any literal 3D.
 */
const buttonVariants = cva(
  [
    "font-display inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[--radius-md] font-semibold select-none",
    "transition-[background-color,box-shadow,transform,border-color] duration-[--dur-fast]",
    "ease-[--ease-out] active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // The one filled button on a screen. --accent-ink flips per theme
        // because the accent is a dark fill on light and a light fill on dark.
        primary: "bg-accent text-accent-ink elev-rest hover:brightness-110 elev-hover",
        secondary:
          "bg-surface text-ink border-border-strong border elev-rest hover:bg-surface-2",
        ghost: "text-ink hover:bg-surface-2 bg-transparent",
        subtle: "bg-accent-soft text-ink hover:brightness-[0.97]",
        danger: "bg-danger text-accent-ink elev-rest hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-[0.8125rem] [&_svg]:size-3.5",
        md: "h-9 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-6 text-base [&_svg]:size-[1.125rem]",
        icon: "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element (e.g. a Next <Link>) instead of a <button>. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
