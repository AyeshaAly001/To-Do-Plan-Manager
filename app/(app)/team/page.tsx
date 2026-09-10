import type { Metadata } from "next";

import { InvitationRow } from "@/components/members/invitation-row";
import { InviteForm } from "@/components/members/invite-form";
import { MemberRow } from "@/components/members/member-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { can } from "@/lib/auth/rbac";
import { requireWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Team" };

/**
 * Members and pending invitations.
 *
 * The page checks `member.view` itself rather than relying on the sidebar
 * hiding the link — a hidden link is not access control, and this URL can be
 * typed.
 */
export default async function TeamPage() {
  const { user, workspace } = await requireWorkspace();

  // Checked here, not just by hiding the sidebar link — a hidden link is not
  // access control, and this URL can be typed.
  //
  // Rendered as a denial state rather than calling `forbidden()`: that helper
  // throws unless `experimental.authInterrupts` is enabled, and this also
  // keeps the app shell so the user can navigate somewhere useful instead of
  // hitting a bare 403.
  if (!can(workspace.role, "member.view")) {
    return (
      <div className="space-y-6">
        <PageTitle title="Team" />
        <EmptyState
          title="You do not have access to this"
          description={`Viewing the member list needs a higher role than ${workspace.role.toLowerCase()}. Ask an admin if you need it.`}
        />
      </div>
    );
  }

  const canInvite = can(workspace.role, "member.invite");

  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.workspaceId },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      select: {
        id: true,
        role: true,
        joinedAt: true,
        profileId: true,
        profile: { select: { email: true, fullName: true, avatarUrl: true } },
      },
    }),
    // Only fetch invitations for people who can act on them.
    canInvite
      ? prisma.invitation.findMany({
          where: {
            workspaceId: workspace.workspaceId,
            acceptedAt: null,
            revokedAt: null,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, role: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ]);

  const now = new Date();

  return (
    <div className="space-y-8">
      <PageTitle
        title="Team"
        subtitle={`${members.length} ${members.length === 1 ? "person" : "people"} in ${workspace.workspaceName}`}
      />

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
            <CardDescription>
              They will get a link that expires in 7 days. You can only invite at roles below
              your own.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm actorRole={workspace.role} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-border divide-y">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                actorRole={workspace.role}
                actorProfileId={user.id}
                member={{
                  id: m.id,
                  profileId: m.profileId,
                  role: m.role,
                  email: m.profile.email,
                  fullName: m.profile.fullName,
                  avatarUrl: m.profile.avatarUrl,
                  joinedAt: m.joinedAt.toISOString(),
                }}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <EmptyState
                title="No invitations outstanding"
                description="Everyone you have invited has either joined or been revoked."
              />
            ) : (
              <ul className="divide-border divide-y">
                {invitations.map((inv) => (
                  <InvitationRow
                    key={inv.id}
                    canRevoke={canInvite}
                    invitation={{
                      id: inv.id,
                      email: inv.email,
                      role: inv.role,
                      expired: inv.expiresAt < now,
                      expiresAt: inv.expiresAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      }),
                    }}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
