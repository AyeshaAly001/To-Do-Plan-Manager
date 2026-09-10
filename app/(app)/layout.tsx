import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MotionProvider } from "@/components/motion-provider";

/**
 * Shell for every authenticated route.
 *
 * Phase 1 adds the auth guard (proxy.ts) and the workspace switcher; the
 * structure is here now so later phases only fill panes in.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </MotionProvider>
  );
}
