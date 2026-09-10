"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { TaskRowTask } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { updateTask } from "@/lib/tasks/actions";
import { TASK_PRIORITY_META, isDone } from "@/lib/tasks/display";
import { TaskPriority } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * Month calendar, with tasks on their due date.
 *
 * Drag-to-reschedule uses the native HTML drag API rather than dnd-kit. The
 * board needs sortable reordering within a list, which is what dnd-kit is for;
 * here the only question is "which day did it land on", and native drag gives
 * that for free without a second drag system's worth of state.
 *
 * A keyboard alternative is provided regardless: each task is a button that
 * opens the drawer, where the due date is an ordinary date input. Drag is
 * never the only way to reschedule.
 */
export function CalendarView({
  tasks,
  nowIso,
  canEdit,
  onOpenTask,
}: {
  tasks: TaskRowTask[];
  nowIso: string;
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const router = useRouter();
  // Memoised on the ISO string: a fresh Date each render would change the
  // identity of every dependency array below it, so the month grid would be
  // rebuilt on every render and the useMemo would buy nothing.
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Which month is on screen, as an offset from the current one — so "today"
  // stays correct when the month changes.
  const [monthOffset, setMonthOffset] = useState(0);

  const viewMonth = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now, monthOffset]);

  /** Six weeks from the Monday on or before the 1st — a stable 42-cell grid. */
  const days = useMemo(() => {
    const first = new Date(viewMonth);
    // getDay() is 0=Sunday; shift so Monday starts the week.
    const weekdayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(start.getDate() - weekdayOffset);

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [viewMonth]);

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const byDay = useMemo(() => {
    const map = new Map<string, TaskRowTask[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = dayKey(new Date(task.dueDate));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return map;
  }, [tasks]);

  const todayKey = dayKey(now);
  const undated = tasks.filter((t) => !t.dueDate);

  const reschedule = (taskId: string, day: Date) => {
    setError(undefined);
    // Noon, not midnight: a date-only value at midnight can slip to the
    // previous day once a timezone offset is applied.
    const due = new Date(day);
    due.setHours(12, 0, 0, 0);

    start(async () => {
      const result = await updateTask({ taskId, dueDate: due });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <FormError message={error} />

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMonthOffset((v) => v - 1)}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <h3 className="font-display min-w-40 text-center text-sm font-semibold">
          {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMonthOffset((v) => v + 1)}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
        {monthOffset !== 0 && (
          <Button variant="secondary" size="sm" onClick={() => setMonthOffset(0)}>
            Today
          </Button>
        )}
        {canEdit && (
          <span className="text-muted ml-auto text-xs">
            Drag a task to another day to reschedule it
          </span>
        )}
      </div>

      {/* Wide content scrolls inside its own container, never the page. */}
      <div className="overflow-x-auto">
        <div className={cn("min-w-[44rem]", pending && "opacity-90")}>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <div key={label} className="text-muted px-1 text-xs font-medium">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = dayKey(day);
              const dayTasks = byDay.get(key) ?? [];
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  onDragOver={
                    canEdit
                      ? (e) => {
                          // preventDefault is what marks the cell as a valid
                          // drop target; without it the drop never fires.
                          e.preventDefault();
                          setDragOverKey(key);
                        }
                      : undefined
                  }
                  onDragLeave={canEdit ? () => setDragOverKey(null) : undefined}
                  onDrop={
                    canEdit
                      ? (e) => {
                          e.preventDefault();
                          setDragOverKey(null);
                          const taskId = e.dataTransfer.getData("text/task-id");
                          if (taskId) reschedule(taskId, day);
                        }
                      : undefined
                  }
                  className={cn(
                    "border-border min-h-24 rounded-[--radius-md] border p-1",
                    inMonth ? "bg-surface" : "bg-surface-2/50",
                    isToday && "ring-accent ring-2",
                    dragOverKey === key && "bg-accent-soft",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span
                      className={cn(
                        "text-xs",
                        isToday ? "text-accent font-semibold" : "text-muted",
                        !inMonth && "opacity-50",
                      )}
                      data-numeric
                    >
                      {day.getDate()}
                    </span>
                    {dayTasks.length > 3 && (
                      <span className="text-muted text-[0.625rem]" data-numeric>
                        {dayTasks.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/task-id", task.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onOpenTask(task.id)}
                        className={cn(
                          "block w-full truncate rounded-[--radius-sm] px-1 py-0.5 text-left text-[0.6875rem]",
                          "hover:bg-surface-2",
                          isDone(task.status) && "text-muted line-through",
                          task.priority === TaskPriority.URGENT ||
                            task.priority === TaskPriority.HIGH
                            ? "bg-danger/15 text-danger"
                            : "bg-surface-2 text-ink",
                        )}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-muted block px-1 text-[0.625rem]">
                        +{dayTasks.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Undated tasks are draggable INTO the calendar, which is how they get
          a date in the first place. */}
      {undated.length > 0 && (
        <div className="bg-surface-2 space-y-2 rounded-[--radius-lg] p-3">
          <h4 className="font-display text-sm font-semibold">
            No due date{" "}
            <span className="text-muted text-xs" data-numeric>
              {undated.length}
            </span>
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((task) => (
              <button
                key={task.id}
                type="button"
                draggable={canEdit}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/task-id", task.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onOpenTask(task.id)}
                className="bg-surface border-border hover:elev-hover flex items-center gap-1.5 rounded-[--radius-md] border px-2 py-1 text-xs"
              >
                <span className="max-w-48 truncate">{task.title}</span>
                {task.priority !== TaskPriority.NONE && (
                  <Badge tone={TASK_PRIORITY_META[task.priority].tone}>
                    {TASK_PRIORITY_META[task.priority].label}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
