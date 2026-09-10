import { TaskPriority, TaskStatus, ProjectStatus } from "@/lib/generated/prisma/enums";
import type { BadgeProps } from "@/components/ui/badge";

/**
 * How statuses and priorities are labelled and coloured.
 *
 * One table so the List view, board, drawer and dashboards cannot drift into
 * calling the same state different things. Every entry carries a LABEL as well
 * as a tone — status is never encoded by colour alone (WCAG 1.4.1), which
 * matters here because the clay accent and `danger` are close in hue.
 */

type Tone = NonNullable<BadgeProps["tone"]>;

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: Tone }> = {
  [TaskStatus.TODO]: { label: "To do", tone: "neutral" },
  [TaskStatus.IN_PROGRESS]: { label: "In progress", tone: "info" },
  [TaskStatus.IN_REVIEW]: { label: "In review", tone: "accent" },
  [TaskStatus.BLOCKED]: { label: "Blocked", tone: "danger" },
  [TaskStatus.DONE]: { label: "Done", tone: "success" },
  [TaskStatus.CANCELLED]: { label: "Cancelled", tone: "neutral" },
};

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; tone: Tone }> = {
  // NONE is deliberately unlabelled in the UI — showing "Priority: none" on
  // every row is noise. The badge is simply omitted.
  [TaskPriority.NONE]: { label: "None", tone: "neutral" },
  [TaskPriority.LOW]: { label: "Low", tone: "info" },
  [TaskPriority.MEDIUM]: { label: "Medium", tone: "warning" },
  [TaskPriority.HIGH]: { label: "High", tone: "danger" },
  [TaskPriority.URGENT]: { label: "Urgent", tone: "danger" },
};

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  [ProjectStatus.PLANNING]: { label: "Planning", tone: "neutral" },
  [ProjectStatus.ACTIVE]: { label: "Active", tone: "success" },
  [ProjectStatus.ON_HOLD]: { label: "On hold", tone: "warning" },
  [ProjectStatus.COMPLETED]: { label: "Completed", tone: "info" },
  [ProjectStatus.ARCHIVED]: { label: "Archived", tone: "neutral" },
};

/** Statuses the user can pick, in the order work actually flows. */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.BLOCKED,
  TaskStatus.DONE,
  TaskStatus.CANCELLED,
];

/** Most urgent first, which is how a priority menu should read. */
export const TASK_PRIORITY_ORDER: TaskPriority[] = [
  TaskPriority.URGENT,
  TaskPriority.HIGH,
  TaskPriority.MEDIUM,
  TaskPriority.LOW,
  TaskPriority.NONE,
];

export const isDone = (status: TaskStatus) =>
  status === TaskStatus.DONE || status === TaskStatus.CANCELLED;

export type DueState = "overdue" | "today" | "soon" | "future" | "none";

/**
 * How a due date should read relative to now.
 *
 * A completed task is never "overdue": it may have been late, but it is not
 * something to act on, and colouring it red forever is just noise.
 */
export function dueState(
  dueDate: Date | string | null | undefined,
  now: Date,
  completedAt?: Date | string | null,
): DueState {
  if (!dueDate) return "none";
  if (completedAt) return "future";

  const due = new Date(dueDate);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const inThreeDays = new Date(startOfToday);
  inThreeDays.setDate(inThreeDays.getDate() + 3);

  if (due < startOfToday) return "overdue";
  if (due < startOfTomorrow) return "today";
  if (due < inThreeDays) return "soon";
  return "future";
}

export const DUE_TONE: Record<DueState, Tone> = {
  overdue: "danger",
  today: "warning",
  soon: "warning",
  future: "neutral",
  none: "neutral",
};

/**
 * Short, human due-date text.
 *
 * "Today"/"Tomorrow"/"Yesterday" rather than a date, because that is how
 * people read a task list. Anything further out gets an actual date, since
 * "in 9 days" requires mental arithmetic to act on.
 */
export function formatDue(dueDate: Date | string, now: Date): string {
  const due = new Date(dueDate);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);

  const days = Math.round((dueDay.getTime() - startOfToday.getTime()) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) {
    return due.toLocaleDateString(undefined, { weekday: "short" });
  }

  const sameYear = due.getFullYear() === now.getFullYear();
  return due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** ASH-42 */
export const taskRef = (projectKey: string, number: number) => `${projectKey}-${number}`;
