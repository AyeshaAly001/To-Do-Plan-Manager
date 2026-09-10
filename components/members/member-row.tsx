"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { canAssignRole, canManageMember } from "@/lib/auth/rbac";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";

export type MemberRowData = {
  id: string;
  profileId: string;
  role: WorkspaceRole;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  joinedAt: string;
};

/**
 * One member, with inline role change and removal.
 *
 * The controls are shown only when the actor could actually use them —
 * `canManageMember` mirrors the server rule, including that equal ranks cannot
 * act on each other and nobody can act on themselves. The server enforces all
 * of it again; this is only about not offering a button that would fail.
 */
export function MemberRow({
  member,
  actorRole,
  actorProfileId,
}: {
  member: MemberRowData;
  actorRole: WorkspaceRole;
  actorProfileId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const isSelf = member.profileId === actorProfileId;
  const manageable = !isSelf && canManageMember(actorRole, member.role);

  const assignable = [WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.GUEST].filter(
    (r) => canAssignRole(actorRole, r),
  );

  const onRoleChange = (role: string) => {
    setError(undefined);
    start(async () => {
      const { changeMemberRole } = await import("@/lib/members/actions");
      const result = await changeMemberRole({ memberId: member.id, role });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  const onRemove = () => {
    setError(undefined);
    start(async () => {
      const { removeMember } = await import("@/lib/members/actions");
      const result = await removeMember({ memberId: member.id });
      if (!result.ok) setError(result.error);
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar src={member.avatarUrl} name={member.fullName} email={member.email} size="md" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.fullName ?? member.email}
          {isSelf && <span className="text-muted font-normal"> (you)</span>}
        </p>
        <p className="text-muted truncate text-xs">{member.email}</p>
        {error && (
          <p role="alert" className="text-danger mt-1 text-xs">
            {error}
          </p>
        )}
      </div>

      {member.role === WorkspaceRole.OWNER || !manageable || assignable.length === 0 ? (
        <Badge tone={member.role === WorkspaceRole.OWNER ? "accent" : "neutral"}>
          {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
        </Badge>
      ) : (
        <Select
          aria-label={`Role for ${member.fullName ?? member.email}`}
          value={member.role}
          disabled={pending}
          onChange={(e) => onRoleChange(e.target.value)}
          className="w-32"
        >
          {assignable.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0) + r.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      )}

      {manageable && member.role !== WorkspaceRole.OWNER ? (
        confirming ? (
          <span className="flex items-center gap-1.5">
            <Button variant="danger" size="sm" onClick={onRemove} disabled={pending}>
              {pending ? "Removing…" : "Confirm"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${member.fullName ?? member.email}`}
            title="Remove from workspace"
          >
            <Trash2 />
          </Button>
        )
      ) : (
        // Keeps the column width stable so rows do not jump.
        <span className="size-9" aria-hidden />
      )}
    </li>
  );
}
