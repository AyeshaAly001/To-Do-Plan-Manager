"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/action";
import { getTaskDetail, searchTasks } from "@/lib/tasks/queries";
import { searchTasksSchema } from "@/lib/validation/project";

/**
 * Reads that a client component needs on demand.
 *
 * These go through `authedAction` like every mutation, for the same reason:
 * the id comes from the client, so access has to be re-checked. Reads are not
 * exempt from authorization — arguably they matter more, since a leak is the
 * failure mode.
 *
 * Dates are serialised to ISO strings on the way out. Server Actions can
 * return Date objects, but the drawer's inputs want strings and doing the
 * conversion once here keeps `new Date(...)` out of the render path.
 */

export const fetchTaskDetail = authedAction({
  capability: "task.view",
  schema: z.object({ taskId: z.string().uuid() }),
  handler: async ({ taskId }, ctx) => {
    const task = await getTaskDetail(taskId, ctx.workspace, ctx.user.id);
    if (!task) return null;

    return {
      ...task,
      dueDate: task.dueDate?.toISOString() ?? null,
      startDate: task.startDate?.toISOString() ?? null,
      // Decimal is not serialisable across the boundary; a string keeps the
      // exact value where a float could not.
      estimateHours: task.estimateHours?.toString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      subtasks: task.subtasks.map((s) => ({
        ...s,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    };
  },
});

export const searchWorkspaceTasks = authedAction({
  capability: "task.view",
  schema: searchTasksSchema,
  handler: async ({ query, projectId, limit }, ctx) =>
    searchTasks(query, ctx.workspace.workspaceId, limit, projectId),
});
