"use client";

import { AnimatePresence, motion } from "motion/react";
import { Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { NO_MOTION, fade, slideInRight } from "@/lib/motion/config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";
import {
  addChecklistItem,
  deleteChecklistItem,
  deleteTask,
  setTaskAssignees,
  toggleChecklistItem,
  updateTask,
} from "@/lib/tasks/actions";
import {
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  taskRef,
} from "@/lib/tasks/display";
import type { TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";

export type TaskDetail = {
  id: string;
  number: number;
  title: string;
  descriptionText: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  startDate: string | null;
  estimateHours: string | null;
  project: { id: string; key: string; name: string };
  section: { id: string; name: string } | null;
  parentTask: { id: string; number: number; title: string } | null;
  createdBy: { fullName: string | null; email: string; avatarUrl: string | null };
  assignees: {
    profile: { id: string; fullName: string | null; email: string; avatarUrl: string | null };
  }[];
  labels: { label: { id: string; name: string } }[];
  subtasks: { id: string; number: number; title: string; completedAt: string | null }[];
  checklist: { id: string; title: string; isDone: boolean }[];
};

/**
 * Task detail, as a right-hand drawer.
 *
 * A drawer rather than a page because the list stays visible behind it —
 * people work through a list and want to keep their place. It IS deep-linkable
 * (`?task=<id>`), so a link to a task still works.
 *
 * Glass, since it genuinely floats over content. Focus moves into it on open
 * and returns to the trigger on close, and Escape closes it — a drawer that
 * traps keyboard users is worse than a page.
 */
export function TaskDrawer({
  task,
  members,
  canEdit,
  onClose,
  onMutated,
}: {
  task: TaskDetail | null;
  members: { id: string; fullName: string | null; email: string }[];
  canEdit: boolean;
  onClose: () => void;
  /**
   * Called after a successful change so the owner can refetch this task.
   *
   * Necessary because the drawer's fields are CONTROLLED by `task`, which is
   * fetched separately from the page's server data. `router.refresh()` updates
   * the list behind the drawer but not this object — so without a refetch a
   * status change would visibly snap back to the old value.
   */
  onMutated?: () => void;
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [newChecklistItem, setNewChecklistItem] = useState("");

  const open = Boolean(task);

  // Escape closes. Registered only while open so it cannot swallow Escape
  // from anything else.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Move focus into the panel so the next Tab lands inside it, not back in
  // the list behind.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, task?.id]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(undefined);
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Refresh the page behind, and refetch this task so the drawer's own
      // controlled fields reflect what was just saved.
      router.refresh();
      onMutated?.();
    });
  };

  return (
    <AnimatePresence>
      {open && task && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={fade}
        >
          <motion.button
            type="button"
            aria-label="Close task"
            onClick={onClose}
            className="scrim absolute inset-0 cursor-default"
            variants={fade}
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`${taskRef(task.project.key, task.number)} ${task.title}`}
            variants={reduced ? NO_MOTION.slideInRight : slideInRight}
            className="glass relative h-full w-full max-w-lg overflow-y-auto p-5 outline-none"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted text-xs" data-numeric>
                  {task.project.name} · {taskRef(task.project.key, task.number)}
                </p>
                {task.parentTask && (
                  <p className="text-muted mt-0.5 truncate text-xs">
                    Subtask of {taskRef(task.project.key, task.parentTask.number)}{" "}
                    {task.parentTask.title}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X />
              </Button>
            </div>

            <FormError message={error} />

            {/* Title — inline editable, committed on blur. */}
            <Input
              key={`title-${task.id}`}
              defaultValue={task.title}
              disabled={!canEdit || pending}
              aria-label="Title"
              className="font-display mb-4 h-auto border-transparent bg-transparent px-0 py-1 text-lg font-semibold hover:border-transparent"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== task.title) {
                  run(() => updateTask({ taskId: task.id, title: value }));
                }
              }}
            />

            <div className="mb-5 grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-muted text-xs font-medium">Status</span>
                <Select
                  value={task.status}
                  disabled={!canEdit || pending}
                  onChange={(e) =>
                    run(() => updateTask({ taskId: task.id, status: e.target.value }))
                  }
                >
                  {TASK_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_META[s].label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium">Priority</span>
                <Select
                  value={task.priority}
                  disabled={!canEdit || pending}
                  onChange={(e) =>
                    run(() => updateTask({ taskId: task.id, priority: e.target.value }))
                  }
                >
                  {TASK_PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {TASK_PRIORITY_META[p].label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium">Due date</span>
                <Input
                  type="date"
                  defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                  disabled={!canEdit || pending}
                  onChange={(e) =>
                    run(() =>
                      updateTask({
                        taskId: task.id,
                        // Empty means "clear it", which is null rather than
                        // undefined — undefined would leave it unchanged.
                        dueDate: e.target.value ? new Date(e.target.value) : null,
                      }),
                    )
                  }
                />
              </label>

              <label className="space-y-1">
                <span className="text-muted text-xs font-medium">Estimate (hours)</span>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  defaultValue={task.estimateHours ?? ""}
                  disabled={!canEdit || pending}
                  onBlur={(e) =>
                    run(() =>
                      updateTask({
                        taskId: task.id,
                        estimateHours: e.target.value ? Number(e.target.value) : null,
                      }),
                    )
                  }
                />
              </label>
            </div>

            {/* Assignees */}
            <div className="mb-5 space-y-1.5">
              <span className="text-muted text-xs font-medium">Assignees</span>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const isAssigned = task.assignees.some((a) => a.profile.id === m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!canEdit || pending}
                      aria-pressed={isAssigned}
                      onClick={() => {
                        const next = isAssigned
                          ? task.assignees
                              .filter((a) => a.profile.id !== m.id)
                              .map((a) => a.profile.id)
                          : [...task.assignees.map((a) => a.profile.id), m.id];
                        run(() => setTaskAssignees({ taskId: task.id, profileIds: next }));
                      }}
                      className={`flex items-center gap-1.5 rounded-[--radius-sm] px-1.5 py-1 text-xs ${
                        isAssigned ? "bg-accent-soft text-ink" : "text-muted hover:bg-surface-2"
                      }`}
                    >
                      <Avatar email={m.email} name={m.fullName} size="sm" />
                      {m.fullName ?? m.email}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description — plain text for now; Tiptap arrives in Phase 4
                alongside comments, which share the same editor. */}
            <div className="mb-5 space-y-1.5">
              <span className="text-muted text-xs font-medium">Description</span>
              <Textarea
                key={`desc-${task.id}`}
                defaultValue={task.descriptionText ?? ""}
                disabled={!canEdit || pending}
                placeholder="Add more detail…"
                aria-label="Description"
                onBlur={(e) =>
                  run(() =>
                    updateTask({
                      taskId: task.id,
                      descriptionText: e.target.value || null,
                    }),
                  )
                }
              />
            </div>

            {/* Checklist */}
            <div className="mb-5 space-y-2">
              <span className="text-muted text-xs font-medium">
                Checklist{" "}
                {task.checklist.length > 0 && (
                  <span data-numeric>
                    ({task.checklist.filter((i) => i.isDone).length}/{task.checklist.length})
                  </span>
                )}
              </span>

              {task.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.isDone}
                    disabled={!canEdit || pending}
                    aria-label={item.title}
                    className="accent-accent size-3.5"
                    onChange={(e) =>
                      run(() =>
                        toggleChecklistItem({ itemId: item.id, isDone: e.target.checked }),
                      )
                    }
                  />
                  <span
                    className={`flex-1 text-sm ${item.isDone ? "text-muted line-through" : ""}`}
                  >
                    {item.title}
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => run(() => deleteChecklistItem({ itemId: item.id }))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}

              {canEdit && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = newChecklistItem.trim();
                    if (!title) return;
                    setNewChecklistItem("");
                    run(() => addChecklistItem({ taskId: task.id, title }));
                  }}
                >
                  <Input
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    placeholder="Add a step…"
                    aria-label="New checklist item"
                    className="h-8"
                  />
                </form>
              )}
            </div>

            {/* Subtasks */}
            {task.subtasks.length > 0 && (
              <div className="mb-5 space-y-1.5">
                <span className="text-muted text-xs font-medium">
                  Subtasks{" "}
                  <span data-numeric>
                    ({task.subtasks.filter((s) => s.completedAt).length}/{task.subtasks.length})
                  </span>
                </span>
                {task.subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <Badge tone={s.completedAt ? "success" : "neutral"}>
                      {s.completedAt ? "Done" : "Open"}
                    </Badge>
                    <span className="truncate">{s.title}</span>
                  </div>
                ))}
              </div>
            )}

            {task.labels.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                {task.labels.map(({ label }) => (
                  <Badge key={label.id} tone="neutral">
                    {label.name}
                  </Badge>
                ))}
              </div>
            )}

            <div className="border-border flex items-center justify-between border-t pt-3">
              <span className="text-muted text-xs">
                Created by {task.createdBy.fullName ?? task.createdBy.email}
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      const result = await deleteTask({ taskId: task.id });
                      if (!result.ok) {
                        // Most often "this task has subtasks" — worth showing
                        // rather than failing silently.
                        setError(result.error);
                        return;
                      }
                      onClose();
                      router.refresh();
                    });
                  }}
                >
                  <Trash2 />
                  Delete task
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
