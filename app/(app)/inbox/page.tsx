import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { requireWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Inbox" };

/**
 * Notifications.
 *
 * The table and the query are real; nothing writes to it until Phase 4 adds
 * mentions, assignment alerts and due-soon reminders. So this renders an
 * honest empty state rather than a fake feed — a mocked inbox would be
 * indistinguishable from a broken one.
 */
export default async function InboxPage() {
  const { user } = await requireWorkspace();

  const notifications = await prisma.notification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
  });

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageTitle title="Inbox" subtitle={unread > 0 ? `${unread} unread` : "Nothing unread"} />

      {notifications.length === 0 ? (
        <EmptyState
          title="Your inbox is empty"
          description="Mentions, assignments and due-soon reminders will arrive here once collaboration lands."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {notifications.map((n) => (
                <li key={n.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {!n.readAt && <Badge tone="accent">New</Badge>}
                  <span className="flex-1 truncate">{n.type}</span>
                  <time
                    dateTime={n.createdAt.toISOString()}
                    className="text-muted shrink-0 text-xs"
                    data-numeric
                  >
                    {n.createdAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
