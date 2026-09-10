import type { Metadata } from "next";

import { InboxList } from "@/components/collab/inbox-list";
import { ActivityFeed } from "@/components/collab/activity-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { requireWorkspace } from "@/lib/auth/session";
import { getActivity, getNotifications } from "@/lib/collab/queries";

export const metadata: Metadata = { title: "Inbox" };

/**
 * Notifications, plus recent workspace activity.
 *
 * The two are side by side on purpose: notifications are what was addressed
 * TO you, activity is everything that happened. Merging them would bury the
 * former in the latter, which is how an inbox stops being useful.
 */
export default async function InboxPage() {
  const { user, workspace } = await requireWorkspace();

  const [notifications, activity] = await Promise.all([
    getNotifications(user.id, 50),
    getActivity(workspace, { limit: 25 }),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Inbox"
        subtitle={
          notifications.unreadCount > 0
            ? `${notifications.unreadCount} unread`
            : "Nothing unread"
        }
      />

      <InboxList
        unreadCount={notifications.unreadCount}
        items={notifications.items.map((n) => ({
          id: n.id,
          type: n.type,
          payload: (n.payload ?? {}) as Record<string, unknown>,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Workspace activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed
            entries={activity.map((a) => ({
              id: a.id,
              entityType: a.entityType,
              entityId: a.entityId,
              action: a.action,
              diff: a.diff,
              createdAt: a.createdAt.toISOString(),
              actor: a.actor,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
