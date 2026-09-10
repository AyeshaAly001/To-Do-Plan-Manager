"use client";

import { Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { QuickAdd, QuickAddCollapsed } from "@/components/tasks/quick-add";
import { TaskRow, type TaskRowTask } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { bulkDeleteTasks, bulkUpdateTasks } from "@/lib/tasks/actions";
import {
  dueState,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
} from "@/lib/tasks/display";
import { TaskStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type GroupBy = "section" | "status" | "priority" | "assignee" | "due" | "none";

export type Section = { id: string; name: string; wipLimit: number | null };
export type Member = { id: string; fullName: string | null; email: string };

/**
 * The List view.
 *
 * Grouping is computed client-side from the already-loaded tasks rather than
 * re-querying per group: the whole filtered set is in memory anyway, and a
 * round trip per group-by change would make switching feel sluggish.
 *
 * Selection is deliberately NOT in the URL. It is transient — nobody wants to
 * share a link that pre-selects fourteen tasks — while grouping and filters
 * are, because those describe a view worth sending to someone.
 */
export function TaskList({
  projectId,
  tasks,
  sections,
  members,
  groupBy,
  now,
  canEdit,
  onOpenTask,
}: {
  projectId: string;
  tasks: TaskRowTask[];
  sections: Section[];
  members: Member[];
  groupBy: GroupBy;
  now: Date;
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const groups = useMemo(
    () => groupTasks(tasks, sections, members, groupBy, now),
    [tasks, sections, members, groupBy, now],
  );

  const toggleSelected = (taskId: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const runBulk = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(undefined);
    start(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      clearSelection();
      router.refresh();
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="space-y-4">
        {canEdit && <QuickAdd projectId={projectId} members={members} />}
        <EmptyState
          title="Nothing here yet"
          description={
            canEdit
              ? "Add the first task above. Try typing a due date and priority inline."
              : "No tasks match the current filters."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormError message={error} />

      {canEdit && <QuickAdd projectId={projectId} members={members} />}

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`group-${group.key}`}>
            <div className="mb-1 flex items-center gap-2 px-2">
              <h3 id={`group-${group.key}`} className="font-display text-sm font-semibold">
                {group.label}
              </h3>
              <span className="text-muted text-xs" data-numeric>
                {group.tasks.length}
              </span>
              {/* A WIP limit is a soft signal, so it warns rather than blocks. */}
              {group.wipLimit != null && group.tasks.length > group.wipLimit && (
                <Badge tone="warning">over limit ({group.wipLimit})</Badge>
              )}
            </div>

            <div className="space-y-0.5">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  selected={selected.has(task.id)}
                  onSelectedChange={canEdit ? (v) => toggleSelected(task.id, v) : undefined}
                  onOpen={onOpenTask}
                />
              ))}

              {canEdit && groupBy === "section" && group.sectionId !== undefined && (
                <div className="pl-2">
                  <QuickAddCollapsed
                    projectId={projectId}
                    sectionId={group.sectionId}
                    members={members}
                  />
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Bulk action bar — glass, because it floats above the list. */}
      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className={cn(
            "glass fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-2xl flex-wrap items-center",
            "gap-2 rounded-[--radius-lg] p-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2",
          )}
        >
          <span className="px-2 text-sm font-medium" data-numeric>
            {selected.size} selected
          </span>

          <Select
            aria-label="Set status"
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const status = e.target.value as TaskStatus;
              if (!status) return;
              runBulk(() => bulkUpdateTasks({ taskIds: [...selected], status }));
            }}
            className="w-36"
          >
            <option value="">Set status…</option>
            {TASK_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_META[s].label}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Set priority"
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const priority = e.target.value;
              if (!priority) return;
              runBulk(() => bulkUpdateTasks({ taskIds: [...selected], priority }));
            }}
            className="w-36"
          >
            <option value="">Set priority…</option>
            {TASK_PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_META[p].label}
              </option>
            ))}
          </Select>

          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => runBulk(() => bulkDeleteTasks({ taskIds: [...selected] }))}
          >
            <Trash2 />
            Delete
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={clearSelection}
            aria-label="Clear selection"
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}

type Group = {
  key: string;
  label: string;
  tasks: TaskRowTask[];
  /** Present for section groups, so quick-add knows where to file the task. */
  sectionId?: string | null;
  wipLimit?: number | null;
};

/**
 * Buckets tasks for display.
 *
 * Empty groups are kept for sections (a column you can drop into must be
 * visible) but dropped for every other grouping, where a run of empty headings
 * is just noise.
 */
function groupTasks(
  tasks: TaskRowTask[],
  sections: Section[],
  members: Member[],
  groupBy: GroupBy,
  now: Date,
): Group[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "All tasks", tasks }];
  }

  if (groupBy === "section") {
    const bySection = new Map<string | null, TaskRowTask[]>();
    for (const task of tasks) {
      const key = task.sectionId ?? null;
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(task);
    }

    const groups: Group[] = sections.map((s) => ({
      key: s.id,
      label: s.name,
      tasks: bySection.get(s.id) ?? [],
      sectionId: s.id,
      wipLimit: s.wipLimit,
    }));

    const ungrouped = bySection.get(null) ?? [];
    if (ungrouped.length > 0) {
      groups.push({ key: "none", label: "No section", tasks: ungrouped, sectionId: null });
    }
    return groups;
  }

  if (groupBy === "status") {
    return TASK_STATUS_ORDER.map((status) => ({
      key: status,
      label: TASK_STATUS_META[status].label,
      tasks: tasks.filter((t) => t.status === status),
    })).filter((g) => g.tasks.length > 0);
  }

  if (groupBy === "priority") {
    return TASK_PRIORITY_ORDER.map((priority) => ({
      key: priority,
      label: TASK_PRIORITY_META[priority].label,
      tasks: tasks.filter((t) => t.priority === priority),
    })).filter((g) => g.tasks.length > 0);
  }

  if (groupBy === "assignee") {
    const groups: Group[] = members
      .map((m) => ({
        key: m.id,
        label: m.fullName ?? m.email,
        tasks: tasks.filter((t) => t.assignees.some((a) => a.profile.id === m.id)),
      }))
      .filter((g) => g.tasks.length > 0);

    const unassigned = tasks.filter((t) => t.assignees.length === 0);
    if (unassigned.length > 0) {
      groups.push({ key: "unassigned", label: "Unassigned", tasks: unassigned });
    }
    return groups;
  }

  // due
  const buckets: { key: string; label: string; match: (t: TaskRowTask) => boolean }[] = [
    {
      key: "overdue",
      label: "Overdue",
      match: (t) => dueState(t.dueDate, now, t.completedAt) === "overdue",
    },
    {
      key: "today",
      label: "Today",
      match: (t) => dueState(t.dueDate, now, t.completedAt) === "today",
    },
    {
      key: "soon",
      label: "Next few days",
      match: (t) => dueState(t.dueDate, now, t.completedAt) === "soon",
    },
    {
      key: "future",
      label: "Later",
      match: (t) => Boolean(t.dueDate) && dueState(t.dueDate, now, t.completedAt) === "future",
    },
    { key: "none", label: "No due date", match: (t) => !t.dueDate },
  ];

  return buckets
    .map((b) => ({ key: b.key, label: b.label, tasks: tasks.filter(b.match) }))
    .filter((g) => g.tasks.length > 0);
}
