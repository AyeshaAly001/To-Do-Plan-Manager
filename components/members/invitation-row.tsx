"use client";

import { Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type InvitationRowData = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  expired: boolean;
};

export function InvitationRow({
  invitation,
  canRevoke,
}: {
  invitation: InvitationRowData;
  canRevoke: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const revoke = () => {
    setError(undefined);
    start(async () => {
      const { revokeInvitation } = await import("@/lib/members/actions");
      const result = await revokeInvitation({ invitationId: invitation.id });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="bg-surface-2 text-muted grid size-8 shrink-0 place-items-center rounded-full">
        <Mail className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className="text-muted truncate text-xs" data-numeric>
          {invitation.expired ? "Expired" : `Expires ${invitation.expiresAt}`}
        </p>
        {error && (
          <p role="alert" className="text-danger mt-1 text-xs">
            {error}
          </p>
        )}
      </div>

      {/* Expiry is a status, so it carries a label as well as a colour. */}
      <Badge tone={invitation.expired ? "danger" : "warning"}>
        {invitation.expired ? "Expired" : "Pending"}
      </Badge>
      <Badge tone="neutral">
        {invitation.role.charAt(0) + invitation.role.slice(1).toLowerCase()}
      </Badge>

      {canRevoke ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={revoke}
          disabled={pending}
          aria-label={`Revoke invitation for ${invitation.email}`}
          title="Revoke invitation"
        >
          <X />
        </Button>
      ) : (
        <span className="size-9" aria-hidden />
      )}
    </li>
  );
}
