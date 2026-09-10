"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { TaskRowTask } from "@/components/tasks/task-row";
import { TaskRow } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/field";
import { updateTask } from "@/lib/tasks/actions";
import { cn } from "@/lib/utils";

export type MyTasksBuckets = {
  overdue: TaskRowTask[];
  today: TaskRowTask[];
  week: TaskRowTask[];
  later: TaskRowTask[];
  undated: TaskRowTask[];
};

type BucketKey = keyof MyTasksBuckets;

/**
 * Buckets, and what dropping into one means.
 *
 * `dueDateFor` is the point: dragging between buckets is a way to reschedule,
 * so each bucket has to define a concrete date. "Overdue" has none — you
 * cannot deliberately make something late — so it refuses drops, which is
 * clearer than silently doing nothing.
 */
const BUCKETS: {
  key: BucketKey;
  label: string;
  tone: "danger" | "warning" | "neutral" | "info";
  dueDateFor: ((now: Date) => Date) | null;
}[] = [
  { key: "overdue", label: "Overdue", tone: "danger", dueDateFor: null },
  {
    key: "today",
    label: "Today",
    tone: "warning",
    dueDateFor: (now) => atNoon(now, 0),
  },
  {
    key: "week",
    label: "Next 7 days",
    tone: "info",
    dueDateFor: (now) => atNoon(now, 1),
  },
  {
    key: "later",
    label: "Later",
    tone: "neutral",
    // Just past the 7-day window, so the task actually lands in this bucket.
    dueDateFor: (now) => atNoon(now, 8),
  },
  { key: "undated", label: "No due date", tone: "neutral", dueDateFor: null },
];

/** Noon rather than midnight: a midnight date can slip a day across timezones. */
function atNoon(now: Date, addDays: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + addDays);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * My Tasks — everything assigned to you, across every project you can see.
 *
 * Grouped by when it is due rather than by project, because the question this
 * page answers is "what should I do next", and that is a time question.
 *
 * Dragging between buckets rewrites the due date. Native drag rather than
 * dnd-kit: there is no reordering here, only "which bucket did it land in".
 * Every task also opens in the drawer, where the date is an ordinary input —
 * drag is never the only way.
 */
export function MyTasksView({
  buckets,
  nowIso,
  canEdit,
  onOpenTask,
}: {
  buckets: MyTasksBuckets;
  nowIso: string;
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [dragOver, setDragOver] = useState<BucketKey | null>(null);

  const total = Object.values(buckets).reduce((sum, list) => sum + list.length, 0);

  const reschedule = (taskId: string, bucket: (typeof BUCKETS)[number]) => {
    if (!bucket.dueDateFor) return;
    setError(undefined);
    const dueDate = bucket.dueDateFor(now);

    start(async () => {
      const result = await updateTask({ taskId, dueDate });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  if (total === 0) {
    return (
      <EmptyState
        title="Nothing assigned to you"
        description="When someone assigns you a task it will show up here, grouped by when it is due."
      />
    );
  }

  return (
    <div className={cn("space-y-6", pending && "opacity-90")}>
      <FormError message={error} />

      {BUCKETS.map((bucket) => {
        const tasks = buckets[bucket.key];
        // Empty buckets are hidden unless they can be dropped into — an empty
        // "Overdue" heading is good news, not information.
        if (tasks.length === 0 && !bucket.dueDateFor) return null;

        const droppable = canEdit && Boolean(bucket.dueDateFor);

        return (
          <section
            key={bucket.key}
            aria-labelledby={`bucket-${bucket.key}`}
            onDragOver={
              droppable
                ? (e) => {
                    e.preventDefault();
                    setDragOver(bucket.key);
                  }
                : undefined
            }
            onDragLeave={droppable ? () => setDragOver(null) : undefined}
            onDrop={
              droppable
                ? (e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const taskId = e.dataTransfer.getData("text/task-id");
                    if (taskId) reschedule(taskId, bucket);
                  }
                : undefined
            }
            className={cn(
              "rounded-[--radius-lg] p-2 transition-colors duration-[--dur-fast]",
              dragOver === bucket.key && "bg-accent-soft",
            )}
          >
            <div className="mb-1 flex items-center gap-2 px-2">
              <h3 id={`bucket-${bucket.key}`} className="font-display text-sm font-semibold">
                {bucket.label}
              </h3>
              <Badge tone={bucket.tone}>{tasks.length}</Badge>
              {droppable && tasks.length === 0 && (
                <span className="text-muted text-xs">Drop a task here to reschedule it</span>
              )}
            </div>

            <div className="space-y-0.5">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/task-id", task.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <TaskRow task={task} now={now} onOpen={onOpenTask} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
