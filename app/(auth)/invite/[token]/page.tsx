import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInvitationButton } from "@/components/members/accept-invitation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/invitations/token";

export const metadata: Metadata = { title: "Join a workspace" };

/**
 * Invitation landing page.
 *
 * Reachable without a session on purpose: someone invited by email may not
 * have an account yet, and bouncing them to /login without explaining what
 * they were invited to is disorienting. So the workspace name is shown first,
 * then they sign in or sign up, and `next` brings them straight back here.
 *
 * The token is looked up by hash — the plaintext is never stored — and every
 * invalid state (revoked, used, expired) is reported distinctly, because these
 * are the states a real user actually hits and "invalid link" tells them
 * nothing about what to do.
 */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      workspace: { select: { name: true, archivedAt: true } },
      invitedBy: { select: { fullName: true, email: true } },
    },
  });

  const problem = !invitation
    ? "That invitation link is not valid."
    : invitation.revokedAt
      ? "That invitation has been revoked."
      : invitation.acceptedAt
        ? "That invitation has already been used."
        : invitation.expiresAt < new Date()
          ? "That invitation has expired. Ask for a new one."
          : invitation.workspace.archivedAt
            ? "That workspace is no longer active."
            : null;

  if (problem || !invitation) {
    return (
      <div className="space-y-5 text-center">
        <h1 className="text-2xl">Invitation unavailable</h1>
        <FormError message={problem ?? "That invitation link is not valid."} />
        <Button asChild variant="secondary" className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  const user = await getCurrentUser();
  const invitedBy = invitation.invitedBy.fullName ?? invitation.invitedBy.email;
  const emailMatches = user?.email.toLowerCase() === invitation.email.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl">Join {invitation.workspace.name}</h1>
        <p className="text-muted text-sm">
          {invitedBy} invited <span className="text-ink font-medium">{invitation.email}</span>{" "}
          to join as
        </p>
        <Badge tone="accent">
          {invitation.role.charAt(0) + invitation.role.slice(1).toLowerCase()}
        </Badge>
      </div>

      {!user ? (
        <div className="space-y-3">
          <p className="text-muted text-center text-sm">
            Sign in or create an account with {invitation.email} to accept.
          </p>
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}>
              Create an account
            </Link>
          </Button>
        </div>
      ) : emailMatches ? (
        <AcceptInvitationButton token={token} workspaceName={invitation.workspace.name} />
      ) : (
        <div className="space-y-3">
          {/* The mismatch is the common real-world case — someone is signed in
              with a personal account and was invited on a work address. */}
          <FormError
            message={`This invitation was sent to ${invitation.email}, but you are signed in as ${user.email}.`}
          />
          <p className="text-muted text-center text-sm">
            Sign out and sign back in with {invitation.email} to accept it.
          </p>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/home">Go to your workspace</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
