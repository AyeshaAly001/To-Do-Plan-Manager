import { MotionProvider } from "@/components/motion-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Shell for the public design reference.
 *
 * Deliberately outside the `(app)` group: /design documents the design system
 * and must render without a session or a workspace, so it cannot sit behind
 * `requireWorkspace`. It is also absent from the proxy's PROTECTED_PREFIXES.
 */
export default function ReferenceLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-end px-4 py-3 sm:px-6">
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-6 sm:px-6">{children}</main>
      </div>
    </MotionProvider>
  );
}
