"use client";

import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { useMemo, useState } from "react";

import type { TaskRowTask } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_PRIORITY_ORDER,
  formatDue,
  taskRef,
} from "@/lib/tasks/display";
import { TaskPriority } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

type SortKey = "number" | "title" | "status" | "priority" | "dueDate" | "assignees";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "number", label: "ID", numeric: true },
  { key: "title", label: "Task" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "dueDate", label: "Due", numeric: true },
  { key: "assignees", label: "Assignees" },
];

/**
 * Spreadsheet-style view.
 *
 * Sorting is done here rather than server-side because the filtered set is
 * already loaded; re-querying to reverse a column would be a round trip for
 * something instant.
 *
 * Hand-rolled rather than TanStack Table: what this actually needs is sorting
 * and CSV export over six known columns. A headless table library earns its
 * weight with column resizing, virtualization and dynamic column defs, which
 * belong with the custom-fields work in Phase 6 — pulling it in now would be
 * an abstraction with nothing to abstract.
 */
export function TableView({
  tasks,
  nowIso,
  projectName,
  onOpenTask,
}: {
  tasks: TaskRowTask[];
  nowIso: string;
  projectName: string;
  onOpenTask: (taskId: string) => void;
}) {
  const now = new Date(nowIso);
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;

    return [...tasks].sort((a, b) => {
      switch (sortKey) {
        case "number":
          return (a.number - b.number) * factor;
        case "title":
          return a.title.localeCompare(b.title) * factor;
        case "status":
          return a.status.localeCompare(b.status) * factor;
        case "priority": {
          // Sort by real urgency, not alphabetically — "HIGH" before "LOW"
          // alphabetically is meaningless to a reader.
          const rank = (p: TaskPriority) => TASK_PRIORITY_ORDER.indexOf(p);
          return (rank(a.priority) - rank(b.priority)) * factor;
        }
        case "dueDate": {
          // Undated always sorts last, whichever direction — an empty cell is
          // not "earliest".
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) * factor;
        }
        case "assignees":
          return (a.assignees.length - b.assignees.length) * factor;
        default:
          return 0;
      }
    });
  }, [tasks, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    /**
     * RFC 4180 quoting: wrap every field and double any inner quote. Task
     * titles contain commas, quotes and newlines routinely, and a naive
     * join(",") silently corrupts the file.
     */
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = [
      ["ID", "Title", "Status", "Priority", "Due date", "Assignees", "Labels"],
      ...sorted.map((t) => [
        taskRef(t.project.key, t.number),
        t.title,
        TASK_STATUS_META[t.status].label,
        TASK_PRIORITY_META[t.priority].label,
        t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
        t.assignees.map((a) => a.profile.fullName ?? a.profile.email).join("; "),
        t.labels.map((l) => l.label.name).join("; "),
      ]),
    ];

    const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
    // BOM so Excel reads it as UTF-8 rather than mangling non-ASCII names.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-tasks.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs" data-numeric>
          {sorted.length} {sorted.length === 1 ? "row" : "rows"}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={exportCsv}
          disabled={sorted.length === 0}
        >
          <Download />
          Export CSV
        </Button>
      </div>

      {/* Wide table scrolls in its own container; the page never scrolls
          sideways. */}
      <div className="border-border overflow-x-auto rounded-[--radius-lg] border">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-surface-2">
            <tr>
              {COLUMNS.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th key={col.key} scope="col" className="p-0 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      // aria-sort on the header tells a screen reader the
                      // current order, which the arrow icon alone does not.
                      className="text-muted hover:text-ink flex w-full items-center gap-1 px-3 py-2 text-xs font-medium"
                    >
                      {col.label}
                      {active &&
                        (sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => (
              <tr
                key={task.id}
                className="border-border hover:bg-surface-2 border-t"
                aria-selected={false}
              >
                <td className="text-muted px-3 py-2 text-xs whitespace-nowrap" data-numeric>
                  {taskRef(task.project.key, task.number)}
                </td>
                <td className="max-w-md px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="truncate rounded-[--radius-sm] text-left"
                  >
                    {task.title}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={TASK_STATUS_META[task.status].tone}>
                    {TASK_STATUS_META[task.status].label}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {task.priority !== TaskPriority.NONE && (
                    <Badge tone={TASK_PRIORITY_META[task.priority].tone}>
                      {TASK_PRIORITY_META[task.priority].label}
                    </Badge>
                  )}
                </td>
                <td className={cn("px-3 py-2 text-xs whitespace-nowrap")} data-numeric>
                  {task.dueDate ? formatDue(task.dueDate, now) : "—"}
                </td>
                <td className="text-muted px-3 py-2 text-xs">
                  {task.assignees.length === 0
                    ? "—"
                    : task.assignees
                        .map((a) => a.profile.fullName ?? a.profile.email)
                        .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
