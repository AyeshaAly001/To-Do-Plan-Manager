import "server-only";

import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/send";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Notification fan-out.
 *
 * Two rules run through everything here:
 *
 *   1. Never notify the person who caused the event. Being told about your own
 *      comment is noise, and it makes the unread badge useless.
 *   2. One row per recipient per event, deduplicated. Someone who is both
 *      mentioned in a comment AND assigned to the task gets one notification,
 *      not two.
 *
 * Email respects each profile's `notificationPrefs` and is best-effort: a
 * failed send is logged, never allowed to fail the mutation that triggered it.
 * Losing a comment because an email provider was down would be indefensible.
 */

export type NotificationType = "mention" | "comment" | "assigned" | "due_soon";

type NotifyInput = {
  type: NotificationType;
  recipientIds: string[];
  /** Excluded from recipients — the person who caused this. */
  actorId: string;
  payload: Prisma.InputJsonValue;
  email?: { subject: string; text: string };
};

/** Default to sending unless the profile has explicitly turned a type off. */
function wantsEmail(prefs: unknown, type: NotificationType): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  const value = (prefs as Record<string, unknown>)[type];
  return value !== false;
}

export async function notify({
  type,
  recipientIds,
  actorId,
  payload,
  email,
}: NotifyInput): Promise<{ notified: number }> {
  const recipients = [...new Set(recipientIds)].filter((id) => id !== actorId);
  if (recipients.length === 0) return { notified: 0 };

  await prisma.notification.createMany({
    data: recipients.map((recipientId) => ({ recipientId, type, payload })),
  });

  if (!email) return { notified: recipients.length };

  const profiles = await prisma.profile.findMany({
    where: { id: { in: recipients } },
    select: { id: true, email: true, notificationPrefs: true },
  });

  for (const profile of profiles) {
    if (!wantsEmail(profile.notificationPrefs, type)) continue;

    // Best-effort. sendEmail already swallows transport errors and reports
    // `delivered: false`, so this cannot throw into the caller's transaction.
    const result = await sendEmail({
      to: profile.email,
      subject: email.subject,
      text: email.text,
    });

    if (result.delivered) {
      await prisma.notification.updateMany({
        where: { recipientId: profile.id, type, emailedAt: null },
        data: { emailedAt: new Date() },
      });
    }
  }

  return { notified: recipients.length };
}

/**
 * Everyone who should hear about activity on a task: its assignees plus
 * everyone who has commented on it.
 *
 * Commenters are included because joining a discussion is the clearest signal
 * of interest there is — being dropped from a thread you replied to is the
 * most common complaint about notification systems.
 */
export async function taskWatchers(taskId: string): Promise<string[]> {
  const [assignees, commenters] = await Promise.all([
    prisma.taskAssignee.findMany({ where: { taskId }, select: { profileId: true } }),
    prisma.comment.findMany({
      where: { taskId, deletedAt: null },
      select: { authorId: true },
      distinct: ["authorId"],
    }),
  ]);

  return [
    ...new Set([...assignees.map((a) => a.profileId), ...commenters.map((c) => c.authorId)]),
  ];
}

/** Trimmed preview for a notification payload or email subject line. */
export function preview(text: string, max = 140): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}
