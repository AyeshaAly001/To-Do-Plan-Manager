"use client";

import { CalendarDays, Columns3, List, Table2 } from "lucide-react";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BoardView } from "@/components/tasks/board-view";
import { CalendarView } from "@/components/tasks/calendar-view";
import { TableView } from "@/components/tasks/table-view";
import { TaskDrawer, type TaskDetail } from "@/components/tasks/task-drawer";
import {
  TaskList,
  type GroupBy,
  type Member,
  type Section,
} from "@/components/tasks/task-list";
import type { TaskRowTask } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime";
import { fetchTaskDetail } from "@/lib/tasks/read-actions";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "section", label: "Section" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "due", label: "Due date" },
  { value: "none", label: "Nothing" },
];

type ViewMode = "list" | "board" | "calendar" | "table";

const VIEWS: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: "list", label: "List", icon: List },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "table", label: "Table", icon: Table2 },
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
  projectName,
  currentUser,
  permissions,
}: {
  projectId: string;
  projectName: string;
  tasks: TaskRowTask[];
  sections: Section[];
  members: Member[];
  canEdit: boolean;
  /** The server's idea of "now", so both sides agree on what is overdue. */
  nowIso: string;
  currentUser: { id: string; name: string };
  permissions: {
    canComment: boolean;
    canModerateComments: boolean;
    canUpload: boolean;
    canDeleteAnyFile: boolean;
  };
}) {
  // Memoised for the same reason as in the calendar: this Date is passed into
  // TaskList, whose grouping useMemo depends on it. A fresh object each render
  // would rebuild every group on every render. ESLint only flags the case
  // where the memo is in the SAME file, so this one has to be caught by hand.
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const [view, setView] = useQueryState("view", {
    defaultValue: "list" as ViewMode,
    clearOnDefault: true,
    // Which view you are in IS a navigation step — Back should return you to
    // the list, not out of the project.
    history: "push",
  });

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

  const router = useRouter();

  /**
   * Live task updates for everyone looking at this project.
   *
   * The event carries no row data (RLS is deny-all for the browser key), so a
   * change simply triggers a refetch through the authorized server path. The
   * board holds an `override` during a drag which takes precedence over server
   * data, so refreshing mid-drag cannot yank a card out from under the cursor.
   */
  const { version: taskVersion } = useRealtimeChannel({
    channel: `project:${projectId}`,
    tables: ["tasks"],
  });

  // Skip the first tick: `version` starts at 0 and refreshing on mount would
  // duplicate the render the server just did.
  const lastVersion = useRef(0);
  useEffect(() => {
    if (taskVersion === lastVersion.current) return;
    lastVersion.current = taskVersion;
    router.refresh();
  }, [taskVersion, router]);

  const [detail, setDetail] = useState<TaskDetail | null>(null);

  /** Re-reads the open task, so the drawer's controlled fields stay truthful. */
  const reloadDetail = useCallback(() => {
    if (!openTaskId) return;
    void fetchTaskDetail({ taskId: openTaskId }).then((result) => {
      if (result.ok && result.data) setDetail(result.data as unknown as TaskDetail);
    });
  }, [openTaskId]);

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
      {/* View switcher — a tablist, so arrow keys move between views. */}
      <div role="tablist" aria-label="View" className="flex flex-wrap gap-1">
        {VIEWS.map(({ value, label, icon: Icon }) => {
          const selected = view === value;
          return (
            <button
              key={value}
              role="tab"
              aria-selected={selected}
              onClick={() => void setView(value)}
              className={
                "font-display flex items-center gap-1.5 rounded-[--radius-md] px-2.5 py-1.5 text-sm font-medium " +
                "transition-colors duration-[--dur-fast] ease-[--ease-out] " +
                (selected
                  ? "bg-accent-soft text-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink")
              }
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Grouping only means something in the List view. */}
        {view === "list" && (
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
        )}

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

        <span className="ml-auto flex items-center gap-2">
          {/* Only shown once something has actually arrived, so it reads as
              "this is live" rather than as permanent chrome. */}
          {taskVersion > 0 && <Badge tone="info">Updated live</Badge>}
          <span className="text-muted text-xs" data-numeric>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
        </span>
      </div>

      {view === "list" && (
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
      )}

      {view === "board" && (
        <BoardView
          projectId={projectId}
          tasks={tasks}
          sections={sections}
          members={members}
          canEdit={canEdit}
          nowIso={nowIso}
          onOpenTask={(id) => void setOpenTaskId(id)}
        />
      )}

      {view === "calendar" && (
        <CalendarView
          tasks={tasks}
          nowIso={nowIso}
          canEdit={canEdit}
          onOpenTask={(id) => void setOpenTaskId(id)}
        />
      )}

      {view === "table" && (
        <TableView
          tasks={tasks}
          nowIso={nowIso}
          projectName={projectName}
          onOpenTask={(id) => void setOpenTaskId(id)}
        />
      )}

      <TaskDrawer
        task={openTask}
        members={members}
        canEdit={canEdit}
        onClose={() => void setOpenTaskId("")}
        onMutated={reloadDetail}
        currentUser={currentUser}
        permissions={permissions}
      />

      {openTaskId && !openTask && (
        <span className="sr-only" role="status">
          Loading task…
        </span>
      )}
    </div>
  );
}
