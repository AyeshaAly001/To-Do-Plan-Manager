import type { Metadata } from "next";
import Link from "next/link";

import { CreateProjectForm } from "@/components/projects/create-project-form";
import { Badge } from "@/components/ui/badge";
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
import { visibleProjectsWhere } from "@/lib/projects/access";
import { PROJECT_STATUS_META } from "@/lib/tasks/display";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { user, workspace } = await requireWorkspace();
  const canCreate = can(workspace.role, "project.create");

  // Visibility is part of the WHERE clause, not a filter applied afterwards —
  // a private project must never be read in the first place.
  const projects = await prisma.project.findMany({
    where: visibleProjectsWhere(workspace, user.id),
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      key: true,
      description: true,
      color: true,
      status: true,
      isPrivate: true,
      _count: { select: { tasks: true } },
    },
  });

  // Open-task counts in one grouped query rather than one per project, which
  // would be N+1 across the whole page.
  const openCounts = await prisma.task.groupBy({
    by: ["projectId"],
    where: {
      project: visibleProjectsWhere(workspace, user.id),
      archivedAt: null,
      completedAt: null,
    },
    _count: { _all: true },
  });
  const openByProject = new Map(openCounts.map((c) => [c.projectId, c._count._all]));

  return (
    <div className="space-y-8">
      <PageTitle
        title="Projects"
        subtitle={`${projects.length} in ${workspace.workspaceName}`}
      />

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
            <CardDescription>
              It starts with three sections you can rename or remove.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateProjectForm />
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description={
            canCreate
              ? "Create one above to start adding tasks."
              : "Nothing has been shared with you yet."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const statusMeta = PROJECT_STATUS_META[project.status];
            const open = openByProject.get(project.id) ?? 0;

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="block">
                <Card interactive className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{project.name}</CardTitle>
                      {/* Colour is decorative here; the badge text carries the
                          meaning, per the no-colour-alone rule. */}
                      <span
                        aria-hidden
                        className="mt-1 size-2.5 shrink-0 rounded-full"
                        style={{ background: `var(--${project.color})` }}
                      />
                    </div>
                    <CardDescription className="truncate">
                      <span data-numeric>{project.key}</span>
                      {project.description ? ` · ${project.description}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    {project.isPrivate && <Badge tone="neutral">Private</Badge>}
                    <span className="text-muted ml-auto text-xs" data-numeric>
                      {open} open / {project._count.tasks} total
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
