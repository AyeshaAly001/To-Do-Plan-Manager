import Link from "next/link";

import { MotionProvider } from "@/components/motion-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PaperStack } from "@/components/ui/paper-stack";

/**
 * Shell for the unauthenticated pages.
 *
 * One of only two places the design system permits purely decorative depth
 * (the other is empty states). Everything else earns its depth by being
 * interactive.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-[--radius-sm]"
            aria-label="Ash home"
          >
            <span className="bg-accent text-accent-ink font-display grid size-8 place-items-center rounded-[--radius-md] text-sm font-bold">
              A
            </span>
            <span className="font-display text-lg font-semibold">Ash</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center gap-4 text-center">
              <PaperStack />
              <p className="font-display text-muted text-sm">Plan the work, then do it.</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    </MotionProvider>
  );
}
