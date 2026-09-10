import "server-only";

import type { Membership } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { visibleProjectsWhere } from "@/lib/projects/access";

/** Reads for the collaboration surfaces. */

const AUTHOR_SELECT = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
} as const;

/**
 * A task's comment thread, one level deep.
 *
 * Deleted comments are KEPT and returned with their body blanked, so replies
 * underneath still read in context. Dropping them would leave orphaned
 * fragments answering a question nobody can see.
 */
export async function getTaskComments(taskId: string) {
  const comments = await prisma.comment.findMany({
    where: { taskId, parentCommentId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      bodyText: true,
      body: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
      authorId: true,
      author: { select: AUTHOR_SELECT },
      mentions: { select: { mentionedProfileId: true } },
      reactions: { select: { emoji: true, profileId: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          bodyText: true,
          body: true,
          createdAt: true,
          editedAt: true,
          deletedAt: true,
          authorId: true,
          author: { select: AUTHOR_SELECT },
          mentions: { select: { mentionedProfileId: true } },
          reactions: { select: { emoji: true, profileId: true } },
        },
      },
    },
  });

  // Blank the body of deleted comments here rather than in the UI, so a
  // deleted body never crosses the wire in the first place.
  const scrub = <T extends { deletedAt: Date | null; bodyText: string; body: unknown }>(
    c: T,
  ) => (c.deletedAt ? { ...c, bodyText: "", body: null } : c);

  return comments.map((c) => ({
    ...scrub(c),
    replies: c.replies.map(scrub),
  }));
}

export async function getTaskAttachments(taskId: string) {
  return prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: AUTHOR_SELECT },
    },
  });
}

/**
 * Activity for one entity, or for the whole workspace when `entityId` is
 * omitted.
 *
 * Reads straight from `ActivityLog`, which the `authedAction` wrapper writes
 * — so the feed cannot drift from what actually happened, and no handler has
 * to remember to record its own history.
 */
export async function getActivity(
  workspace: Membership,
  options: { entityType?: string; entityId?: string; limit?: number } = {},
) {
  return prisma.activityLog.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      ...(options.entityType ? { entityType: options.entityType } : {}),
      ...(options.entityId ? { entityId: options.entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 30,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      action: true,
      diff: true,
      createdAt: true,
      actor: { select: AUTHOR_SELECT },
    },
  });
}

export async function getNotifications(profileId: string, limit = 50) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: profileId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { recipientId: profileId, readAt: null } }),
  ]);

  return { items, unreadCount };
}

/** Just the badge number — cheap enough to run on every shell render. */
export async function getUnreadCount(profileId: string): Promise<number> {
  return prisma.notification.count({ where: { recipientId: profileId, readAt: null } });
}

/**
 * Members of the workspace, for the mention autocomplete.
 *
 * Scoped to the workspace rather than the project: mentioning a colleague who
 * is not on this project is legitimate — it is how you pull someone in.
 */
export async function getMentionCandidates(workspace: Membership) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.workspaceId },
    orderBy: { joinedAt: "asc" },
    select: { profile: { select: AUTHOR_SELECT } },
  });
  return members.map((m) => m.profile);
}

/** Guards against a task id from another tenant reaching a collab read. */
export async function taskIsVisible(
  taskId: string,
  workspace: Membership,
  profileId: string,
): Promise<boolean> {
  const found = await prisma.task.findFirst({
    where: { id: taskId, project: visibleProjectsWhere(workspace, profileId) },
    select: { id: true },
  });
  return Boolean(found);
}
