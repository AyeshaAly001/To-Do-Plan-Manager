import "server-only";

import type { Membership } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Which projects a person can see.
 *
 * This is the second half of tenancy. `authedAction` answers "are you in this
 * workspace, and may you do this kind of thing"; this answers "may you see
 * THIS project", which depends on data rather than role alone:
 *
 *   - A private project is visible only to its explicit ProjectMembers.
 *     Workspace membership is not enough — that is the whole point of the flag.
 *   - A GUEST sees only projects they have been added to explicitly, private
 *     or not. The plan defines them as read-plus-comment on assigned work, and
 *     "assigned" has to mean something concrete.
 *   - Everyone else sees all non-private projects in the workspace, plus any
 *     private one they belong to.
 *
 * Always compose this into the `where` of a project query rather than
 * filtering in JavaScript: filtering after the fact means the rows were
 * already read, and one forgotten filter is a cross-tenant leak.
 */
export function visibleProjectsWhere(workspace: Membership, profileId: string) {
  const base: Prisma.ProjectWhereInput = {
    workspaceId: workspace.workspaceId,
    archivedAt: null,
  };

  if (workspace.role === WorkspaceRole.GUEST) {
    // Explicit membership only.
    return {
      ...base,
      members: { some: { profileId } },
    } satisfies Prisma.ProjectWhereInput;
  }

  return {
    ...base,
    OR: [{ isPrivate: false }, { members: { some: { profileId } } }],
  } satisfies Prisma.ProjectWhereInput;
}

/**
 * Loads a project the caller is allowed to see, or null.
 *
 * Returning null rather than throwing lets pages render a 404 — which is the
 * correct response for a project in another workspace. Saying "forbidden"
 * would confirm the id exists, which is itself a leak.
 */
export async function findVisibleProject(
  projectId: string,
  workspace: Membership,
  profileId: string,
) {
  return prisma.project.findFirst({
    where: { ...visibleProjectsWhere(workspace, profileId), id: projectId },
    select: {
      id: true,
      name: true,
      key: true,
      description: true,
      color: true,
      icon: true,
      status: true,
      startDate: true,
      targetDate: true,
      isPrivate: true,
      ownerId: true,
      workspaceId: true,
    },
  });
}

/**
 * Asserts access from inside an action handler.
 *
 * Throws on failure, which `authedAction` converts into an opaque
 * "Something went wrong" for the client while logging the detail server-side.
 * That is the right shape here: the caller supplied an id they should not
 * have, and telling them which of "missing" or "forbidden" applies is exactly
 * the distinction worth withholding.
 */
export async function assertProjectAccess(
  projectId: string,
  workspace: Membership,
  profileId: string,
) {
  const project = await findVisibleProject(projectId, workspace, profileId);
  if (!project) {
    throw new Error(`Project ${projectId} is not accessible in this workspace`);
  }
  return project;
}

/**
 * Same question, for a task: resolves the task and checks its project.
 *
 * Doing it in one query rather than "load task, then load project" avoids a
 * window where the task is read before access is known.
 */
export async function assertTaskAccess(
  taskId: string,
  workspace: Membership,
  profileId: string,
) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: visibleProjectsWhere(workspace, profileId),
    },
    select: {
      id: true,
      projectId: true,
      sectionId: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      rank: true,
      dueDate: true,
      startDate: true,
      estimateHours: true,
      parentTaskId: true,
      completedAt: true,
      project: { select: { id: true, key: true, name: true } },
    },
  });

  if (!task) {
    throw new Error(`Task ${taskId} is not accessible in this workspace`);
  }
  return task;
}
