"use server";

import { z } from "zod";

import { authedAction, authedUserAction } from "@/lib/auth/action";
import { getTaskAttachments, getTaskComments, taskIsVisible } from "@/lib/collab/queries";
import { prisma } from "@/lib/db/prisma";
import { markNotificationsSchema } from "@/lib/validation/comment";

/**
 * On-demand reads and notification state, for client components.
 *
 * Dates are serialised to ISO strings on the way out — Server Actions can
 * return Date objects, but doing the conversion once here keeps
 * `new Date(...)` out of every render path.
 */

const taskIdSchema = z.object({ taskId: z.string().uuid() });

export const fetchComments = authedAction({
  capability: "task.view",
  schema: taskIdSchema,
  handler: async ({ taskId }, ctx) => {
    // The task id comes from the client, so visibility is re-checked before
    // anything is read.
    if (!(await taskIsVisible(taskId, ctx.workspace, ctx.user.id))) {
      throw new Error("Task not accessible");
    }

    const comments = await getTaskComments(taskId);

    const serialise = <
      T extends { createdAt: Date; editedAt: Date | null; deletedAt: Date | null },
    >(
      c: T,
    ) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt?.toISOString() ?? null,
      deletedAt: c.deletedAt?.toISOString() ?? null,
    });

    return comments.map((c) => ({
      ...serialise(c),
      replies: c.replies.map(serialise),
    }));
  },
});

export const fetchAttachments = authedAction({
  capability: "task.view",
  schema: taskIdSchema,
  handler: async ({ taskId }, ctx) => {
    if (!(await taskIsVisible(taskId, ctx.workspace, ctx.user.id))) {
      throw new Error("Task not accessible");
    }

    const attachments = await getTaskAttachments(taskId);
    return attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }));
  },
});

/**
 * Marks notifications read.
 *
 * `authedUserAction`, not `authedAction`: notifications belong to a PERSON,
 * not a workspace — someone in three workspaces has one inbox. Scoping this
 * to the active workspace would make notifications from elsewhere unclearable.
 * The `recipientId` filter is what makes it safe.
 */
export const markNotificationsRead = authedUserAction({
  schema: markNotificationsSchema,
  handler: async ({ notificationIds }, { user }) => {
    const result = await prisma.notification.updateMany({
      where: {
        recipientId: user.id,
        readAt: null,
        ...(notificationIds?.length ? { id: { in: notificationIds } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { marked: result.count };
  },
  revalidate: ["/inbox", "/home"],
});

export const fetchUnreadCount = authedUserAction({
  schema: z.object({}),
  handler: async (_input, { user }) =>
    prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
});
