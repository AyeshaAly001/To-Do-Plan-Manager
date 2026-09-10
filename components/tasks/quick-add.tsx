"use client";

import { CornerDownLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createTask } from "@/lib/tasks/actions";
import { formatDue, TASK_PRIORITY_META } from "@/lib/tasks/display";
import { parseQuickAdd } from "@/lib/tasks/quick-add";
import { cn } from "@/lib/utils";

/**
 * One-line task creation with natural-language parsing.
 *
 * The preview under the field is the point: it shows what the parser
 * understood BEFORE anything is created, so "tomorrow 5pm !high" is
 * confirmable rather than a guess. Without it, a parser that silently
 * misreads input is worse than no parser.
 *
 * The server re-parses the same string with the same pure function rather than
 * trusting these values — the preview is a courtesy, not the source of truth.
 */
export function QuickAdd({
  projectId,
  sectionId,
  members,
  autoFocus,
}: {
  projectId: string;
  sectionId?: string | null;
  /** Used to resolve `@name` tokens to real people. */
  members: { id: string; fullName: string | null; email: string }[];
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  // Re-parsed on every keystroke. Cheap — it is string work, no I/O.
  const parsed = useMemo(() => parseQuickAdd(value, new Date()), [value]);

  /**
   * Matches `@name` against members. Deliberately forgiving: the local part of
   * the email, the full name, and the first name all work, because people type
   * whichever they remember.
   */
  const resolvedAssignees = useMemo(() => {
    if (!parsed.assigneeNames.length) return [];
    return parsed.assigneeNames
      .map((name) => {
        const needle = name.toLowerCase();
        return members.find((m) => {
          const local = m.email.split("@")[0]!.toLowerCase();
          const full = (m.fullName ?? "").toLowerCase();
          const first = full.split(" ")[0] ?? "";
          return local === needle || full === needle || first === needle;
        });
      })
      .filter((m): m is (typeof members)[number] => Boolean(m));
  }, [parsed.assigneeNames, members]);

  const unresolved = parsed.assigneeNames.filter(
    (n) =>
      !resolvedAssignees.some((m) => {
        const local = m.email.split("@")[0]!.toLowerCase();
        const full = (m.fullName ?? "").toLowerCase();
        return local === n || full === n || (full.split(" ")[0] ?? "") === n;
      }),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (!parsed.title) {
      // The parser can consume everything typed, leaving no title.
      setError("Give the task a title, not just tags.");
      return;
    }

    start(async () => {
      const result = await createTask({
        projectId,
        sectionId: sectionId ?? null,
        title: parsed.title,
        priority: parsed.priority,
        dueDate: parsed.dueDate,
        assigneeIds: resolvedAssignees.map((m) => m.id),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Clear and keep focus: adding several tasks in a row is the common case.
      setValue("");
      inputRef.current?.focus();
      router.refresh();
    });
  };

  const hasPreview =
    Boolean(parsed.priority) ||
    Boolean(parsed.dueDate) ||
    resolvedAssignees.length > 0 ||
    unresolved.length > 0;

  return (
    <form onSubmit={submit} className="space-y-2">
      <FormError message={error} />

      <div className="flex items-center gap-2">
        <Plus className="text-muted size-4 shrink-0" aria-hidden />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          disabled={pending}
          aria-label="Add a task"
          placeholder="Add a task — try: fix login tomorrow 5pm !high @sam"
          className="border-transparent bg-transparent hover:border-transparent focus-visible:border-transparent"
        />
        {value.trim() && (
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add"}
            <CornerDownLeft />
          </Button>
        )}
      </div>

      {hasPreview && (
        <div
          className="text-muted flex flex-wrap items-center gap-1.5 pl-6 text-xs"
          // Announced politely: it updates on every keystroke, and assertive
          // would interrupt the user mid-sentence.
          aria-live="polite"
        >
          <span>Will create:</span>
          <span className="text-ink font-medium">{parsed.title || "(no title)"}</span>

          {parsed.dueDate && (
            <Badge tone="info">due {formatDue(parsed.dueDate, new Date())}</Badge>
          )}
          {parsed.priority && (
            <Badge tone={TASK_PRIORITY_META[parsed.priority].tone}>
              {TASK_PRIORITY_META[parsed.priority].label}
            </Badge>
          )}
          {resolvedAssignees.map((m) => (
            <Badge key={m.id} tone="accent">
              {m.fullName ?? m.email}
            </Badge>
          ))}
          {unresolved.map((name) => (
            // Says so rather than silently dropping it — otherwise "@sam"
            // looks like it worked when nobody was assigned.
            <Badge key={name} tone="warning" title="No matching member">
              @{name} not found
            </Badge>
          ))}
        </div>
      )}
    </form>
  );
}

/** Collapsed trigger for sections that are not the primary add point. */
export function QuickAddCollapsed({
  projectId,
  sectionId,
  members,
}: {
  projectId: string;
  sectionId?: string | null;
  members: { id: string; fullName: string | null; email: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "text-muted hover:text-ink hover:bg-surface-2 flex w-full items-center gap-2",
          "rounded-[--radius-md] px-2 py-1.5 text-left text-sm",
          "transition-colors duration-[--dur-fast] ease-[--ease-out]",
        )}
      >
        <Plus className="size-4" />
        Add task
      </button>
    );
  }

  return <QuickAdd projectId={projectId} sectionId={sectionId} members={members} autoFocus />;
}
