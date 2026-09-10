import { WorkspaceRole } from "@/lib/generated/prisma/enums";

/**
 * Role-based capabilities.
 *
 * One explicit matrix rather than scattered `role === "ADMIN"` checks, because
 * scattered checks are how privilege bugs happen: someone adds a mutation,
 * copies the wrong comparison, and a MEMBER can suddenly delete a workspace.
 * Adding a capability here is a deliberate, reviewable act.
 *
 * Capabilities for later phases are declared now so the matrix is the single
 * place the permission model is described, even before the features exist.
 */

export const CAPABILITIES = [
  // workspace
  "workspace.view",
  "workspace.update",
  "workspace.archive",
  "workspace.delete",
  "workspace.transfer_ownership",
  "workspace.billing",

  // members & invitations
  "member.view",
  "member.invite",
  "member.remove",
  "member.change_role",

  // projects
  "project.view",
  "project.create",
  "project.update",
  "project.archive",
  "project.delete",

  // tasks
  "task.view",
  "task.create",
  "task.update",
  "task.assign",
  "task.delete",

  // collaboration
  "comment.create",
  "comment.delete_own",
  "comment.delete_any",
  "attachment.upload",
  "attachment.delete_any",

  // workspace-wide configuration
  "label.manage",
  "template.manage",
  "goal.manage",
  "customfield.manage",

  // measurement
  "timeentry.log_own",
  "timeentry.view_all",
  "report.view",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * GUEST is deliberately narrow: read what they can see, and comment. The plan
 * describes them as "read + comment on assigned projects only" — the
 * project-level visibility half of that is enforced separately by the query
 * layer (Phase 2), because it depends on data, not role.
 */
const GUEST: Capability[] = [
  "workspace.view",
  "project.view",
  "task.view",
  "comment.create",
  "comment.delete_own",
  "timeentry.log_own",
];

/** MEMBER is the default: does the actual work, changes no configuration. */
const MEMBER: Capability[] = [
  ...GUEST,
  "member.view",
  "project.create",
  "project.update",
  "task.create",
  "task.update",
  "task.assign",
  "task.delete",
  "attachment.upload",
  "report.view",
];

/** ADMIN runs the workspace day to day, but cannot destroy or own it. */
const ADMIN: Capability[] = [
  ...MEMBER,
  "workspace.update",
  "member.invite",
  "member.remove",
  "member.change_role",
  "project.archive",
  "project.delete",
  "comment.delete_any",
  "attachment.delete_any",
  "label.manage",
  "template.manage",
  "goal.manage",
  "customfield.manage",
  "timeentry.view_all",
];

/** OWNER additionally holds the irreversible and financial powers. */
const OWNER: Capability[] = [
  ...ADMIN,
  "workspace.archive",
  "workspace.delete",
  "workspace.transfer_ownership",
  "workspace.billing",
];

const MATRIX: Record<WorkspaceRole, ReadonlySet<Capability>> = {
  [WorkspaceRole.GUEST]: new Set(GUEST),
  [WorkspaceRole.MEMBER]: new Set(MEMBER),
  [WorkspaceRole.ADMIN]: new Set(ADMIN),
  [WorkspaceRole.OWNER]: new Set(OWNER),
};

/** Does this role hold this capability? */
export function can(role: WorkspaceRole, capability: Capability): boolean {
  return MATRIX[role].has(capability);
}

/** Every capability a role holds — useful for shipping a permission set to the client. */
export function capabilitiesFor(role: WorkspaceRole): Capability[] {
  return [...MATRIX[role]];
}

/**
 * Seniority, for comparisons like "an ADMIN may not change an OWNER's role".
 * Higher is more privileged.
 */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.GUEST]: 0,
  [WorkspaceRole.MEMBER]: 1,
  [WorkspaceRole.ADMIN]: 2,
  [WorkspaceRole.OWNER]: 3,
};

/**
 * Whether `actor` may assign `target` as a role to someone.
 *
 * Two rules, both learned from how this goes wrong in practice:
 *   - You cannot grant a role at or above your own (no self-promotion, and no
 *     ADMIN minting another OWNER).
 *   - OWNER is never assignable this way; transferring ownership is its own
 *     deliberate operation with its own capability.
 */
export function canAssignRole(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (target === WorkspaceRole.OWNER) return false;
  if (!can(actor, "member.change_role")) return false;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}

/**
 * Whether `actor` may act on a member holding `subject`'s role (remove them,
 * change their role). Equal rank is refused so two ADMINs cannot remove each
 * other, which is a common way workspaces get locked.
 */
export function canManageMember(actor: WorkspaceRole, subject: WorkspaceRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[subject];
}
