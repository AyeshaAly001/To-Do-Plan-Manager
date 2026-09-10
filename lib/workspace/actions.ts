"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authedAction, authedUserAction } from "@/lib/auth/action";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { uniqueWorkspaceSlug } from "@/lib/workspace/slug-server";
import {
  createWorkspaceSchema,
  switchWorkspaceSchema,
  updateWorkspaceSchema,
} from "@/lib/validation/workspace";

/** Six months. Long enough to feel sticky, short enough to expire on a shared machine. */
const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

async function setActiveWorkspaceCookie(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
  });
}

/**
 * Creates a workspace and makes the creator its OWNER.
 *
 * Uses `authedUserAction`, not `authedAction`: there is no workspace to
 * authorize against yet. That is the one legitimate case for skipping the
 * capability check, and it is explicit at the call site rather than an omitted
 * argument.
 */
export const createWorkspace = authedUserAction({
  schema: createWorkspaceSchema,
  handler: async ({ name }, { user }) => {
    const slug = await uniqueWorkspaceSlug(name);

    // One transaction: a workspace whose creator is not a member would be
    // invisible and unrecoverable — nobody could administer it.
    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: { name, slug, ownerId: user.id },
        select: { id: true, name: true, slug: true },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: created.id,
          profileId: user.id,
          role: WorkspaceRole.OWNER,
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: created.id,
          actorId: user.id,
          entityType: "workspace",
          entityId: created.id,
          action: "created",
          diff: { name, slug },
        },
      });

      return created;
    });

    await setActiveWorkspaceCookie(workspace.id);
    return workspace;
  },
  revalidate: ["/", "/home"],
});

/**
 * Switches the active workspace.
 *
 * Authorized against the *target* workspace rather than the active one —
 * otherwise this would check permissions on the workspace being left, which is
 * the wrong question entirely. `workspace.view` is the capability, so even a
 * GUEST can switch into a workspace they belong to; membership is what
 * `getMembership` verifies.
 */
export const switchWorkspace = authedAction({
  capability: "workspace.view",
  schema: switchWorkspaceSchema,
  workspace: (input) => input.workspaceId,
  handler: async ({ workspaceId }) => {
    await setActiveWorkspaceCookie(workspaceId);
    return { workspaceId };
  },
  revalidate: ["/", "/home"],
});

export const updateWorkspace = authedAction({
  capability: "workspace.update",
  schema: updateWorkspaceSchema,
  handler: async ({ name }, ctx) => {
    const before = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspace.workspaceId },
      select: { name: true },
    });

    const updated = await prisma.workspace.update({
      where: { id: ctx.workspace.workspaceId },
      data: { name },
      select: { id: true, name: true, slug: true },
    });

    // The slug is deliberately NOT regenerated on rename: it would break every
    // shared link. Renaming is cosmetic; the slug is an identifier.
    await ctx.audit({
      entityType: "workspace",
      entityId: updated.id,
      action: "updated",
      diff: { name: { from: before.name, to: name } },
    });

    return updated;
  },
  revalidate: ["/settings/workspace", "/home"],
});

/** Sign-out lives in auth-actions; this is the "leave the app shell" helper. */
export async function goHome() {
  redirect("/home");
}
