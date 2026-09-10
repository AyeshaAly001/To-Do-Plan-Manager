"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationsRead } from "@/lib/collab/read-actions";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

/**
 * The notification list.
 *
 * Opening a notification marks just that one read, rather than clearing the
 * whole inbox — losing your place in a list you were working through is worse
 * than one extra click.
 */
export function InboxList({ items, unreadCount }: { items: Item[]; unreadCount: number }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [unread, setUnread] = useState(unreadCount);
  const [filterUnread, setFilterUnread] = useState(false);
  const [, start] = useTransition();

  const markRead = (ids?: string[]) => {
    start(async () => {
      const result = await markNotificationsRead(ids ? { notificationIds: ids } : {});
      if (!result.ok) return;
      const now = new Date().toISOString();
      setRows((current) =>
        current.map((r) =>
          !ids || ids.includes(r.id) ? { ...r, readAt: r.readAt ?? now } : r,
        ),
      );
      setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
      router.refresh();
    });
  };

  const visible = filterUnread ? rows.filter((r) => !r.readAt) : rows;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle>Notifications</CardTitle>
        {unread > 0 && <Badge tone="danger">{unread}</Badge>}
        <span className="ml-auto flex items-center gap-1.5">
          <Button
            variant={filterUnread ? "subtle" : "ghost"}
            size="sm"
            onClick={() => setFilterUnread((v) => !v)}
            aria-pressed={filterUnread}
          >
            Unread only
          </Button>
          {unread > 0 && (
            <Button variant="secondary" size="sm" onClick={() => markRead()}>
              <Check />
              Mark all read
            </Button>
          )}
        </span>
      </CardHeader>

      <CardContent className="p-0">
        {visible.length === 0 ? (
          <EmptyState
            title={filterUnread ? "Nothing unread" : "Your inbox is empty"}
            description={
              filterUnread
                ? "You are caught up."
                : "Mentions, comments and reminders arrive here."
            }
            className="py-10"
          />
        ) : (
          <ul className="divide-border divide-y">
            {visible.map((item) => {
              const projectId =
                typeof item.payload.projectId === "string" ? item.payload.projectId : null;
              const taskId =
                typeof item.payload.taskId === "string" ? item.payload.taskId : null;
              const href = projectId && taskId ? `/projects/${projectId}?task=${taskId}` : null;

              const body = (
                <>
                  <span className="flex items-center gap-2">
                    {!item.readAt && (
                      <span aria-hidden className="bg-accent size-1.5 shrink-0 rounded-full" />
                    )}
                    <span className="flex-1 truncate text-sm font-medium">
                      {describe(item)}
                    </span>
                    <time
                      dateTime={item.createdAt}
                      className="text-muted shrink-0 text-xs"
                      data-numeric
                    >
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </span>
                  {typeof item.payload.preview === "string" && (
                    <span className="text-muted mt-0.5 line-clamp-2 block text-xs">
                      {item.payload.preview}
                    </span>
                  )}
                </>
              );

              return (
                <li
                  key={item.id}
                  className={cn("px-4 py-3", !item.readAt && "bg-accent-soft/40")}
                >
                  {href ? (
                    <Link
                      href={href as never}
                      onClick={() => !item.readAt && markRead([item.id])}
                      className="block rounded-[--radius-sm]"
                    >
                      {body}
                    </Link>
                  ) : (
                    <span className="block">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function describe(item: Item): string {
  const actor = typeof item.payload.actor === "string" ? item.payload.actor : "Someone";
  const taskTitle =
    typeof item.payload.taskTitle === "string" ? item.payload.taskTitle : "a task";

  switch (item.type) {
    case "mention":
      return `${actor} mentioned you on ${taskTitle}`;
    case "comment":
      return `${actor} commented on ${taskTitle}`;
    case "assigned":
      return `${actor} assigned you ${taskTitle}`;
    case "due_soon":
      return `${taskTitle} is due soon`;
    default:
      return `Update on ${taskTitle}`;
  }
}
