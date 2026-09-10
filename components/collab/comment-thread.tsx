"use client";

import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { CommentEditor, type MentionCandidate } from "@/components/collab/comment-editor";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createComment,
  deleteComment,
  toggleReaction,
  updateComment,
} from "@/lib/collab/comment-actions";
import { fetchComments } from "@/lib/collab/read-actions";
import { cn } from "@/lib/utils";

/** The reactions offered, matching the server-side allowlist. */
const REACTIONS = ["👍", "🎉", "❤️", "👀", "🙏", "😄", "🚀", "😕"] as const;

type CommentNode = {
  id: string;
  bodyText: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  authorId: string;
  author: { id: string; fullName: string | null; email: string; avatarUrl: string | null };
  reactions: { emoji: string; profileId: string }[];
  replies?: CommentNode[];
};

/**
 * A task's discussion.
 *
 * Loaded on demand rather than with the task, because most task views never
 * open the drawer and a comment query per row would be wasted work.
 *
 * `refreshKey` lets the realtime subscription force a reload when someone else
 * comments, without this component knowing anything about channels.
 */
export function CommentThread({
  taskId,
  currentUserId,
  candidates,
  canComment,
  canModerate,
  refreshKey = 0,
}: {
  taskId: string;
  currentUserId: string;
  candidates: MentionCandidate[];
  canComment: boolean;
  canModerate: boolean;
  refreshKey?: number;
}) {
  const [comments, setComments] = useState<CommentNode[] | null>(null);
  const [error, setError] = useState<string>();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();

  const load = useCallback(async () => {
    const result = await fetchComments({ taskId });
    if (result.ok) setComments(result.data as unknown as CommentNode[]);
    else setError(result.error);
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    void fetchComments({ taskId }).then((result) => {
      if (cancelled) return;
      if (result.ok) setComments(result.data as unknown as CommentNode[]);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(undefined);
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await load();
    });
  };

  if (comments === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const total = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="text-muted size-4" aria-hidden />
        <h4 className="font-display text-sm font-semibold">
          Comments{" "}
          {total > 0 && (
            <span className="text-muted text-xs" data-numeric>
              {total}
            </span>
          )}
        </h4>
      </div>

      <FormError message={error} />

      {comments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description={canComment ? "Start the discussion below." : undefined}
          className="py-8"
        />
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="space-y-2">
              <CommentCard
                comment={comment}
                currentUserId={currentUserId}
                canComment={canComment}
                canModerate={canModerate}
                isEditing={editing === comment.id}
                onEdit={() => setEditing(comment.id)}
                onCancelEdit={() => setEditing(null)}
                onReply={() => setReplyTo(comment.id)}
                candidates={candidates}
                onSubmitEdit={async (payload) => {
                  setEditing(null);
                  run(() => updateComment({ commentId: comment.id, ...payload }));
                }}
                onDelete={() => run(() => deleteComment({ commentId: comment.id }))}
                onReact={(emoji) => run(() => toggleReaction({ commentId: comment.id, emoji }))}
              />

              {(comment.replies?.length ?? 0) > 0 && (
                <ul className="border-border ml-8 space-y-2 border-l pl-3">
                  {comment.replies!.map((reply) => (
                    <li key={reply.id}>
                      <CommentCard
                        comment={reply}
                        currentUserId={currentUserId}
                        canComment={canComment}
                        canModerate={canModerate}
                        isEditing={editing === reply.id}
                        onEdit={() => setEditing(reply.id)}
                        onCancelEdit={() => setEditing(null)}
                        candidates={candidates}
                        onSubmitEdit={async (payload) => {
                          setEditing(null);
                          run(() => updateComment({ commentId: reply.id, ...payload }));
                        }}
                        onDelete={() => run(() => deleteComment({ commentId: reply.id }))}
                        onReact={(emoji) =>
                          run(() => toggleReaction({ commentId: reply.id, emoji }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}

              {canComment && replyTo === comment.id && (
                <div className="ml-8 pl-3">
                  <CommentEditor
                    candidates={candidates}
                    placeholder="Write a reply…"
                    submitLabel="Reply"
                    autoFocus
                    onCancel={() => setReplyTo(null)}
                    onSubmit={async (payload) => {
                      setReplyTo(null);
                      run(() =>
                        createComment({ taskId, parentCommentId: comment.id, ...payload }),
                      );
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <CommentEditor
          candidates={candidates}
          onSubmit={async (payload) => run(() => createComment({ taskId, ...payload }))}
        />
      )}
    </div>
  );
}

function CommentCard({
  comment,
  currentUserId,
  canComment,
  canModerate,
  isEditing,
  candidates,
  onEdit,
  onCancelEdit,
  onSubmitEdit,
  onReply,
  onDelete,
  onReact,
}: {
  comment: CommentNode;
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
  isEditing: boolean;
  candidates: MentionCandidate[];
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (payload: {
    body: unknown;
    bodyText: string;
    mentionedProfileIds: string[];
  }) => Promise<void>;
  onReply?: () => void;
  onDelete: () => void;
  onReact: (emoji: (typeof REACTIONS)[number]) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const isAuthor = comment.authorId === currentUserId;

  // A deleted comment keeps its place so replies underneath still make sense.
  if (comment.deletedAt) {
    return (
      <div className="text-muted flex items-center gap-2 px-1 py-1.5 text-xs italic">
        <Trash2 className="size-3" aria-hidden />
        This comment was deleted
      </div>
    );
  }

  if (isEditing) {
    return (
      <CommentEditor
        candidates={candidates}
        initialText={comment.bodyText}
        submitLabel="Save"
        autoFocus
        onCancel={onCancelEdit}
        onSubmit={onSubmitEdit}
      />
    );
  }

  // Group reactions by emoji so the UI shows "👍 3" rather than three badges.
  const grouped = new Map<string, string[]>();
  for (const r of comment.reactions) {
    if (!grouped.has(r.emoji)) grouped.set(r.emoji, []);
    grouped.get(r.emoji)!.push(r.profileId);
  }

  return (
    <div className="group flex gap-2.5">
      <Avatar
        src={comment.author.avatarUrl}
        name={comment.author.fullName}
        email={comment.author.email}
        size="md"
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {comment.author.fullName ?? comment.author.email}
          </span>
          <time
            dateTime={comment.createdAt}
            className="text-muted text-xs"
            data-numeric
            title={new Date(comment.createdAt).toLocaleString()}
          >
            {relativeTime(comment.createdAt)}
          </time>
          {/* An edit marker rather than a silent rewrite — readers deserve to
              know the text changed. */}
          {comment.editedAt && <span className="text-muted text-xs">(edited)</span>}

          <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {canComment && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowReactions((v) => !v)}
                aria-label="Add a reaction"
                aria-expanded={showReactions}
                title="React"
              >
                <span aria-hidden>🙂</span>
              </Button>
            )}
            {canComment && onReply && (
              <Button variant="ghost" size="sm" onClick={onReply}>
                Reply
              </Button>
            )}
            {isAuthor && (
              <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit comment">
                <Pencil />
              </Button>
            )}
            {(isAuthor || canModerate) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                aria-label="Delete comment"
              >
                <Trash2 />
              </Button>
            )}
          </span>
        </div>

        {/* `comment-body` picks up the mention styling from globals.css. */}
        <p className="comment-body mt-0.5 text-sm whitespace-pre-wrap">{comment.bodyText}</p>

        {(grouped.size > 0 || showReactions) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {[...grouped.entries()].map(([emoji, profileIds]) => {
              const mine = profileIds.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  type="button"
                  disabled={!canComment}
                  onClick={() => onReact(emoji as (typeof REACTIONS)[number])}
                  aria-pressed={mine}
                  aria-label={`${emoji} ${profileIds.length}`}
                  className={cn(
                    "flex items-center gap-1 rounded-[--radius-sm] border px-1.5 py-0.5 text-xs",
                    mine
                      ? "bg-accent-soft border-accent/40 text-ink"
                      : "bg-surface-2 border-border text-muted hover:text-ink",
                  )}
                >
                  <span aria-hidden>{emoji}</span>
                  <span data-numeric>{profileIds.length}</span>
                </button>
              );
            })}

            {showReactions &&
              REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(emoji);
                    setShowReactions(false);
                  }}
                  aria-label={`React with ${emoji}`}
                  className="hover:bg-surface-2 rounded-[--radius-sm] px-1 py-0.5 text-sm"
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "3m", "2h", "5d", then a date.
 *
 * Relative time is what people want for a discussion, but only for a while —
 * "412d ago" is harder to place than the actual date.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
