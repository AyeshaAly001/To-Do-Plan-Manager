"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { acceptInvitation } from "@/lib/members/actions";

/**
 * Accepts the invitation and drops the user straight into the workspace.
 *
 * The action sets no cookie, so `router.refresh()` runs before navigating —
 * the new membership has to be visible to `resolveActiveWorkspace` before
 * /home renders, or the shell would still resolve to their previous workspace.
 */
export function AcceptInvitationButton({
  token,
  workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const accept = () => {
    setError(undefined);
    start(async () => {
      const result = await acceptInvitation({ token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      router.push("/home");
    });
  };

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={accept}
        disabled={pending}
      >
        {pending ? "Joining…" : `Join ${workspaceName}`}
      </Button>
    </div>
  );
}
