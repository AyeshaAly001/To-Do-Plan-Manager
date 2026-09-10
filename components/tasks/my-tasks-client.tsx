"use client";

import { useQueryState } from "nuqs";
import { useCallback, useEffect, useState } from "react";

import { MyTasksView, type MyTasksBuckets } from "@/components/tasks/my-tasks-view";
import { TaskDrawer, type TaskDetail } from "@/components/tasks/task-drawer";
import { fetchTaskDetail } from "@/lib/tasks/read-actions";

/**
 * Client shell for My Tasks: owns the drawer and its URL state.
 *
 * The same `?task=<id>` contract as the project views, so a link to a task
 * works identically wherever it was copied from.
 *
 * `members` is intentionally empty here: the assignee picker needs the
 * workspace roster, which this cross-project page does not load. Reassigning
 * from My Tasks happens in the project view, where the roster is already
 * present — loading every member on a page that does not otherwise need them
 * would be a query for nothing.
 */
export function MyTasksClient({
  buckets,
  nowIso,
  canEdit,
}: {
  buckets: MyTasksBuckets;
  nowIso: string;
  canEdit: boolean;
}) {
  const [openTaskId, setOpenTaskId] = useQueryState("task", {
    defaultValue: "",
    clearOnDefault: true,
    history: "push",
  });

  const [detail, setDetail] = useState<TaskDetail | null>(null);

  /** Re-reads the open task after a change, for the same reason as the
   *  project view: the drawer's fields are controlled by this object. */
  const reloadDetail = useCallback(() => {
    if (!openTaskId) return;
    void fetchTaskDetail({ taskId: openTaskId }).then((result) => {
      if (result.ok && result.data) setDetail(result.data as unknown as TaskDetail);
    });
  }, [openTaskId]);

  useEffect(() => {
    if (!openTaskId) return;
    let cancelled = false;

    void fetchTaskDetail({ taskId: openTaskId }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setDetail(result.data as unknown as TaskDetail);
      else void setOpenTaskId("");
    });

    return () => {
      cancelled = true;
    };
  }, [openTaskId, setOpenTaskId]);

  // Derived rather than cleared imperatively, so closing needs no state write
  // and there is no synchronous setState inside the effect.
  const openTask = openTaskId && detail?.id === openTaskId ? detail : null;

  return (
    <>
      <MyTasksView
        buckets={buckets}
        nowIso={nowIso}
        canEdit={canEdit}
        onOpenTask={(id) => void setOpenTaskId(id)}
      />
      <TaskDrawer
        task={openTask}
        members={[]}
        canEdit={canEdit}
        onClose={() => void setOpenTaskId("")}
        onMutated={reloadDetail}
      />
    </>
  );
}
