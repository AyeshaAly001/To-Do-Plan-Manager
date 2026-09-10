import { NuqsAdapter } from "nuqs/adapters/next/app";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MotionProvider } from "@/components/motion-provider";
import { getMemberships, requireWorkspace } from "@/lib/auth/session";

/**
 * Shell for every authenticated, workspace-scoped route.
 *
 * `requireWorkspace` resolves the session and active workspace, sending
 * anonymous visitors to /login and workspace-less users to /onboarding. Doing
 * it here means no page inside this group has to handle either case.
 *
 * This is a second, independent check on top of the proxy — not redundancy for
 * its own sake. The proxy can lose coverage through a matcher change, and it
 * deliberately performs no database work, so it cannot know about membership
 * at all.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, workspace } = await requireWorkspace();
  const memberships = await getMemberships(user.id);

  return (
    // NuqsAdapter lets view state (grouping, filters, the open task) live in
    // the URL, so a view is shareable and survives a refresh. Selection stays
    // in React state — nobody wants to send a link that pre-selects rows.
    <NuqsAdapter>
      <MotionProvider>
        <div className="flex min-h-dvh">
          <Sidebar user={user} workspace={workspace} memberships={memberships} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
              {children}
            </main>
          </div>
        </div>
      </MotionProvider>
    </NuqsAdapter>
  );
}
