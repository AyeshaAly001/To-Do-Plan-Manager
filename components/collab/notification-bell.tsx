"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NO_MOTION, scaleFade } from "@/lib/motion/config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";
import { fetchUnreadCount, markNotificationsRead } from "@/lib/collab/read-actions";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

/**
 * Unread-notification bell.
 *
 * The count is seeded from the server render and then polled, rather than
 * subscribed to. `notifications` is deliberately NOT in the realtime
 * publication: it is per-person, so a channel would either be one per user
 * (a lot of channels) or one shared channel leaking other people's events.
 * A 60-second poll on one indexed COUNT is the cheaper, simpler trade — and
 * a notification arriving up to a minute late is not a problem worth
 * engineering around.
 */
export function NotificationBell({
  initialUnread,
  initialItems,
}: {
  initialUnread: number;
  initialItems: NotificationItem[];
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState(initialItems);
  const [, start] = useTransition();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Poll the count. All state writes happen inside the timer callback, never
  // synchronously in the effect body.
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchUnreadCount({}).then((result) => {
        if (result.ok) setUnread(result.data);
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Escape and outside-click, attached only while open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const markAllRead = () => {
    start(async () => {
      const result = await markNotificationsRead({});
      if (result.ok) {
        setUnread(0);
        setItems((current) =>
          current.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        );
        router.refresh();
      }
    });
  };

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // The count is in the label, not just the badge — a screen reader
        // otherwise announces "Notifications" with no idea there are five.
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <span className="relative">
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-danger text-accent-ink absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[0.625rem] font-semibold"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={reduced ? NO_MOTION.scaleFade : scaleFade}
            className="glass absolute top-full right-0 z-40 mt-1 w-80 origin-top-right rounded-[--radius-lg] p-1"
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="font-display text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <>
                  <Badge tone="danger">{unread}</Badge>
                  <Button variant="ghost" size="sm" onClick={markAllRead} className="ml-auto">
                    <Check />
                    Mark all read
                  </Button>
                </>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-muted px-2 py-6 text-center text-sm">
                Nothing yet. Mentions and comments will show up here.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {items.slice(0, 12).map((item) => {
                  const payload = item.payload ?? {};
                  const projectId =
                    typeof payload.projectId === "string" ? payload.projectId : null;
                  const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
                  const href =
                    projectId && taskId ? `/projects/${projectId}?task=${taskId}` : "/inbox";

                  return (
                    <li key={item.id}>
                      <Link
                        href={href as never}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "hover:bg-surface-2 block rounded-[--radius-md] px-2 py-2",
                          !item.readAt && "bg-accent-soft/60",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {!item.readAt && (
                            <span
                              aria-hidden
                              className="bg-accent size-1.5 shrink-0 rounded-full"
                            />
                          )}
                          <span className="truncate text-xs font-medium">{describe(item)}</span>
                        </span>
                        {typeof payload.preview === "string" && (
                          <span className="text-muted mt-0.5 line-clamp-2 block text-xs">
                            {payload.preview}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-border mt-1 border-t pt-1">
              <Link
                href="/inbox"
                onClick={() => setOpen(false)}
                className="hover:bg-surface-2 block rounded-[--radius-md] px-2 py-1.5 text-center text-xs"
              >
                Open inbox
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One human sentence per notification type. */
function describe(item: NotificationItem): string {
  const payload = item.payload ?? {};
  const actor = typeof payload.actor === "string" ? payload.actor : "Someone";
  const taskTitle = typeof payload.taskTitle === "string" ? payload.taskTitle : "a task";

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
      // Better than rendering a raw type name if a new one appears before the
      // UI knows about it.
      return `Update on ${taskTitle}`;
  }
}
