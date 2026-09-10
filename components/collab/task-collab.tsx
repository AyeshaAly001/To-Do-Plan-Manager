"use client";

import { useState } from "react";

import { AttachmentPanel } from "@/components/collab/attachment-panel";
import { CommentThread } from "@/components/collab/comment-thread";
import type { MentionCandidate } from "@/components/collab/comment-editor";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { usePresence, useRealtimeChannel } from "@/lib/realtime/use-realtime";
import { cn } from "@/lib/utils";

type Tab = "comments" | "files";

/**
 * The collaboration half of the task drawer: discussion, files, and who else
 * is looking.
 *
 * Tabbed rather than stacked, because a task with twenty comments would push
 * the file list off-screen — and someone opening a task to grab an attachment
 * should not have to scroll past a conversation.
 *
 * Realtime is scoped to the TASK, so a comment from someone else refreshes
 * this thread without every open task in the workspace refetching.
 */
export function TaskCollab({
  taskId,
  currentUser,
  candidates,
  canComment,
  canModerate,
  canUpload,
  canDeleteAnyFile,
}: {
  taskId: string;
  currentUser: { id: string; name: string };
  /** Workspace roster for the mention picker, loaded server-side. */
  candidates: MentionCandidate[];
  canComment: boolean;
  canModerate: boolean;
  canUpload: boolean;
  canDeleteAnyFile: boolean;
}) {
  const [tab, setTab] = useState<Tab>("comments");

  // Watch only `comments`: task-field changes are handled by the drawer's own
  // refetch, and subscribing to both here would double every refresh.
  const { version, connected } = useRealtimeChannel({
    channel: `task:${taskId}`,
    tables: ["comments"],
  });

  const { others } = usePresence({
    channel: `presence:task:${taskId}`,
    self: currentUser,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Task detail" className="flex gap-1">
          {(
            [
              ["comments", "Comments"],
              ["files", "Files"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "font-display rounded-[--radius-md] px-2.5 py-1 text-sm font-medium",
                "transition-colors duration-[--dur-fast] ease-[--ease-out]",
                tab === value
                  ? "bg-accent-soft text-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Presence: who else has this task open. */}
        {others.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="flex -space-x-1.5">
              {others.slice(0, 3).map((person) => (
                <Avatar
                  key={person.id}
                  email={person.name}
                  name={person.name}
                  size="sm"
                  className="ring-surface ring-2"
                />
              ))}
            </span>
            <span className="text-muted text-xs">
              {others.length === 1 ? "1 other viewing" : `${others.length} others viewing`}
            </span>
          </span>
        )}

        {/* Only surfaced when it FAILS. A permanent "live" badge is noise; a
            warning that updates are not arriving is information. */}
        {!connected && (
          <Badge tone="warning" className={others.length > 0 ? "" : "ml-auto"}>
            Offline
          </Badge>
        )}
      </div>

      {tab === "comments" ? (
        <CommentThread
          taskId={taskId}
          currentUserId={currentUser.id}
          candidates={candidates}
          canComment={canComment}
          canModerate={canModerate}
          refreshKey={version}
        />
      ) : (
        <AttachmentPanel
          taskId={taskId}
          currentUserId={currentUser.id}
          canUpload={canUpload}
          canDeleteAny={canDeleteAnyFile}
        />
      )}
    </div>
  );
}
