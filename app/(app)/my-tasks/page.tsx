import type { Metadata } from "next";

import { MyTasksClient } from "@/components/tasks/my-tasks-client";
import { PageTitle } from "@/components/ui/page-title";
import { can } from "@/lib/auth/rbac";
import { requireWorkspace } from "@/lib/auth/session";
import { getMyTasks } from "@/lib/tasks/queries";

export const metadata: Metadata = { title: "My tasks" };

/**
 * Everything assigned to the current user, across every project they can see.
 *
 * Bucketed by due date rather than by project: the question this page answers
 * is "what should I do next", which is a time question.
 */
export default async function MyTasksPage() {
  const { user, workspace } = await requireWorkspace();
  const now = new Date();
  const buckets = await getMyTasks(user.id, workspace, now);

  const serialise = (tasks: Awaited<ReturnType<typeof getMyTasks>>["today"]) =>
    tasks.map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      sectionId: t.sectionId,
      // Cross-project view, so the project key is what identifies a task.
      project: { key: t.project.key },
      assignees: t.assignees,
      labels: t.labels,
      subtaskCount: t._count.subtasks,
      checklistCount: t._count.checklist,
    }));

  const total = Object.values(buckets).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="space-y-6">
      <PageTitle
        title="My tasks"
        subtitle={
          total === 0
            ? "Nothing assigned to you right now."
            : `${total} open across ${workspace.workspaceName}`
        }
      />

      <MyTasksClient
        nowIso={now.toISOString()}
        canEdit={can(workspace.role, "task.update")}
        buckets={{
          overdue: serialise(buckets.overdue),
          today: serialise(buckets.today),
          week: serialise(buckets.week),
          later: serialise(buckets.later),
          undated: serialise(buckets.undated),
        }}
      />
    </div>
  );
}
