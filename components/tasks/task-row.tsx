"use client";

import { CheckSquare, ChevronRight, ListTree, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toggleTask, updateTask } from "@/lib/tasks/actions";
import {
  DUE_TONE,
  dueState,
  formatDue,
  isDone,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  taskRef,
} from "@/lib/tasks/display";
import { TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type TaskRowTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  /** Which section the task sits in; null means the project's ungrouped area. */
  sectionId: string | null;
  project: { key: string };
  assignees: {
    profile: { id: string; fullName: string | null; email: string; avatarUrl: string | null };
  }[];
  labels: { label: { id: string; name: string; color: string } }[];
  subtaskCount: number;
  checklistCount: number;
};

/**
 * One task in the List view.
 *
 * Two interactions are inline because they are the ones people do constantly:
 * ticking the checkbox and renaming the title. Everything else opens the
 * drawer — cramming status, priority, dates and assignees into a row makes it
 * unreadable and the controls too small to hit.
 *
 * The checkbox is optimistic via `useOptimistic`: the tick has to land
 * instantly or the list feels broken, and a failed write reverts when the
 * transition settles.
 */
export function TaskRow({
  task,
  now,
  selected,
  onSelectedChange,
  onOpen,
  depth = 0,
}: {
  task: TaskRowTask;
  /** Passed in so the server and client agree on "today". */
  now: Date;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onOpen: (taskId: string) => void;
  depth?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  const [optimisticDone, setOptimisticDone] = useOptimistic(
    isDone(task.status),
    (_current, next: boolean) => next,
  );

  /**
   * The rename has to show immediately.
   *
   * Without this the row re-renders from its (stale) `task.title` prop the
   * moment the editor closes, so a successful rename looks like it did
   * nothing until the next refresh. `router.refresh()` then reconciles with
   * the server, and a failed write reverts when the transition settles.
   */
  const [optimisticTitle, setOptimisticTitle] = useOptimistic(
    task.title,
    (_current, next: string) => next,
  );

  /** Enter fires onKeyDown and can then also fire onBlur; commit only once. */
  const committedRef = useRef<string | null>(null);

  const toggle = () => {
    const next = !optimisticDone;
    start(async () => {
      setOptimisticDone(next);
      await toggleTask({ taskId: task.id, done: next });
    });
  };

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    setEditing(false);

    // Nothing to do if unchanged, and an empty title is a mis-edit rather
    // than an instruction to blank the task.
    if (!trimmed || trimmed === optimisticTitle) {
      setTitleDraft(optimisticTitle);
      return;
    }
    if (committedRef.current === trimmed) return;
    committedRef.current = trimmed;

    start(async () => {
      setOptimisticTitle(trimmed);
      const result = await updateTask({ taskId: task.id, title: trimmed });
      committedRef.current = null;
      if (result.ok) router.refresh();
    });
  };

  const due = dueState(task.dueDate, now, task.completedAt);
  const priorityMeta = TASK_PRIORITY_META[task.priority];
  const statusMeta = TASK_STATUS_META[task.status];

  return (
    <div
      data-task-id={task.id}
      className={cn(
        "group hover:bg-surface-2 flex items-center gap-2.5 rounded-[--radius-md] px-2 py-1.5",
        "transition-colors duration-[--dur-fast] ease-[--ease-out]",
        selected && "bg-accent-soft hover:bg-accent-soft",
        pending && "opacity-70",
      )}
      style={depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : undefined}
    >
      {onSelectedChange && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={(e) => onSelectedChange(e.target.checked)}
          aria-label={`Select ${task.title}`}
          className="accent-accent size-3.5 shrink-0 cursor-pointer"
        />
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={optimisticDone}
        aria-label={optimisticDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onClick={toggle}
        className={cn(
          "border-border-strong grid size-4 shrink-0 place-items-center rounded-full border",
          "transition-colors duration-[--dur-fast] ease-[--ease-out]",
          optimisticDone
            ? "bg-success border-success text-accent-ink"
            : "hover:border-accent bg-transparent",
        )}
      >
        {optimisticDone && (
          <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
            <path
              d="M2 6.5 4.5 9 10 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Reference number: body font and tabular, because it is an identifier. */}
      <span className="text-muted hidden shrink-0 text-xs sm:inline" data-numeric>
        {taskRef(task.project.key, task.number)}
      </span>

      {editing ? (
        <Input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTitle();
            if (e.key === "Escape") {
              setTitleDraft(optimisticTitle);
              setEditing(false);
            }
          }}
          autoFocus
          aria-label="Task title"
          className="h-7 flex-1"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => onOpen(task.id)}
            className={cn(
              "min-w-0 flex-1 truncate rounded-[--radius-sm] text-left text-sm",
              optimisticDone && "text-muted line-through",
            )}
          >
            {optimisticTitle}
          </button>

          {/*
            Rename lives on its own control rather than a double-click on the
            title. Click-to-open and double-click-to-rename on the SAME element
            conflict: the first click of the double already opens the drawer,
            which then covers the row. A separate affordance is also
            discoverable and keyboard-reachable, which a double-click is not.
          */}
          {onSelectedChange && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Rename ${optimisticTitle}`}
              title="Rename"
              className={cn(
                "text-muted hover:text-ink shrink-0 rounded-[--radius-sm] p-1",
                "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </>
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        {task.subtaskCount > 0 && (
          <span
            className="text-muted flex items-center gap-0.5 text-xs"
            title={`${task.subtaskCount} subtasks`}
          >
            <ListTree className="size-3" />
            <span data-numeric>{task.subtaskCount}</span>
          </span>
        )}
        {task.checklistCount > 0 && (
          <span
            className="text-muted flex items-center gap-0.5 text-xs"
            title={`${task.checklistCount} checklist items`}
          >
            <CheckSquare className="size-3" />
            <span data-numeric>{task.checklistCount}</span>
          </span>
        )}

        {task.labels.slice(0, 2).map(({ label }) => (
          <Badge key={label.id} tone="neutral">
            {label.name}
          </Badge>
        ))}
        {task.labels.length > 2 && <Badge tone="neutral">+{task.labels.length - 2}</Badge>}

        {task.priority !== TaskPriority.NONE && (
          <Badge tone={priorityMeta.tone}>{priorityMeta.label}</Badge>
        )}

        {/* Status is shown only when it is not the default, to keep rows quiet. */}
        {task.status !== TaskStatus.TODO && !optimisticDone && (
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
        )}

        {task.dueDate && <Badge tone={DUE_TONE[due]}>{formatDue(task.dueDate, now)}</Badge>}

        <span className="flex -space-x-1.5">
          {task.assignees.slice(0, 3).map(({ profile }) => (
            <Avatar
              key={profile.id}
              src={profile.avatarUrl}
              name={profile.fullName}
              email={profile.email}
              size="sm"
              className="ring-surface ring-2"
            />
          ))}
        </span>

        <ChevronRight className="text-muted size-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </div>
  );
}
