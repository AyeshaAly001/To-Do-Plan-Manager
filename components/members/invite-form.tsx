"use client";

import { Copy, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { canAssignRole } from "@/lib/auth/rbac";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";

const ROLE_HELP: Record<string, string> = {
  ADMIN: "Can manage members, projects and workspace settings.",
  MEMBER: "Can create and work on projects and tasks.",
  GUEST: "Can read and comment only.",
};

/**
 * Invite by email.
 *
 * The role options are filtered by what the current user may actually assign,
 * so an ADMIN never sees an option that the server would reject. The server
 * re-checks regardless — this is convenience, not enforcement.
 */
export function InviteForm({ actorRole }: { actorRole: WorkspaceRole }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(WorkspaceRole.MEMBER);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);

  const assignable = [WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.GUEST].filter(
    (r) => canAssignRole(actorRole, r),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setFieldError(undefined);
    setSuccess(undefined);
    setLink(undefined);
    setCopied(false);

    start(async () => {
      // Imported lazily so the server action module is not pulled into this
      // component's initial chunk.
      const { inviteMember } = await import("@/lib/members/actions");
      const result = await inviteMember({ email, role });

      if (!result.ok) {
        setFieldError(result.fieldErrors?.email?.[0]);
        if (!result.fieldErrors?.email) setError(result.error);
        return;
      }

      if (result.data.status === "already_member") {
        setError(`${result.data.email} is already a member of this workspace.`);
        return;
      }

      setEmail("");
      if (result.data.link) {
        // Email is not configured — hand over the link rather than claiming an
        // invitation was sent.
        setLink(result.data.link);
        setSuccess(
          `Invitation created for ${result.data.email}, but email is not configured on this server. Copy the link below and send it yourself.`,
        );
      } else {
        setSuccess(`Invitation sent to ${result.data.email}.`);
      }
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />
      <FormSuccess message={success} />

      {link && (
        <div className="bg-surface-2 border-border space-y-2 rounded-[--radius-md] border p-3">
          <p className="text-muted text-xs font-medium">Invitation link</p>
          <code className="text-ink block overflow-x-auto text-xs break-all">{link}</code>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            <Copy />
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Email" error={fieldError} required>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
          )}
        </Field>

        <Field label="Role" hint={ROLE_HELP[role]}>
          {(props) => (
            <Select
              {...props}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="sm:w-36"
            >
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Button
          type="submit"
          variant="primary"
          disabled={pending || email.trim().length === 0}
          className="sm:mb-[1.375rem]"
        >
          <Send />
          {pending ? "Inviting…" : "Invite"}
        </Button>
      </div>
    </form>
  );
}
