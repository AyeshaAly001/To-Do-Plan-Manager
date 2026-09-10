import { describe, expect, it } from "vitest";

import {
  DUE_TONE,
  dueState,
  formatDue,
  isDone,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  taskRef,
} from "@/lib/tasks/display";
import { TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";

const NOW = new Date(2026, 8, 10, 14, 0, 0, 0); // Thu 10 Sep 2026, 14:00
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h);

describe("metadata tables", () => {
  it("labels every status and priority", () => {
    // A missing entry would render an empty badge, which reads as a bug.
    for (const status of Object.values(TaskStatus)) {
      expect(TASK_STATUS_META[status]?.label, status).toBeTruthy();
    }
    for (const priority of Object.values(TaskPriority)) {
      expect(TASK_PRIORITY_META[priority]?.label, priority).toBeTruthy();
    }
  });

  it("orders every status and priority exactly once", () => {
    expect(new Set(TASK_STATUS_ORDER).size).toBe(Object.values(TaskStatus).length);
    expect(new Set(TASK_PRIORITY_ORDER).size).toBe(Object.values(TaskPriority).length);
  });

  it("puts the most urgent priority first", () => {
    expect(TASK_PRIORITY_ORDER[0]).toBe(TaskPriority.URGENT);
    expect(TASK_PRIORITY_ORDER.at(-1)).toBe(TaskPriority.NONE);
  });
});

describe("isDone", () => {
  it("counts cancelled as finished", () => {
    // Cancelled work should leave the active list too — it is not pending.
    expect(isDone(TaskStatus.DONE)).toBe(true);
    expect(isDone(TaskStatus.CANCELLED)).toBe(true);
    expect(isDone(TaskStatus.TODO)).toBe(false);
    expect(isDone(TaskStatus.BLOCKED)).toBe(false);
  });
});

describe("dueState", () => {
  it("is none without a date", () => {
    expect(dueState(null, NOW)).toBe("none");
    expect(dueState(undefined, NOW)).toBe("none");
  });

  it("flags a past date as overdue", () => {
    expect(dueState(at(2026, 8, 9), NOW)).toBe("overdue");
  });

  it("treats earlier today as today, not overdue", () => {
    // 09:00 today has passed, but the task is due TODAY — calling it overdue
    // at 14:00 would be wrong and alarming.
    expect(dueState(at(2026, 8, 10, 9), NOW)).toBe("today");
  });

  it("marks the next two days as soon", () => {
    expect(dueState(at(2026, 8, 11), NOW)).toBe("soon");
    expect(dueState(at(2026, 8, 12), NOW)).toBe("soon");
  });

  it("marks anything further out as future", () => {
    expect(dueState(at(2026, 8, 20), NOW)).toBe("future");
  });

  it("never calls a completed task overdue", () => {
    // It may have been late, but it is not something to act on, and a
    // permanently red row is just noise.
    expect(dueState(at(2026, 8, 1), NOW, at(2026, 8, 2))).toBe("future");
  });

  it("has a tone for every state", () => {
    for (const state of ["overdue", "today", "soon", "future", "none"] as const) {
      expect(DUE_TONE[state]).toBeTruthy();
    }
  });
});

describe("formatDue", () => {
  it("uses words for the days people act on", () => {
    expect(formatDue(at(2026, 8, 10), NOW)).toBe("Today");
    expect(formatDue(at(2026, 8, 11), NOW)).toBe("Tomorrow");
    expect(formatDue(at(2026, 8, 9), NOW)).toBe("Yesterday");
  });

  it("uses a weekday inside the coming week", () => {
    // Saturday 12 Sep. Requires no arithmetic to act on.
    expect(formatDue(at(2026, 8, 12), NOW)).toMatch(/^(Sat|Saturday)/);
  });

  it("uses a date further out", () => {
    // "in 24 days" would require mental arithmetic.
    expect(formatDue(at(2026, 9, 4), NOW)).toMatch(/Oct/);
  });

  it("includes the year only when it differs", () => {
    expect(formatDue(at(2026, 11, 25), NOW)).not.toMatch(/2026/);
    expect(formatDue(at(2027, 0, 15), NOW)).toMatch(/2027/);
  });

  it("accepts an ISO string as well as a Date", () => {
    // Server components serialise dates to strings across the boundary.
    expect(formatDue(at(2026, 8, 10).toISOString(), NOW)).toBe("Today");
  });
});

describe("taskRef", () => {
  it("formats the human reference", () => {
    expect(taskRef("ASH", 42)).toBe("ASH-42");
  });
});
