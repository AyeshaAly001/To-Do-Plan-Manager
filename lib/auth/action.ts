import { revalidatePath } from "next/cache";
// Value import, not type-only: z.flattenError is called at runtime.
import { z } from "zod";

import { can, type Capability } from "@/lib/auth/rbac";
import {
  getCurrentUser,
  getMembership,
  resolveActiveWorkspace,
  type Membership,
  type SessionUser,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

/**
 * The authorization boundary for every mutation in the app.
 *
 * Read this before writing any data code.
 *
 * Prisma connects with the database credential and therefore BYPASSES Row
 * Level Security. RLS is enabled deny-all purely as leak insurance for the
 * publishable key. That means this wrapper — not the database — is what stops
 * one tenant reaching another's data. Nothing may query the database around
 * it.
 *
 * Next's own documentation reinforces this: Server Functions are POSTs to
 * whatever route they live on, so proxy coverage can be silently lost by a
 * refactor. Authorization has to be per-action, and this is the per-action
 * place.
 *
 * Every call performs the same sequence, in this order:
 *
 *   1. Resolve the session with getUser() (verified against the auth server).
 *   2. Resolve workspace membership and role from the database.
 *   3. Assert the required capability against the RBAC matrix.
 *   4. Parse and validate input with Zod.
 *   5. Run the handler.
 *   6. Write the audit log and revalidate affected paths.
 *
 * Failures are returned, not thrown, so forms can render them. Genuinely
 * unexpected errors are caught and reduced to an opaque message: leaking a
 * Prisma error to the client would disclose schema details.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /** Per-field messages from Zod, for inline form errors. */
      fieldErrors?: Record<string, string[]>;
      code: "UNAUTHENTICATED" | "NO_WORKSPACE" | "FORBIDDEN" | "INVALID_INPUT" | "FAILED";
    };

/** What a handler receives. Everything here is already verified. */
export type ActionContext = {
  user: SessionUser;
  workspace: Membership;
  /**
   * Records an audited change. Called by the handler rather than inferred,
   * because only the handler knows which entity changed and how.
   */
  audit: (entry: {
    entityType: string;
    entityId: string;
    action: string;
    diff?: Record<string, unknown>;
  }) => Promise<void>;
};

type ActionOptions<TSchema extends z.ZodTypeAny, TResult> = {
  /** Capability required to run this action. */
  capability: Capability;
  /** Input shape. Use `z.void()` for actions that take nothing. */
  schema: TSchema;
  /**
   * Which workspace to authorize against.
   *  - "active" (default): the active-workspace cookie, re-verified.
   *  - a function: derive it from the input, for actions that name a
   *    workspace explicitly (accepting an invitation, switching workspace).
   */
  workspace?: "active" | ((input: z.output<TSchema>) => string);
  /** Paths to revalidate on success. */
  revalidate?: string[];
  handler: (input: z.output<TSchema>, ctx: ActionContext) => Promise<TResult>;
};

export function authedAction<TSchema extends z.ZodTypeAny, TResult>(
  options: ActionOptions<TSchema, TResult>,
) {
  return async function run(rawInput: unknown): Promise<ActionResult<TResult>> {
    // --- 1. Who is this? -----------------------------------------------
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, code: "UNAUTHENTICATED", error: "You need to sign in." };
    }

    // --- 4a. Validate input first when the workspace is derived from it --
    // (Parsing before we can resolve the workspace is unavoidable in that
    // case; nothing has been read or written yet, so it is safe.)
    const parsed = options.schema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        error: "Some fields need attention.",
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      };
    }
    const input = parsed.data as z.output<TSchema>;

    // --- 2. Which workspace, and what is their role in it? --------------
    const workspace =
      options.workspace && options.workspace !== "active"
        ? await getMembership(user.id, options.workspace(input))
        : await resolveActiveWorkspace(user.id);

    if (!workspace) {
      return {
        ok: false,
        code: "NO_WORKSPACE",
        error: "You do not have access to this workspace.",
      };
    }

    // --- 3. Are they allowed to do this? --------------------------------
    if (!can(workspace.role, options.capability)) {
      // Deliberately vague: enumerating capabilities would tell an attacker
      // which ones exist.
      return {
        ok: false,
        code: "FORBIDDEN",
        error: "You do not have permission to do that.",
      };
    }

    // --- 5 & 6. Run, audit, revalidate ----------------------------------
    const auditEntries: {
      entityType: string;
      entityId: string;
      action: string;
      diff: Record<string, unknown>;
    }[] = [];

    const ctx: ActionContext = {
      user,
      workspace,
      async audit(entry) {
        // Buffered, then written after the handler succeeds — so a failed
        // mutation never leaves an audit row claiming it happened.
        auditEntries.push({ ...entry, diff: entry.diff ?? {} });
      },
    };

    try {
      const data = await options.handler(input, ctx);

      if (auditEntries.length > 0) {
        await prisma.activityLog.createMany({
          data: auditEntries.map((e) => ({
            workspaceId: workspace.workspaceId,
            actorId: user.id,
            entityType: e.entityType,
            entityId: e.entityId,
            action: e.action,
            diff: e.diff as never,
          })),
        });
      }

      for (const path of options.revalidate ?? []) {
        revalidatePath(path);
      }

      return { ok: true, data };
    } catch (error) {
      // Log server-side with full detail; return nothing useful to the client.
      console.error(
        `[action] ${options.capability} failed for user=${user.id} workspace=${workspace.workspaceId}`,
        error,
      );
      return {
        ok: false,
        code: "FAILED",
        error: "Something went wrong. Please try again.",
      };
    }
  };
}

/**
 * For actions that need a session but no workspace — creating the first
 * workspace, updating your own profile, accepting an invitation.
 *
 * Kept separate rather than making `capability` optional on `authedAction`, so
 * that skipping the capability check is always a visible, deliberate choice at
 * the call site instead of an omitted argument.
 */
export function authedUserAction<TSchema extends z.ZodTypeAny, TResult>(options: {
  schema: TSchema;
  revalidate?: string[];
  handler: (input: z.output<TSchema>, ctx: { user: SessionUser }) => Promise<TResult>;
}) {
  return async function run(rawInput: unknown): Promise<ActionResult<TResult>> {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, code: "UNAUTHENTICATED", error: "You need to sign in." };
    }

    const parsed = options.schema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        error: "Some fields need attention.",
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      };
    }

    try {
      const data = await options.handler(parsed.data as z.output<TSchema>, { user });
      for (const path of options.revalidate ?? []) {
        revalidatePath(path);
      }
      return { ok: true, data };
    } catch (error) {
      console.error(`[user-action] failed for user=${user.id}`, error);
      return { ok: false, code: "FAILED", error: "Something went wrong. Please try again." };
    }
  };
}
