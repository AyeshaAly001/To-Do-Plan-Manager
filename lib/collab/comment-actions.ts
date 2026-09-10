"use server";

import { authedAction } from "@/lib/auth/action";
import { notify, preview, taskWatchers } from "@/lib/collab/notify";
import { prisma } from "@/lib/db/prisma";
import { assertTaskAccess } from "@/lib/projects/access";
import {
  createCommentSchema,
  deleteCommentSchema,
  toggleReactionSchema,
  updateCommentSchema,
} from "@/lib/validation/comment";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Comments, mentions and reactions.
 *
 * Mentions are validated against workspace membership rather than trusted:
 * the client sends ids from its editor's mention nodes, and a forged id would
 * otherwise create a notification for someone in another tenant.
 */

/** Keeps only ids that are real members of this workspace. */
async function validMentions(ids: string[] | undefined, workspaceId: string) {
  const unique = [...new Set(ids ?? [])];
  if (unique.length === 0) return [];

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, profileId: { in: unique } },
    select: { profileId: true },
  });
  return members.map((m) => m.profileId);
}

export const createComment = authedAction({
  capability: "comment.create",
  schema: createCommentSchema,
  handler: async (input, ctx) => {
    const task = await assertTaskAccess(input.taskId, ctx.workspace, ctx.user.id);

    // A reply must belong to the same task, and must not itself be a reply —
    // threading is one level deep on purpose.
    if (input.parentCommentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: input.parentCommentId, taskId: input.taskId, deletedAt: null },
        select: { id: true, parentCommentId: true },
      });
      if (!parent) throw new Error("The comment being replied to no longer exists");
      if (parent.parentCommentId) {
        throw new Error("Replies cannot themselves be replied to");
      }
    }

    const mentioned = await validMentions(input.mentionedProfileIds, ctx.workspace.workspaceId);

    const comment = await prisma.comment.create({
      data: {
        taskId: input.taskId,
        authorId: ctx.user.id,
        body: (input.body ?? null) as Prisma.InputJsonValue,
        bodyText: input.bodyText,
        parentCommentId: input.parentCommentId ?? null,
        mentions: mentioned.length
          ? { create: mentioned.map((id) => ({ mentionedProfileId: id })) }
          : undefined,
      },
      select: { id: true, createdAt: true },
    });

    await ctx.audit({
      entityType: "task",
      entityId: input.taskId,
      action: "commented",
      diff: { commentId: comment.id, preview: preview(input.bodyText, 80) },
    });

    const author = await prisma.profile.findUnique({
      where: { id: ctx.user.id },
      select: { fullName: true, email: true },
    });
    const authorName = author?.fullName ?? author?.email ?? "Someone";
    const taskLabel = `${task.project.key}-${task.number} ${task.title}`;

    // Mentions first, so someone explicitly named gets the more specific
    // notification rather than a generic "new comment".
    if (mentioned.length) {
      await notify({
        type: "mention",
        recipientIds: mentioned,
        actorId: ctx.user.id,
        payload: {
          taskId: input.taskId,
          projectId: task.projectId,
          commentId: comment.id,
          taskTitle: task.title,
          actor: authorName,
          preview: preview(input.bodyText),
        },
        email: {
          subject: `${authorName} mentioned you on ${taskLabel}`,
          text: [`${authorName} mentioned you:`, "", preview(input.bodyText, 500), ""].join(
            "\n",
          ),
        },
      });
    }

    // Then everyone else watching, minus those already told about the mention.
    const watchers = (await taskWatchers(input.taskId)).filter((id) => !mentioned.includes(id));
    if (watchers.length) {
      await notify({
        type: "comment",
        recipientIds: watchers,
        actorId: ctx.user.id,
        payload: {
          taskId: input.taskId,
          projectId: task.projectId,
          commentId: comment.id,
          taskTitle: task.title,
          actor: authorName,
          preview: preview(input.bodyText),
        },
        email: {
          subject: `New comment on ${taskLabel}`,
          text: [`${authorName} commented:`, "", preview(input.bodyText, 500), ""].join("\n"),
        },
      });
    }

    return { commentId: comment.id };
  },
});

/**
 * Edits a comment.
 *
 * Only the author, and no time limit. A 15-minute edit window is a common
 * choice, but it mostly produces a follow-up comment saying "typo" — and the
 * `editedAt` marker already tells readers it changed.
 */
export const updateComment = authedAction({
  capability: "comment.create",
  schema: updateCommentSchema,
  handler: async (input, ctx) => {
    const comment = await prisma.comment.findFirst({
      where: { id: input.commentId, deletedAt: null },
      select: { id: true, authorId: true, taskId: true },
    });
    if (!comment) throw new Error("Comment not found");
    await assertTaskAccess(comment.taskId, ctx.workspace, ctx.user.id);

    if (comment.authorId !== ctx.user.id) {
      throw new Error("Only the author can edit a comment");
    }

    const mentioned = await validMentions(input.mentionedProfileIds, ctx.workspace.workspaceId);

    await prisma.$transaction([
      prisma.comment.update({
        where: { id: comment.id },
        data: {
          body: (input.body ?? null) as Prisma.InputJsonValue,
          bodyText: input.bodyText,
          editedAt: new Date(),
        },
      }),
      // Replace the mention set: an edit can add or remove names, and diffing
      // client-side would be a second source of truth.
      prisma.mention.deleteMany({ where: { commentId: comment.id } }),
      ...(mentioned.length
        ? [
            prisma.mention.createMany({
              data: mentioned.map((id) => ({
                commentId: comment.id,
                mentionedProfileId: id,
              })),
            }),
          ]
        : []),
    ]);

    // Deliberately no notification on edit: re-pinging everyone because
    // someone fixed a typo is exactly how people learn to ignore notifications.

    return { commentId: comment.id };
  },
});

export const deleteComment = authedAction({
  capability: "comment.delete_own",
  schema: deleteCommentSchema,
  handler: async ({ commentId }, ctx) => {
    const comment = await prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { id: true, authorId: true, taskId: true },
    });
    if (!comment) throw new Error("Comment not found");
    await assertTaskAccess(comment.taskId, ctx.workspace, ctx.user.id);

    // Authors can always remove their own; removing someone else's needs the
    // moderation capability.
    const isAuthor = comment.authorId === ctx.user.id;
    if (!isAuthor) {
      const { can } = await import("@/lib/auth/rbac");
      if (!can(ctx.workspace.role, "comment.delete_any")) {
        throw new Error("You can only delete your own comments");
      }
    }

    // Soft delete, so replies underneath keep their context instead of
    // becoming orphaned fragments.
    await prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    await ctx.audit({
      entityType: "task",
      entityId: comment.taskId,
      action: "comment_deleted",
      diff: { commentId, byAuthor: isAuthor },
    });

    return { commentId };
  },
});

export const toggleReaction = authedAction({
  capability: "comment.create",
  schema: toggleReactionSchema,
  handler: async ({ commentId, emoji }, ctx) => {
    const comment = await prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { id: true, taskId: true },
    });
    if (!comment) throw new Error("Comment not found");
    await assertTaskAccess(comment.taskId, ctx.workspace, ctx.user.id);

    const existing = await prisma.reaction.findFirst({
      where: { commentId, profileId: ctx.user.id, emoji },
      select: { id: true },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return { commentId, emoji, reacted: false };
    }

    await prisma.reaction.create({
      data: { commentId, profileId: ctx.user.id, emoji },
    });
    // No notification: a reaction is the lightweight acknowledgement people
    // use INSTEAD of a comment, and notifying on it defeats the purpose.
    return { commentId, emoji, reacted: true };
  },
});
