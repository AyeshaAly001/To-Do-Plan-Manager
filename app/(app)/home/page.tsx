import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatTile } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { can } from "@/lib/auth/rbac";
import { requireWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Home" };

/**
 * Personal dashboard.
 *
 * Phase 1 shows what actually exists — workspace, members, activity. The
 * task-centred tiles (today, overdue, upcoming) arrive with the task engine in
 * Phase 2, and the charts in Phase 6. Showing real counts rather than
 * placeholder zeros means this page is a working end-to-end check of the data
 * layer.
 */
export default async function HomePage() {
  const { user, workspace } = await requireWorkspace();

  const [memberCount, pendingInvites, recentActivity] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId: workspace.workspaceId } }),
    prisma.invitation.count({
      where: {
        workspaceId: workspace.workspaceId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.activityLog.findMany({
      where: { workspaceId: workspace.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        entityType: true,
        action: true,
        createdAt: true,
        actor: { select: { fullName: true, email: true } },
      },
    }),
  ]);

  const canInvite = can(workspace.role, "member.invite");

  return (
    <div className="space-y-8">
      <PageTitle
        title={workspace.workspaceName}
        subtitle={`Signed in as ${user.email}`}
        actions={
          canInvite ? (
            <Button asChild variant="primary">
              <Link href="/team">Invite people</Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile>
          <span className="text-muted text-xs font-medium">Members</span>
          <CountUp value={memberCount} />
        </StatTile>
        <StatTile>
          <span className="text-muted text-xs font-medium">Pending invitations</span>
          <CountUp value={pendingInvites} />
        </StatTile>
        <StatTile>
          <span className="text-muted text-xs font-medium">Your role</span>
          <span className="font-display text-3xl font-semibold capitalize">
            {workspace.role.toLowerCase()}
          </span>
        </StatTile>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <EmptyState
              title="Nothing has happened yet"
              description="Once you create projects and tasks, changes show up here."
            />
          ) : (
            <ul className="divide-border divide-y">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Badge tone="neutral">{entry.entityType}</Badge>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">
                      {entry.actor?.fullName ?? entry.actor?.email ?? "System"}
                    </span>{" "}
                    <span className="text-muted">{entry.action}</span>
                  </span>
                  {/* Body font + tabular numerals: this is data, not voice. */}
                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="text-muted shrink-0 text-xs"
                    data-numeric
                  >
                    {entry.createdAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-muted text-xs">
        Projects, tasks and the full dashboards arrive in the next phases. The design system
        reference lives at{" "}
        <Link href="/design" className="text-accent hover:underline">
          /design
        </Link>
        .
      </p>
    </div>
  );
}
