import { TaskPriority } from "@/lib/generated/prisma/enums";

/**
 * Parses quick-add input like:
 *
 *   fix login redirect tomorrow 5pm !high @sam #bug
 *
 * Pure and dependency-free so the same parser runs in the browser (to show a
 * live preview of what will be created) and on the server (which re-parses
 * rather than trusting the client's interpretation).
 *
 * Design decisions worth knowing:
 *
 *   - The reference "now" is injected, never read from the clock. Tests need
 *     determinism, and "tomorrow" has to mean tomorrow in the USER's timezone,
 *     not the server's.
 *   - Only tokens it is confident about are consumed. Anything ambiguous stays
 *     in the title, because silently swallowing a word out of someone's task
 *     title is worse than not parsing it.
 *   - Assignee and label tokens are returned as raw NAMES, not ids. Resolving
 *     them needs workspace data, which is the caller's job — and the server
 *     must validate them anyway.
 */

export type QuickAddResult = {
  /** What is left after removing the tokens that were understood. */
  title: string;
  priority?: TaskPriority;
  dueDate?: Date;
  /** Text after `@`, lowercased. Resolved against workspace members by the caller. */
  assigneeNames: string[];
  /** Text after `#`, lowercased. */
  labelNames: string[];
  /** The literal substrings consumed, so the UI can highlight them. */
  matched: string[];
};

const PRIORITY_WORDS: Record<string, TaskPriority> = {
  urgent: TaskPriority.URGENT,
  p1: TaskPriority.URGENT,
  high: TaskPriority.HIGH,
  p2: TaskPriority.HIGH,
  med: TaskPriority.MEDIUM,
  medium: TaskPriority.MEDIUM,
  p3: TaskPriority.MEDIUM,
  low: TaskPriority.LOW,
  p4: TaskPriority.LOW,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Midnight on the same calendar day, in local terms. */
function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * The next occurrence of a weekday, always in the future.
 *
 * "monday" said on a Monday means NEXT Monday — saying it about today would be
 * surprising, since you would have said "today".
 */
function nextWeekday(from: Date, weekday: number): Date {
  const current = from.getDay();
  const delta = (weekday - current + 7) % 7 || 7;
  return addDays(startOfDay(from), delta);
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const matched: string[] = [];
  const assigneeNames: string[] = [];
  const labelNames: string[] = [];
  let priority: TaskPriority | undefined;
  let dueDate: Date | undefined;
  let timeOfDay: { hours: number; minutes: number } | undefined;

  let text = ` ${input} `;

  /** Removes the matched substring and records it. */
  const consume = (match: string) => {
    matched.push(match.trim());
    text = text.replace(match, " ");
  };

  // --- @assignee and #label ------------------------------------------------
  for (const m of [...text.matchAll(/\s@([A-Za-z0-9._-]{1,40})/g)]) {
    assigneeNames.push(m[1]!.toLowerCase());
    consume(m[0]);
  }
  for (const m of [...text.matchAll(/\s#([A-Za-z0-9._-]{1,40})/g)]) {
    labelNames.push(m[1]!.toLowerCase());
    consume(m[0]);
  }

  // --- !priority -----------------------------------------------------------
  const priorityMatch = text.match(/\s!([A-Za-z0-9]{1,6})(?=\s)/);
  if (priorityMatch) {
    const found = PRIORITY_WORDS[priorityMatch[1]!.toLowerCase()];
    if (found) {
      priority = found;
      consume(priorityMatch[0]);
    }
    // Unrecognised `!foo` is deliberately left in the title — it might be
    // "ship it!" or a genuine part of the sentence.
  }

  // --- time of day, e.g. 5pm / 17:30 / 9.30am ------------------------------
  const timeMatch = text.match(/\s(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)(?=\s)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]!, 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3]!.toLowerCase();
    if (hours >= 1 && hours <= 12 && minutes < 60) {
      if (meridiem === "pm" && hours !== 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      timeOfDay = { hours, minutes };
      consume(timeMatch[0]);
    }
  } else {
    const h24 = text.match(/\s(\d{1,2}):(\d{2})(?=\s)/);
    if (h24) {
      const hours = parseInt(h24[1]!, 10);
      const minutes = parseInt(h24[2]!, 10);
      if (hours < 24 && minutes < 60) {
        timeOfDay = { hours, minutes };
        consume(h24[0]);
      }
    }
  }

  // --- dates, most specific first -----------------------------------------
  // "in 3 days" / "in 2 weeks"
  const relative = text.match(/\sin\s(\d{1,3})\s(day|days|week|weeks|month|months)(?=\s)/i);
  if (relative) {
    const amount = parseInt(relative[1]!, 10);
    const unit = relative[2]!.toLowerCase();
    const days = unit.startsWith("week")
      ? amount * 7
      : unit.startsWith("month")
        ? amount * 30
        : amount;
    dueDate = addDays(startOfDay(now), days);
    consume(relative[0]);
  }

  // "12 Mar" / "Mar 12"
  if (!dueDate) {
    const dayMonth = text.match(/\s(\d{1,2})\s([A-Za-z]{3,9})(?=\s)/);
    const monthDay = text.match(/\s([A-Za-z]{3,9})\s(\d{1,2})(?=\s)/);
    const tryDate = (monthName: string, dayStr: string, whole: string) => {
      const month = MONTHS[monthName.toLowerCase()];
      const day = parseInt(dayStr, 10);
      if (month === undefined || day < 1 || day > 31) return false;
      const candidate = new Date(startOfDay(now));
      candidate.setMonth(month, day);
      // A date already past this year means they mean next year.
      if (candidate < startOfDay(now)) candidate.setFullYear(candidate.getFullYear() + 1);
      dueDate = candidate;
      consume(whole);
      return true;
    };
    if (dayMonth) tryDate(dayMonth[2]!, dayMonth[1]!, dayMonth[0]);
    if (!dueDate && monthDay) tryDate(monthDay[1]!, monthDay[2]!, monthDay[0]);
  }

  // "next monday" before bare "monday", and both before "next week".
  if (!dueDate) {
    const nextDay = text.match(/\snext\s([A-Za-z]{3,9})(?=\s)/i);
    if (nextDay) {
      const weekday = WEEKDAYS[nextDay[1]!.toLowerCase()];
      if (weekday !== undefined) {
        dueDate = nextWeekday(now, weekday);
        consume(nextDay[0]);
      } else if (nextDay[1]!.toLowerCase() === "week") {
        dueDate = addDays(startOfDay(now), 7);
        consume(nextDay[0]);
      }
    }
  }

  if (!dueDate) {
    for (const [word, offset] of [
      ["today", 0],
      ["tonight", 0],
      ["tomorrow", 1],
      ["tmrw", 1],
    ] as const) {
      const m = text.match(new RegExp(`\\s${word}(?=\\s)`, "i"));
      if (m) {
        dueDate = addDays(startOfDay(now), offset);
        consume(m[0]);
        break;
      }
    }
  }

  if (!dueDate) {
    for (const [word, weekday] of Object.entries(WEEKDAYS)) {
      const m = text.match(new RegExp(`\\s${word}(?=\\s)`, "i"));
      if (m) {
        dueDate = nextWeekday(now, weekday);
        consume(m[0]);
        break;
      }
    }
  }

  // A bare time with no date means today — or tomorrow if it has already gone.
  if (timeOfDay) {
    const base = dueDate ?? startOfDay(now);
    const withTime = new Date(base);
    withTime.setHours(timeOfDay.hours, timeOfDay.minutes, 0, 0);
    if (!dueDate && withTime < now) {
      dueDate = addDays(withTime, 1);
    } else {
      dueDate = withTime;
    }
  }

  return {
    title: text.replace(/\s+/g, " ").trim(),
    priority,
    dueDate,
    assigneeNames,
    labelNames,
    matched,
  };
}
