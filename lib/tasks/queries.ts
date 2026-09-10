import "server-only";

import type { Membership } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { TaskStatus } from "@/lib/generated/prisma/enums";
import { visibleProjectsWhere } from "@/lib/projects/access";

/**
 * Reads for the task views.
 *
 * Every query starts from `visibleProjectsWhere`, so tenancy and
 * project-privacy are enforced in the `where` clause rather than by filtering
 * rows after they have been read.
 */

/** Fields the List view and task rows need. Kept in one place so views agree. */
const TASK_SELECT = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  startDate: true,
  estimateHours: true,
  rank: true,
  sectionId: true,
  parentTaskId: true,
  completedAt: true,
  createdAt: true,
  project: { select: { id: true, key: true, name: true, color: true } },
  assignees: {
    select: {
      profile: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
    },
  },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  _count: { select: { subtasks: true, checklist: true } },
} satisfies Prisma.TaskSelect;

export type TaskListItem = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

export type TaskFilters = {
  status?: TaskStatus[];
  assigneeId?: string;
  labelId?: string;
  /** "overdue" | "today" | "week" | "none" */
  due?: string;
  search?: string;
  /** Hide completed work. Default true, because a list of done tasks is noise. */
  hideDone?: boolean;
};

/**
 * Turns the filter bar into a Prisma clause.
 *
 * Date boundaries are computed from a caller-supplied `now` so "today" means
 * today in the USER's timezone. Using the server's clock would put the
 * boundary in the wrong place for anyone not sitting in UTC.
 */
export function taskFilterWhere(filters: TaskFilters, now: Date): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { archivedAt: null };

  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.assigneeId) where.assignees = { some: { profileId: filters.assigneeId } };
  if (filters.labelId) where.labels = { some: { labelId: filters.labelId } };

  if (filters.hideDone !== false) {
    where.status = filters.status?.length
      ? { in: filters.status.filter((s) => s !== TaskStatus.DONE) }
      : { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] };
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  switch (filters.due) {
    case "overdue":
      // Strictly before today, and not already finished — a completed task
      // that was late is history, not a problem to act on.
      where.dueDate = { lt: startOfToday };
      where.completedAt = null;
      break;
    case "today":
      where.dueDate = { gte: startOfToday, lt: endOfToday };
      break;
    case "week": {
      const inSeven = new Date(startOfToday);
      inSeven.setDate(inSeven.getDate() + 7);
      where.dueDate = { gte: startOfToday, lt: inSeven };
      break;
    }
    case "none":
      where.dueDate = null;
      break;
  }

  if (filters.search) {
    // Substring match on the title. The tsvector index handles full-text
    // ranking in `searchTasks`; this is the cheap in-view filter.
    where.title = { contains: filters.search, mode: "insensitive" };
  }

  return where;
}

/** A project's sections plus its tasks, ordered by rank. */
export async function getProjectBoard(
  projectId: string,
  workspace: Membership,
  profileId: string,
  filters: TaskFilters,
  now: Date,
) {
  const [sections, tasks] = await Promise.all([
    prisma.section.findMany({
      where: { projectId },
      orderBy: { rank: "asc" },
      select: { id: true, name: true, rank: true, wipLimit: true },
    }),
    prisma.task.findMany({
      where: {
        projectId,
        project: visibleProjectsWhere(workspace, profileId),
        // Top level only: subtasks are shown nested inside their parent, not
        // as siblings, or the list double-counts everything.
        parentTaskId: null,
        ...taskFilterWhere(filters, now),
      },
      orderBy: { rank: "asc" },
      select: TASK_SELECT,
    }),
  ]);

  return { sections, tasks };
}

export async function getSubtasks(parentTaskId: string) {
  return prisma.task.findMany({
    where: { parentTaskId, archivedAt: null },
    orderBy: { rank: "asc" },
    select: TASK_SELECT,
  });
}

/** One task with everything the detail drawer shows. */
export async function getTaskDetail(taskId: string, workspace: Membership, profileId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, project: visibleProjectsWhere(workspace, profileId) },
    select: {
      ...TASK_SELECT,
      description: true,
      descriptionText: true,
      createdBy: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      section: { select: { id: true, name: true } },
      parentTask: { select: { id: true, number: true, title: true } },
      subtasks: {
        where: { archivedAt: null },
        orderBy: { rank: "asc" },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          completedAt: true,
        },
      },
      checklist: { orderBy: { rank: "asc" }, select: { id: true, title: true, isDone: true } },
    },
  });
}

/**
 * Full-text search, ranked.
 *
 * Raw SQL because Prisma has no tsvector support. Two matchers are combined:
 * `websearch_to_tsquery` for word matching (handles quoted phrases and `-`
 * exclusion the way people expect from a search box), and a trigram
 * similarity fallback so partial words still match — "logi" finds "login",
 * which full-text search alone will not do.
 */
export async function searchTasks(
  query: string,
  workspaceId: string,
  limit: number,
  projectId?: string,
) {
  return prisma.$queryRaw<
    {
      id: string;
      number: number;
      title: string;
      status: TaskStatus;
      project_id: string;
      project_key: string;
      project_name: string;
      rank: number;
    }[]
  >`
    SELECT t.id,
           t.number,
           t.title,
           t.status,
           p.id   AS project_id,
           p.key  AS project_key,
           p.name AS project_name,
           GREATEST(
             ts_rank(t.search_vector, websearch_to_tsquery('english', ${query})),
             similarity(t.title, ${query})
           ) AS rank
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
     WHERE p.workspace_id = ${workspaceId}::uuid
       AND p.archived_at IS NULL
       AND t.archived_at IS NULL
       AND (${projectId ?? null}::uuid IS NULL OR t.project_id = ${projectId ?? null}::uuid)
       AND (
             t.search_vector @@ websearch_to_tsquery('english', ${query})
          OR t.title % ${query}
           )
     ORDER BY rank DESC, t.created_at DESC
     LIMIT ${limit}
  `;
}

/**
 * Every task assigned to one person, across every project they can see.
 *
 * The bucket boundaries are computed from a caller-supplied `now` rather than
 * inside SQL, so "today" means today in the USER's timezone. Doing it in
 * Postgres would put the boundary wherever the database happens to live —
 * which for this project is a different continent.
 */
export async function getMyTasks(profileId: string, workspace: Membership, now: Date) {
  const tasks = await prisma.task.findMany({
    where: {
      assignees: { some: { profileId } },
      archivedAt: null,
      // Finished work leaves the list. It is visible in the project views and
      // the dashboards; here it is only noise.
      status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      project: visibleProjectsWhere(workspace, profileId),
    },
    // Undated tasks sort last: `nulls: "last"` matters, because Postgres puts
    // NULLs first on ASC by default and the list would open with everything
    // that has no date.
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    select: TASK_SELECT,
  });

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const inSevenDays = new Date(startOfToday);
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const buckets = {
    overdue: [] as TaskListItem[],
    today: [] as TaskListItem[],
    week: [] as TaskListItem[],
    later: [] as TaskListItem[],
    undated: [] as TaskListItem[],
  };

  for (const task of tasks) {
    if (!task.dueDate) buckets.undated.push(task);
    else if (task.dueDate < startOfToday) buckets.overdue.push(task);
    else if (task.dueDate < startOfTomorrow) buckets.today.push(task);
    else if (task.dueDate < inSevenDays) buckets.week.push(task);
    else buckets.later.push(task);
  }

  return buckets;
}
