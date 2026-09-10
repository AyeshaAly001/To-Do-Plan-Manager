"use client";

import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { TaskDrawer, type TaskDetail } from "@/components/tasks/task-drawer";
import {
  TaskList,
  type GroupBy,
  type Member,
  type Section,
} from "@/components/tasks/task-list";
import type { TaskRowTask } from "@/components/tasks/task-row";
import { Select } from "@/components/ui/input";
import { fetchTaskDetail } from "@/lib/tasks/read-actions";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "section", label: "Section" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "due", label: "Due date" },
  { value: "none", label: "Nothing" },
];

const DUE_OPTIONS = [
  { value: "", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due this week" },
  { value: "none", label: "No due date" },
];

/**
 * Client shell for a project's task views.
 *
 * View state lives in the URL (`?group=status&due=overdue&task=<id>`) so a
 * filtered view is shareable and survives a refresh — which is the whole
 * reason the plan called for nuqs here.
 *
 * The filters that change WHICH ROWS are loaded (`due`, `assignee`) are
 * server-driven: changing them re-runs the query. Grouping is client-side,
 * because the filtered set is already in memory and a round trip would make
 * regrouping feel sluggish.
 */
export function ProjectView({
  projectId,
  tasks,
  sections,
  members,
  canEdit,
  nowIso,
}: {
  projectId: string;
  tasks: TaskRowTask[];
  sections: Section[];
  members: Member[];
  canEdit: boolean;
  /** The server's idea of "now", so both sides agree on what is overdue. */
  nowIso: string;
}) {
  const now = new Date(nowIso);

  const [group, setGroup] = useQueryState("group", {
    defaultValue: "section" as GroupBy,
    clearOnDefault: true,
    // Grouping is a view preference, not a navigation step — pushing history
    // entries would make Back cycle through groupings instead of leaving.
    history: "replace",
  });
  const [due, setDue] = useQueryState("due", {
    defaultValue: "",
    clearOnDefault: true,
    // Filters DO get history entries: Back undoing a filter is what people
    // expect.
    history: "push",
    shallow: false,
  });
  const [assignee, setAssignee] = useQueryState("assignee", {
    defaultValue: "",
    clearOnDefault: true,
    history: "push",
    shallow: false,
  });
  const [openTaskId, setOpenTaskId] = useQueryState("task", {
    defaultValue: "",
    clearOnDefault: true,
    history: "push",
  });

  const [detail, setDetail] = useState<TaskDetail | null>(null);

  /**
   * Loads the drawer's contents whenever the URL names a task.
   *
   * Driven by the URL rather than a click handler, so a pasted deep link
   * opens the drawer exactly like clicking a row does.
   *
   * Every setState here happens inside the async callback, never in the
   * effect body: a synchronous setState in an effect schedules a second
   * render pass on every run, which React 19 flags. Closing is handled by
   * DERIVING visibility below rather than clearing state imperatively.
   */
  useEffect(() => {
    if (!openTaskId) return;
    let cancelled = false;

    void fetchTaskDetail({ taskId: openTaskId }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) {
        setDetail(result.data as unknown as TaskDetail);
      } else {
        // A stale or unauthorised id: drop it from the URL rather than
        // leaving an empty drawer open.
        void setOpenTaskId("");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [openTaskId, setOpenTaskId]);

  // Derived, not stored: the drawer shows only when the loaded detail matches
  // the id in the URL. Stale detail can linger in state harmlessly, and
  // closing needs no state write at all.
  const openTask = openTaskId && detail?.id === openTaskId ? detail : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted">Group by</span>
          <Select
            value={group}
            onChange={(e) => void setGroup(e.target.value as GroupBy)}
            aria-label="Group by"
            className="h-8 w-32"
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>

        <Select
          value={due}
          onChange={(e) => void setDue(e.target.value)}
          aria-label="Filter by due date"
          className="h-8 w-40"
        >
          {DUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <Select
          value={assignee}
          onChange={(e) => void setAssignee(e.target.value)}
          aria-label="Filter by assignee"
          className="h-8 w-44"
        >
          <option value="">Anyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName ?? m.email}
            </option>
          ))}
        </Select>

        <span className="text-muted ml-auto text-xs" data-numeric>
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </span>
      </div>

      <TaskList
        projectId={projectId}
        tasks={tasks}
        sections={sections}
        members={members}
        groupBy={group as GroupBy}
        now={now}
        canEdit={canEdit}
        onOpenTask={(id) => void setOpenTaskId(id)}
      />

      <TaskDrawer
        task={openTask}
        members={members}
        canEdit={canEdit}
        onClose={() => void setOpenTaskId("")}
      />

      {openTaskId && !openTask && (
        <span className="sr-only" role="status">
          Loading task…
        </span>
      )}
    </div>
  );
}
