import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectView } from "@/components/tasks/project-view";
import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/page-title";
import { can } from "@/lib/auth/rbac";
import { requireWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { findVisibleProject } from "@/lib/projects/access";
import { PROJECT_STATUS_META } from "@/lib/tasks/display";
import { getProjectBoard, type TaskFilters } from "@/lib/tasks/queries";

export async function generateMetadata({
  params,
}: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  const { user, workspace } = await requireWorkspace();
  const project = await findVisibleProject(projectId, workspace, user.id);
  return { title: project?.name ?? "Project" };
}

/**
 * A project's List view.
 *
 * Filters that change which rows are loaded arrive as search params and are
 * applied in the query. Grouping is handled client-side by ProjectView,
 * because the filtered set is already in memory.
 *
 * `notFound()` for an inaccessible project rather than a "forbidden" page: a
 * project in another workspace should be indistinguishable from one that does
 * not exist, or the response confirms the id.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const search = await searchParams;
  const { user, workspace } = await requireWorkspace();

  const project = await findVisibleProject(projectId, workspace, user.id);
  if (!project) notFound();

  const filters: TaskFilters = {
    due: typeof search.due === "string" ? search.due : undefined,
    assigneeId: typeof search.assignee === "string" ? search.assignee : undefined,
    search: typeof search.q === "string" ? search.q : undefined,
    // The `due=none` filter is about tasks WITHOUT a date, so completed ones
    // must not be filtered out by the default hide-done behaviour.
    hideDone: search.showDone === "1" ? false : true,
  };

  const now = new Date();

  const [{ sections, tasks }, members] = await Promise.all([
    getProjectBoard(projectId, workspace, user.id, filters, now),
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.workspaceId },
      orderBy: { joinedAt: "asc" },
      select: { profile: { select: { id: true, fullName: true, email: true } } },
    }),
  ]);

  const statusMeta = PROJECT_STATUS_META[project.status];
  const canEdit = can(workspace.role, "task.create");

  return (
    <div className="space-y-6">
      <PageTitle
        title={project.name}
        subtitle={project.description ?? undefined}
        actions={
          <div className="flex items-center gap-1.5">
            <Badge tone="neutral">{project.key}</Badge>
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            {project.isPrivate && <Badge tone="neutral">Private</Badge>}
          </div>
        }
      />

      <ProjectView
        projectId={project.id}
        sections={sections}
        members={members.map((m) => m.profile)}
        canEdit={canEdit}
        nowIso={now.toISOString()}
        tasks={tasks.map((t) => ({
          id: t.id,
          number: t.number,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
          sectionId: t.sectionId,
          project: { key: t.project.key },
          assignees: t.assignees,
          labels: t.labels,
          subtaskCount: t._count.subtasks,
          checklistCount: t._count.checklist,
        }))}
      />
    </div>
  );
}
