import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { createClient } from "@/lib/supabase/server";

/**
 * Session and tenancy resolution.
 *
 * Used by Server Components (to render) and by `authedAction` (to authorize).
 * Keeping it in one module means there is exactly one definition of "who is
 * this and which workspace are they in", so a page and an action can never
 * disagree.
 */

/** Cookie holding the active workspace id. NEVER trusted without re-checking membership. */
export const ACTIVE_WORKSPACE_COOKIE = "ash_workspace";

export type SessionUser = {
  id: string;
  email: string;
};

export type Membership = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
};

/**
 * The authenticated user, or null.
 *
 * Always `getUser()`, never `getSession()`. getSession reads the cookie
 * without verifying it against the auth server, so it can be forged and must
 * never drive an access decision.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

/** Same, but sends anonymous visitors to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Every workspace this profile belongs to, most recently joined first. */
export async function getMemberships(profileId: string): Promise<Membership[]> {
  const rows = await prisma.workspaceMember.findMany({
    where: { profileId, workspace: { archivedAt: null } },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return rows.map((r) => ({
    workspaceId: r.workspace.id,
    workspaceName: r.workspace.name,
    workspaceSlug: r.workspace.slug,
    role: r.role,
  }));
}

/**
 * Resolves the active workspace for this request.
 *
 * The cookie is a *hint*, not an authorization. It is always re-checked
 * against `workspace_members`, so a user who edits the cookie to another
 * workspace's id simply falls back to one they actually belong to. This is the
 * single most security-sensitive function in the tenancy layer.
 *
 * Returns null when the user belongs to no workspace — the caller decides
 * whether that means onboarding or an error.
 */
export async function resolveActiveWorkspace(profileId: string): Promise<Membership | null> {
  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  if (requested) {
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        profileId,
        workspaceId: requested,
        workspace: { archivedAt: null },
      },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true } },
      },
    });

    if (membership) {
      return {
        workspaceId: membership.workspace.id,
        workspaceName: membership.workspace.name,
        workspaceSlug: membership.workspace.slug,
        role: membership.role,
      };
    }
    // Cookie pointed somewhere they cannot go — fall through rather than fail,
    // so a stale cookie from a removed membership doesn't lock them out.
  }

  const [first] = await getMemberships(profileId);
  return first ?? null;
}

/**
 * Membership in one specific workspace, or null.
 *
 * Used when the workspace is named by the request (an invitation, a deep
 * link) rather than by the active-workspace cookie.
 */
export async function getMembership(
  profileId: string,
  workspaceId: string,
): Promise<Membership | null> {
  const row = await prisma.workspaceMember.findFirst({
    where: { profileId, workspaceId, workspace: { archivedAt: null } },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!row) return null;
  return {
    workspaceId: row.workspace.id,
    workspaceName: row.workspace.name,
    workspaceSlug: row.workspace.slug,
    role: row.role,
  };
}

/**
 * User plus active workspace, for app-shell pages.
 *
 * Sends users with no workspace to onboarding, so no page has to render a
 * "you have no workspace" state.
 */
export async function requireWorkspace(): Promise<{
  user: SessionUser;
  workspace: Membership;
}> {
  const user = await requireUser();
  const workspace = await resolveActiveWorkspace(user.id);
  if (!workspace) redirect("/onboarding");
  return { user, workspace };
}
