"use server";

import { authedAction } from "@/lib/auth/action";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@/lib/generated/prisma/enums";
import { assertProjectAccess, assertTaskAccess } from "@/lib/projects/access";
import { compareRanks, rankBefore, rankForIndex } from "@/lib/rank";
import {
  addChecklistItemSchema,
  bulkTaskSchema,
  bulkUpdateSchema,
  createTaskSchema,
  deleteChecklistItemSchema,
  deleteTaskSchema,
  moveTaskSchema,
  setAssigneesSchema,
  setLabelsSchema,
  toggleChecklistItemSchema,
  toggleTaskSchema,
  updateTaskSchema,
} from "@/lib/validation/project";

/**
 * Task mutations.
 *
 * Two rules run through all of them:
 *
 *   1. Access is checked per task via `assertTaskAccess`, which resolves the
 *      task only through its project's visibility clause. A task id from
 *      another workspace simply does not resolve, so there is no window where
 *      it is read before access is known.
 *
 *   2. Ordering uses fractional ranks, so a move updates one row.
 */

export const createTask = authedAction({
  capability: "task.create",
  schema: createTaskSchema,
  handler: async (input, ctx) => {
    await assertProjectAccess(input.projectId, ctx.workspace, ctx.user.id);

    // Assignees must be members of THIS workspace. Without this check a valid
    // uuid from another tenant could be attached to a task.
    if (input.assigneeIds?.length) {
      const valid = await prisma.workspaceMember.count({
        where: {
          workspaceId: ctx.workspace.workspaceId,
          profileId: { in: input.assigneeIds },
        },
      });
      if (valid !== new Set(input.assigneeIds).size) {
        throw new Error("One or more assignees are not members of this workspace");
      }
    }
    if (input.labelIds?.length) {
      const valid = await prisma.label.count({
        where: { workspaceId: ctx.workspace.workspaceId, id: { in: input.labelIds } },
      });
      if (valid !== new Set(input.labelIds).size) {
        throw new Error("One or more labels do not belong to this workspace");
      }
    }

    const siblings = await prisma.task.findMany({
      where: {
        projectId: input.projectId,
        sectionId: input.sectionId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        archivedAt: null,
      },
      select: { rank: true },
    });
    const ranks = siblings.map((s) => s.rank).sort(compareRanks);
    const rank = input.prepend
      ? rankBefore(ranks[0] ?? null)
      : rankForIndex(ranks, ranks.length);

    const task = await prisma.$transaction(async (tx) => {
      // Increment and read the counter in the same statement, inside the
      // transaction — so two concurrent creates cannot take the same number.
      const project = await tx.project.update({
        where: { id: input.projectId },
        data: { taskCounter: { increment: 1 } },
        select: { taskCounter: true, key: true },
      });

      return tx.task.create({
        data: {
          projectId: input.projectId,
          sectionId: input.sectionId ?? null,
          parentTaskId: input.parentTaskId ?? null,
          number: project.taskCounter,
          title: input.title,
          status: input.status,
          priority: input.priority,
          dueDate: input.dueDate ?? null,
          startDate: input.startDate ?? null,
          estimateHours: input.estimateHours ?? null,
          rank,
          createdById: ctx.user.id,
          assignees: input.assigneeIds?.length
            ? { create: input.assigneeIds.map((profileId) => ({ profileId })) }
            : undefined,
          labels: input.labelIds?.length
            ? { create: input.labelIds.map((labelId) => ({ labelId })) }
            : undefined,
        },
        select: { id: true, number: true, title: true, rank: true, projectId: true },
      });
    });

    await ctx.audit({
      entityType: "task",
      entityId: task.id,
      action: "created",
      diff: { title: task.title, number: task.number },
    });

    return task;
  },
});

export const updateTask = authedAction({
  capability: "task.update",
  schema: updateTaskSchema,
  handler: async ({ taskId, ...changes }, ctx) => {
    const before = await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    const data = Object.fromEntries(
      Object.entries(changes).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    if (Object.keys(data).length === 0) return before;

    // Completing or reopening has to keep `completedAt` in step with `status`,
    // or every "done in the last week" query silently disagrees with the UI.
    if (typeof data.status === "string") {
      if (data.status === TaskStatus.DONE && !before.completedAt) {
        data.completedAt = new Date();
      } else if (data.status !== TaskStatus.DONE && before.completedAt) {
        data.completedAt = null;
      }
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
      },
    });

    const diff: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(data)) {
      const previous = (before as Record<string, unknown>)[field];
      if (previous !== value) diff[field] = { from: previous ?? null, to: value ?? null };
    }

    await ctx.audit({ entityType: "task", entityId: taskId, action: "updated", diff });
    return updated;
  },
});

/** Checkbox toggle — separate from `updateTask` so the optimistic UI is trivial. */
export const toggleTask = authedAction({
  capability: "task.update",
  schema: toggleTaskSchema,
  handler: async ({ taskId, done }, ctx) => {
    const before = await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: done ? TaskStatus.DONE : TaskStatus.TODO,
        completedAt: done ? new Date() : null,
      },
      select: { id: true, status: true, completedAt: true },
    });

    await ctx.audit({
      entityType: "task",
      entityId: taskId,
      action: done ? "completed" : "reopened",
      diff: { status: { from: before.status, to: updated.status } },
    });

    return updated;
  },
});

export const moveTask = authedAction({
  capability: "task.update",
  schema: moveTaskSchema,
  handler: async ({ taskId, sectionId, toIndex }, ctx) => {
    const task = await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    // The destination section must belong to the same project — otherwise a
    // task could be moved into another project's column.
    if (sectionId) {
      const section = await prisma.section.findFirst({
        where: { id: sectionId, projectId: task.projectId },
        select: { id: true },
      });
      if (!section) throw new Error("Section does not belong to this project");
    }

    const siblings = await prisma.task.findMany({
      where: {
        projectId: task.projectId,
        sectionId,
        parentTaskId: task.parentTaskId,
        archivedAt: null,
        id: { not: taskId },
      },
      select: { rank: true },
    });

    const rank = rankForIndex(siblings.map((s) => s.rank).sort(compareRanks), toIndex);

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { sectionId, rank },
      select: { id: true, sectionId: true, rank: true },
    });

    // Only audit a section change. Reordering within a column is noise that
    // would drown the feed.
    if (task.sectionId !== sectionId) {
      await ctx.audit({
        entityType: "task",
        entityId: taskId,
        action: "moved",
        diff: { sectionId: { from: task.sectionId, to: sectionId } },
      });
    }

    return updated;
  },
});

export const setTaskAssignees = authedAction({
  capability: "task.assign",
  schema: setAssigneesSchema,
  handler: async ({ taskId, profileIds }, ctx) => {
    await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    const unique = [...new Set(profileIds)];
    if (unique.length) {
      const valid = await prisma.workspaceMember.count({
        where: { workspaceId: ctx.workspace.workspaceId, profileId: { in: unique } },
      });
      if (valid !== unique.length) {
        throw new Error("One or more assignees are not members of this workspace");
      }
    }

    // Replace wholesale: the UI sends the complete desired set, and diffing
    // client-side would be a second source of truth.
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId } }),
      ...(unique.length
        ? [
            prisma.taskAssignee.createMany({
              data: unique.map((profileId) => ({ taskId, profileId })),
            }),
          ]
        : []),
    ]);

    await ctx.audit({
      entityType: "task",
      entityId: taskId,
      action: "assignees_changed",
      diff: { assignees: unique },
    });

    return { taskId, profileIds: unique };
  },
});

export const setTaskLabels = authedAction({
  capability: "task.update",
  schema: setLabelsSchema,
  handler: async ({ taskId, labelIds }, ctx) => {
    await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    const unique = [...new Set(labelIds)];
    if (unique.length) {
      const valid = await prisma.label.count({
        where: { workspaceId: ctx.workspace.workspaceId, id: { in: unique } },
      });
      if (valid !== unique.length) {
        throw new Error("One or more labels do not belong to this workspace");
      }
    }

    await prisma.$transaction([
      prisma.taskLabel.deleteMany({ where: { taskId } }),
      ...(unique.length
        ? [
            prisma.taskLabel.createMany({
              data: unique.map((labelId) => ({ taskId, labelId })),
            }),
          ]
        : []),
    ]);

    return { taskId, labelIds: unique };
  },
});

export const deleteTask = authedAction({
  capability: "task.delete",
  schema: deleteTaskSchema,
  handler: async ({ taskId }, ctx) => {
    const task = await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    const subtaskCount = await prisma.task.count({ where: { parentTaskId: taskId } });
    if (subtaskCount > 0) {
      // The FK is Restrict on purpose: deleting a parent must not silently
      // take a subtree of work with it.
      throw new Error(
        `This task has ${subtaskCount} subtask${subtaskCount === 1 ? "" : "s"}. Delete or move them first.`,
      );
    }

    await prisma.task.delete({ where: { id: taskId } });

    await ctx.audit({
      entityType: "task",
      entityId: taskId,
      action: "deleted",
      diff: { title: task.title, number: task.number },
    });

    return { taskId };
  },
});

// --- bulk actions (List view multi-select) ----------------------------------

export const bulkUpdateTasks = authedAction({
  capability: "task.update",
  schema: bulkUpdateSchema,
  handler: async ({ taskIds, addLabelIds, assigneeIds, ...fields }, ctx) => {
    // Filter to the ids this caller can actually reach, in ONE query. Looping
    // per id would be N round trips and would leak which ids exist through
    // timing.
    const reachable = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
        project: { workspaceId: ctx.workspace.workspaceId, archivedAt: null },
      },
      select: { id: true },
    });
    const ids = reachable.map((t) => t.id);
    if (ids.length === 0) return { updated: 0 };

    const data = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    if (typeof data.status === "string") {
      data.completedAt = data.status === TaskStatus.DONE ? new Date() : null;
    }

    if (Object.keys(data).length > 0) {
      await prisma.task.updateMany({ where: { id: { in: ids } }, data });
    }

    if (addLabelIds?.length) {
      await prisma.taskLabel.createMany({
        data: ids.flatMap((taskId) => addLabelIds.map((labelId) => ({ taskId, labelId }))),
        // Adding a label a task already has is not an error.
        skipDuplicates: true,
      });
    }

    if (assigneeIds?.length) {
      await prisma.taskAssignee.createMany({
        data: ids.flatMap((taskId) => assigneeIds.map((profileId) => ({ taskId, profileId }))),
        skipDuplicates: true,
      });
    }

    await ctx.audit({
      entityType: "task",
      entityId: ids[0]!,
      action: "bulk_updated",
      diff: { count: ids.length, ...data },
    });

    return { updated: ids.length };
  },
});

export const bulkDeleteTasks = authedAction({
  capability: "task.delete",
  schema: bulkTaskSchema,
  handler: async ({ taskIds }, ctx) => {
    const reachable = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
        project: { workspaceId: ctx.workspace.workspaceId, archivedAt: null },
      },
      select: { id: true, _count: { select: { subtasks: true } } },
    });

    // Skip parents rather than failing the whole batch — deleting 20 tasks
    // should not be blocked by one that has children.
    const deletable = reachable.filter((t) => t._count.subtasks === 0).map((t) => t.id);
    const skipped = reachable.length - deletable.length;

    if (deletable.length) {
      await prisma.task.deleteMany({ where: { id: { in: deletable } } });
      await ctx.audit({
        entityType: "task",
        entityId: deletable[0]!,
        action: "bulk_deleted",
        diff: { count: deletable.length, skippedWithSubtasks: skipped },
      });
    }

    return { deleted: deletable.length, skipped };
  },
});

// --- checklist --------------------------------------------------------------

export const addChecklistItem = authedAction({
  capability: "task.update",
  schema: addChecklistItemSchema,
  handler: async ({ taskId, title }, ctx) => {
    await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    const existing = await prisma.checklistItem.findMany({
      where: { taskId },
      select: { rank: true },
    });
    const ranks = existing.map((i) => i.rank).sort(compareRanks);

    return prisma.checklistItem.create({
      data: { taskId, title, rank: rankForIndex(ranks, ranks.length) },
      select: { id: true, title: true, isDone: true, rank: true },
    });
  },
});

export const toggleChecklistItem = authedAction({
  capability: "task.update",
  schema: toggleChecklistItemSchema,
  handler: async ({ itemId, isDone }, ctx) => {
    const item = await prisma.checklistItem.findFirst({
      where: { id: itemId },
      select: { id: true, taskId: true },
    });
    if (!item) throw new Error("Checklist item not found");
    await assertTaskAccess(item.taskId, ctx.workspace, ctx.user.id);

    return prisma.checklistItem.update({
      where: { id: itemId },
      data: { isDone },
      select: { id: true, isDone: true },
    });
  },
});

export const deleteChecklistItem = authedAction({
  capability: "task.update",
  schema: deleteChecklistItemSchema,
  handler: async ({ itemId }, ctx) => {
    const item = await prisma.checklistItem.findFirst({
      where: { id: itemId },
      select: { id: true, taskId: true },
    });
    if (!item) throw new Error("Checklist item not found");
    await assertTaskAccess(item.taskId, ctx.workspace, ctx.user.id);

    await prisma.checklistItem.delete({ where: { id: itemId } });
    return { itemId };
  },
});
