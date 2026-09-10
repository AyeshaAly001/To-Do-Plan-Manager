"use server";

import { headers } from "next/headers";

import { authedAction, authedUserAction } from "@/lib/auth/action";
import { canAssignRole, canManageMember } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { sendEmail } from "@/lib/email/send";
import { generateInvitationToken, hashToken, invitationUrl } from "@/lib/invitations/token";
import {
  acceptInvitationSchema,
  changeRoleSchema,
  inviteMemberSchema,
  removeMemberSchema,
  revokeInvitationSchema,
} from "@/lib/validation/workspace";

async function getOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Invites someone by email.
 *
 * The capability check in `authedAction` establishes that the actor may invite
 * at all. This handler adds the rule the matrix cannot express: you may not
 * invite someone at a role equal to or above your own, or an ADMIN could mint
 * peers and escape the hierarchy.
 */
export const inviteMember = authedAction({
  capability: "member.invite",
  schema: inviteMemberSchema,
  handler: async ({ email, role }, ctx) => {
    if (!canAssignRole(ctx.workspace.role, role)) {
      throw new Error(`Cannot invite at role ${role}`);
    }

    // Already a member? Say so rather than creating an invitation that will
    // fail confusingly on accept.
    const existingMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: ctx.workspace.workspaceId,
        profile: { email },
      },
      select: { id: true },
    });
    if (existingMember) {
      return { status: "already_member" as const, email };
    }

    const { token, tokenHash, expiresAt } = generateInvitationToken();

    // Upsert on (workspaceId, email): re-inviting replaces the previous token
    // rather than leaving two live links for one person.
    const invitation = await prisma.invitation.upsert({
      where: {
        workspaceId_email: { workspaceId: ctx.workspace.workspaceId, email },
      },
      create: {
        workspaceId: ctx.workspace.workspaceId,
        email,
        role,
        tokenHash,
        invitedById: ctx.user.id,
        expiresAt,
      },
      update: {
        role,
        tokenHash,
        invitedById: ctx.user.id,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    await ctx.audit({
      entityType: "invitation",
      entityId: invitation.id,
      action: "created",
      diff: { email, role },
    });

    const origin = await getOrigin();
    const link = invitationUrl(origin, token);

    const delivery = await sendEmail({
      to: email,
      subject: `You have been invited to ${ctx.workspace.workspaceName} on Ash`,
      text: [
        `You have been invited to join ${ctx.workspace.workspaceName} as a ${role.toLowerCase()}.`,
        "",
        `Accept the invitation: ${link}`,
        "",
        `The link expires in 7 days. If you were not expecting this, ignore it.`,
      ].join("\n"),
    });

    return {
      status: "invited" as const,
      email,
      role: invitation.role,
      // Returned only when email is unconfigured, so the UI can offer the link
      // to copy. Never returned once real delivery works, because it would put
      // a live credential into a page response.
      link: delivery.delivered ? undefined : link,
      deliveryReason: delivery.reason,
    };
  },
  revalidate: ["/team"],
});

export const revokeInvitation = authedAction({
  capability: "member.invite",
  schema: revokeInvitationSchema,
  handler: async ({ invitationId }, ctx) => {
    // Scoped by workspaceId as well as id: without it, an id from another
    // workspace would be revocable by anyone who could guess it.
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, workspaceId: ctx.workspace.workspaceId },
      select: { id: true, email: true },
    });
    if (!invitation) throw new Error("Invitation not found in this workspace");

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });

    await ctx.audit({
      entityType: "invitation",
      entityId: invitation.id,
      action: "revoked",
      diff: { email: invitation.email },
    });

    return { invitationId: invitation.id };
  },
  revalidate: ["/team"],
});

export const changeMemberRole = authedAction({
  capability: "member.change_role",
  schema: changeRoleSchema,
  handler: async ({ memberId, role }, ctx) => {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspace.workspaceId },
      select: { id: true, role: true, profileId: true, profile: { select: { email: true } } },
    });
    if (!member) throw new Error("Member not found in this workspace");

    // You cannot change your own role — that is the self-promotion path, and
    // it is also how a workspace loses its last OWNER.
    if (member.profileId === ctx.user.id) {
      throw new Error("You cannot change your own role");
    }
    if (!canManageMember(ctx.workspace.role, member.role)) {
      throw new Error("Cannot manage a member at or above your own role");
    }
    if (!canAssignRole(ctx.workspace.role, role)) {
      throw new Error(`Cannot assign role ${role}`);
    }

    await prisma.workspaceMember.update({ where: { id: member.id }, data: { role } });

    await ctx.audit({
      entityType: "member",
      entityId: member.id,
      action: "role_changed",
      diff: { email: member.profile.email, role: { from: member.role, to: role } },
    });

    return { memberId: member.id, role };
  },
  revalidate: ["/team"],
});

export const removeMember = authedAction({
  capability: "member.remove",
  schema: removeMemberSchema,
  handler: async ({ memberId }, ctx) => {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspace.workspaceId },
      select: { id: true, role: true, profileId: true, profile: { select: { email: true } } },
    });
    if (!member) throw new Error("Member not found in this workspace");

    if (member.profileId === ctx.user.id) {
      throw new Error("Use 'leave workspace' to remove yourself");
    }
    if (!canManageMember(ctx.workspace.role, member.role)) {
      throw new Error("Cannot remove a member at or above your own role");
    }
    // Belt and braces: the OWNER is also protected by canManageMember, but a
    // workspace with no owner is unrecoverable, so it is worth stating twice.
    if (member.role === WorkspaceRole.OWNER) {
      throw new Error("The workspace owner cannot be removed");
    }

    await prisma.workspaceMember.delete({ where: { id: member.id } });

    await ctx.audit({
      entityType: "member",
      entityId: member.id,
      action: "removed",
      diff: { email: member.profile.email, role: member.role },
    });

    return { memberId: member.id };
  },
  revalidate: ["/team"],
});

/**
 * Accepts an invitation.
 *
 * `authedUserAction`, because the accepting user is by definition not yet a
 * member of the workspace — there is no membership to authorize against. The
 * token IS the authorization, which is why it is single-use, hashed at rest,
 * and checked for expiry and revocation here.
 */
export const acceptInvitation = authedUserAction({
  schema: acceptInvitationSchema,
  handler: async ({ token }, { user }) => {
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        workspaceId: true,
        workspace: { select: { id: true, name: true, slug: true, archivedAt: true } },
      },
    });

    if (!invitation) throw new Error("That invitation link is not valid");
    if (invitation.revokedAt) throw new Error("That invitation has been revoked");
    if (invitation.acceptedAt) throw new Error("That invitation has already been used");
    if (invitation.expiresAt < new Date()) throw new Error("That invitation has expired");
    if (invitation.workspace.archivedAt) throw new Error("That workspace is no longer active");

    // The invitation is addressed to a specific email. Without this check, one
    // person could forward their link and let anyone in at that role.
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    if (profile?.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new Error("This invitation was sent to a different email address");
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_profileId: {
            workspaceId: invitation.workspaceId,
            profileId: user.id,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          profileId: user.id,
          role: invitation.role,
        },
        // Already a member somehow — leave their existing role alone rather
        // than silently downgrading them.
        update: {},
      });

      // Marking accepted inside the transaction is what makes the token
      // single-use: a replayed link finds acceptedAt already set.
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: invitation.workspaceId,
          actorId: user.id,
          entityType: "member",
          entityId: user.id,
          action: "joined",
          diff: { role: invitation.role, via: "invitation" },
        },
      });
    });

    return {
      workspaceId: invitation.workspace.id,
      workspaceName: invitation.workspace.name,
      role: invitation.role,
    };
  },
  revalidate: ["/", "/home", "/team"],
});
