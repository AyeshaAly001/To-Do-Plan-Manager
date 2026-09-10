import { z } from "zod";

import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { emailSchema } from "@/lib/validation/auth";

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give your workspace a name of at least 2 characters")
    .max(60, "That name is too long"),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
});

export const switchWorkspaceSchema = z.object({
  workspaceId: z.string().uuid("Not a valid workspace"),
});

/**
 * Roles that can be handed out through the members UI.
 *
 * OWNER is excluded at the schema level, not just by the RBAC check — there is
 * no legitimate request that assigns it, so it should never get as far as an
 * authorization decision. Transferring ownership is a separate operation.
 */
export const assignableRoleSchema = z.enum([
  WorkspaceRole.ADMIN,
  WorkspaceRole.MEMBER,
  WorkspaceRole.GUEST,
]);

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: assignableRoleSchema,
});

export const changeRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: assignableRoleSchema,
});

export const removeMemberSchema = z.object({
  memberId: z.string().uuid(),
});

export const revokeInvitationSchema = z.object({
  invitationId: z.string().uuid(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20, "That invitation link is malformed"),
});
