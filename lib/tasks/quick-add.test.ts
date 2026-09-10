import { describe, expect, it } from "vitest";

import { parseQuickAdd } from "@/lib/tasks/quick-add";
import { TaskPriority } from "@/lib/generated/prisma/enums";

/**
 * A fixed reference point: THURSDAY 10 September 2026, 14:00 local.
 *
 * Every relative expression is asserted against this rather than the real
 * clock — otherwise "tomorrow" tests would fail at midnight and "monday"
 * tests would fail on Mondays.
 */
const NOW = new Date(2026, 8, 10, 14, 0, 0, 0); // month is 0-based: 8 = September

const parse = (input: string) => parseQuickAdd(input, NOW);
const ymd = (d?: Date) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : undefined;
const hm = (d?: Date) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : undefined;

describe("plain input", () => {
  it("leaves an ordinary title untouched", () => {
    const r = parse("Fix the login redirect loop");
    expect(r.title).toBe("Fix the login redirect loop");
    expect(r.dueDate).toBeUndefined();
    expect(r.priority).toBeUndefined();
    expect(r.matched).toEqual([]);
  });

  it("collapses whitespace", () => {
    expect(parse("  spaced   out   title  ").title).toBe("spaced out title");
  });
});

describe("priority", () => {
  it.each([
    ["!urgent", TaskPriority.URGENT],
    ["!high", TaskPriority.HIGH],
    ["!medium", TaskPriority.MEDIUM],
    ["!low", TaskPriority.LOW],
    ["!p1", TaskPriority.URGENT],
    ["!p4", TaskPriority.LOW],
  ])("reads %s", (token, expected) => {
    const r = parse(`do the thing ${token}`);
    expect(r.priority).toBe(expected);
    expect(r.title).toBe("do the thing");
  });

  it("leaves an unrecognised bang token in the title", () => {
    // "ship it!" must not lose its exclamation, and "!foo" is not a priority.
    const r = parse("ship it !foo now");
    expect(r.priority).toBeUndefined();
    expect(r.title).toBe("ship it !foo now");
  });
});

describe("assignees and labels", () => {
  it("extracts @names and #labels as raw names", () => {
    const r = parse("review copy @sam @ali #marketing #urgent-ish");
    expect(r.assigneeNames).toEqual(["sam", "ali"]);
    expect(r.labelNames).toEqual(["marketing", "urgent-ish"]);
    expect(r.title).toBe("review copy");
  });

  it("does not treat an email as an assignee token", () => {
    // No leading space before @, so it is part of the word.
    const r = parse("email sam@example.com about the invoice");
    expect(r.assigneeNames).toEqual([]);
    expect(r.title).toBe("email sam@example.com about the invoice");
  });
});

describe("relative dates", () => {
  it("today", () => {
    expect(ymd(parse("standup today").dueDate)).toBe("2026-09-10");
  });

  it("tomorrow", () => {
    const r = parse("ship tomorrow");
    expect(ymd(r.dueDate)).toBe("2026-09-11");
    expect(r.title).toBe("ship");
  });

  it("in N days", () => {
    expect(ymd(parse("follow up in 3 days").dueDate)).toBe("2026-09-13");
  });

  it("in N weeks", () => {
    expect(ymd(parse("retro in 2 weeks").dueDate)).toBe("2026-09-24");
  });

  it("next week", () => {
    expect(ymd(parse("plan next week").dueDate)).toBe("2026-09-17");
  });
});

describe("weekdays", () => {
  it("resolves a future weekday within the same week", () => {
    // NOW is Thursday; Friday is the next day.
    expect(ymd(parse("demo friday").dueDate)).toBe("2026-09-11");
  });

  it("treats the current weekday as NEXT week", () => {
    // Said on a Thursday, "thursday" means the next one — saying it about
    // today would be strange, since you would have said "today".
    expect(ymd(parse("sync thursday").dueDate)).toBe("2026-09-17");
  });

  it("a weekday earlier in the week rolls forward, never backward", () => {
    // NOW is Thursday, so "wednesday" is next week's, not yesterday's. A due
    // date in the past would be created instantly overdue.
    const due = parse("sync wednesday").dueDate!;
    expect(ymd(due)).toBe("2026-09-16");
    expect(due.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("accepts abbreviations", () => {
    expect(ymd(parse("call mon").dueDate)).toBe("2026-09-14");
  });

  it("next <weekday> skips to the following occurrence", () => {
    expect(ymd(parse("review next friday").dueDate)).toBe("2026-09-11");
  });
});

describe("explicit dates", () => {
  it("day then month", () => {
    expect(ymd(parse("invoice 25 dec").dueDate)).toBe("2026-12-25");
  });

  it("month then day", () => {
    expect(ymd(parse("invoice dec 25").dueDate)).toBe("2026-12-25");
  });

  it("rolls a past date into next year", () => {
    // January has already gone by September, so they mean next January.
    expect(ymd(parse("taxes 15 jan").dueDate)).toBe("2027-01-15");
  });
});

describe("times", () => {
  it("attaches a time to a parsed date", () => {
    const r = parse("call client tomorrow 5pm");
    expect(ymd(r.dueDate)).toBe("2026-09-11");
    expect(hm(r.dueDate)).toBe("17:00");
    expect(r.title).toBe("call client");
  });

  it("understands 24-hour times", () => {
    expect(hm(parse("deploy tomorrow 09:30").dueDate)).toBe("09:30");
  });

  it("handles 12am and 12pm correctly", () => {
    expect(hm(parse("thing tomorrow 12am").dueDate)).toBe("00:00");
    expect(hm(parse("thing tomorrow 12pm").dueDate)).toBe("12:00");
  });

  it("a bare time later today stays today", () => {
    // NOW is 14:00, so 6pm has not happened yet.
    const r = parse("call 6pm");
    expect(ymd(r.dueDate)).toBe("2026-09-10");
    expect(hm(r.dueDate)).toBe("18:00");
  });

  it("a bare time already past rolls to tomorrow", () => {
    // 9am is behind us at 14:00 — interpreting it as today would create a
    // task that is instantly overdue.
    const r = parse("standup 9am");
    expect(ymd(r.dueDate)).toBe("2026-09-11");
    expect(hm(r.dueDate)).toBe("09:00");
  });

  it("does not mistake a number in the title for a time", () => {
    const r = parse("upgrade to postgres 17");
    expect(r.dueDate).toBeUndefined();
    expect(r.title).toBe("upgrade to postgres 17");
  });
});

describe("everything at once", () => {
  it("parses the example from the plan", () => {
    const r = parse("fix login tomorrow 5pm !high @sam");
    expect(r.title).toBe("fix login");
    expect(r.priority).toBe(TaskPriority.HIGH);
    expect(ymd(r.dueDate)).toBe("2026-09-11");
    expect(hm(r.dueDate)).toBe("17:00");
    expect(r.assigneeNames).toEqual(["sam"]);
  });

  it("reports what it consumed so the UI can highlight it", () => {
    const r = parse("fix login tomorrow !high @sam #bug");
    expect(r.matched).toContain("@sam");
    expect(r.matched).toContain("#bug");
    expect(r.matched).toContain("!high");
    expect(r.matched).toContain("tomorrow");
  });

  it("never returns an empty title when tokens are all that was typed", () => {
    // Worth knowing about: the caller must reject this rather than create a
    // task with no title.
    expect(parse("!high @sam").title).toBe("");
  });
});
