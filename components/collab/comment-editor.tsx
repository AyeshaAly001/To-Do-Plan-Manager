"use client";

import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MentionCandidate = {
  id: string;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
};

type SuggestionState = {
  items: MentionCandidate[];
  selected: number;
  rect: { top: number; left: number } | null;
  command: ((item: { id: string; label: string }) => void) | null;
};

const EMPTY_SUGGESTION: SuggestionState = {
  items: [],
  selected: 0,
  rect: null,
  command: null,
};

/**
 * Comment composer with `@`-mention autocomplete.
 *
 * Tiptap's suggestion plugin expects you to manage a DOM popup yourself. Most
 * examples reach for tippy.js; this keeps the popup in React state instead, so
 * it uses the app's own tokens and needs no extra dependency — the plugin's
 * lifecycle callbacks just push into state.
 *
 * `immediatelyRender: false` is required under Next: rendering the editor
 * during SSR produces markup the client then disagrees with, and Tiptap warns
 * about exactly this.
 *
 * `candidates` MUST be populated before this mounts. `useEditor` builds the
 * editor once, so the Mention extension closes over whatever the list was on
 * first render — fetching the roster after mount left the suggestion
 * permanently empty. The roster is loaded on the server and passed down
 * instead, which also saves a round trip.
 */
export function CommentEditor({
  candidates,
  placeholder = "Write a comment… use @ to mention someone",
  submitLabel = "Comment",
  initialText,
  autoFocus,
  disabled,
  onSubmit,
  onCancel,
}: {
  candidates: MentionCandidate[];
  placeholder?: string;
  submitLabel?: string;
  initialText?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Receives the document, its plain-text mirror, and the mentioned ids. */
  onSubmit: (payload: {
    body: unknown;
    bodyText: string;
    mentionedProfileIds: string[];
  }) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [suggestion, setSuggestion] = useState<SuggestionState>(EMPTY_SUGGESTION);
  const [busy, setBusy] = useState(false);

  /**
   * Whether the editor is empty, tracked in STATE rather than read during
   * render.
   *
   * Tiptap 3's `useEditor` does not re-render the component on every
   * transaction — that was a deliberate performance change from v2. So
   * computing `editor.getText()` during render gives a value that never
   * updates as you type, and the submit button stays disabled forever.
   *
   * This was initially masked: an unrelated async fetch happened to force a
   * re-render at the right moment, so the button appeared to work.
   */
  const [empty, setEmpty] = useState(!initialText?.trim());

  /**
   * Tiptap's suggestion callbacks run outside React's render, so a plain
   * closure over state would be stale by the time a key is pressed. A ref
   * carries the current value instead.
   *
   * The ref is written ONLY from those callbacks — never during render, which
   * React 19 prohibits (and `react-hooks/refs` catches). `apply` is the single
   * place both the ref and the state are updated, so they cannot diverge.
   */
  const suggestionRef = useRef<SuggestionState>(EMPTY_SUGGESTION);

  const apply = useCallback(
    (next: SuggestionState | ((current: SuggestionState) => SuggestionState)) => {
      const value = typeof next === "function" ? next(suggestionRef.current) : next;
      suggestionRef.current = value;
      setSuggestion(value);
    },
    [],
  );

  const label = useCallback(
    (c: MentionCandidate) => c.fullName?.trim() || c.email.split("@")[0]!,
    [],
  );

  const mentionExtension = useMemo(
    () =>
      Mention.configure({
        HTMLAttributes: {
          // Tokenised, so mentions follow the theme like everything else.
          class: "bg-accent-soft text-ink rounded-[--radius-sm] px-1 py-0.5 font-medium",
        },
        suggestion: {
          char: "@",
          items: ({ query }) => {
            const needle = query.toLowerCase();
            return candidates
              .filter(
                (c) =>
                  label(c).toLowerCase().includes(needle) ||
                  c.email.toLowerCase().includes(needle),
              )
              .slice(0, 6);
          },
          render: () => ({
            onStart: (props) => {
              const rect = props.clientRect?.();
              apply({
                items: props.items as MentionCandidate[],
                selected: 0,
                rect: rect ? { top: rect.bottom, left: rect.left } : null,
                command: props.command,
              });
            },
            onUpdate: (props) => {
              const rect = props.clientRect?.();
              apply({
                items: props.items as MentionCandidate[],
                selected: 0,
                rect: rect ? { top: rect.bottom, left: rect.left } : null,
                command: props.command,
              });
            },
            onKeyDown: (props) => {
              const current = suggestionRef.current;
              if (current.items.length === 0) return false;

              if (props.event.key === "ArrowDown") {
                apply((s) => ({ ...s, selected: (s.selected + 1) % s.items.length }));
                return true;
              }
              if (props.event.key === "ArrowUp") {
                apply((s) => ({
                  ...s,
                  selected: (s.selected - 1 + s.items.length) % s.items.length,
                }));
                return true;
              }
              if (props.event.key === "Enter" || props.event.key === "Tab") {
                const item = current.items[current.selected];
                if (item) {
                  current.command?.({ id: item.id, label: label(item) });
                  return true;
                }
              }
              if (props.event.key === "Escape") {
                apply(EMPTY_SUGGESTION);
                return true;
              }
              return false;
            },
            onExit: () => apply(EMPTY_SUGGESTION),
          }),
        },
      }),
    [candidates, label, apply],
  );

  const editor = useEditor({
    // Required under Next: rendering during SSR desynchronises hydration.
    immediatelyRender: false,
    autofocus: autoFocus,
    onUpdate: ({ editor: instance }) => {
      // React bails out when the boolean is unchanged, so this does not
      // re-render on every keystroke — only when emptiness flips.
      setEmpty(instance.getText().trim().length === 0);
    },
    onCreate: ({ editor: instance }) => {
      setEmpty(instance.getText().trim().length === 0);
    },
    extensions: [
      StarterKit.configure({
        // A comment box does not need headings or horizontal rules; keeping
        // the schema small keeps the toolbar-free UI predictable.
        heading: false,
        horizontalRule: false,
      }),
      mentionExtension,
    ],
    content: initialText ? `<p>${escapeHtml(initialText)}</p>` : "",
    editorProps: {
      attributes: {
        class: cn(
          "font-ui min-h-16 w-full px-3 py-2 text-sm outline-none",
          "prose-none [&_p]:my-0 [&_p+p]:mt-2",
        ),
        /**
         * Explicit textbox role.
         *
         * ProseMirror renders a contenteditable div, which Chromium exposes as
         * a GENERIC container rather than a textbox — so a screen reader
         * announces "Comment" with no indication it is an editable field, and
         * no multiline hint. Stating the role and multiline explicitly fixes
         * that. Found because a test could not locate the field by role, which
         * is exactly what a screen-reader user would experience.
         */
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Comment",
        "data-placeholder": placeholder,
      },
    },
  });

  const submit = async () => {
    if (!editor || busy) return;

    const bodyText = editor.getText().trim();
    if (!bodyText) return;

    setBusy(true);
    try {
      await onSubmit({
        // JSON round-trip on purpose. Tiptap's document is not guaranteed to
        // be a plain object graph, and React hands non-plain values to a
        // Server Action as an opaque client reference — which then fails the
        // moment the server touches it.
        body: JSON.parse(JSON.stringify(editor.getJSON())) as unknown,
        bodyText,
        mentionedProfileIds: collectMentionIds(editor),
      });
      editor.commands.clearContent();
      setEmpty(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "bg-surface border-border-strong rounded-[--radius-md] border",
          "focus-within:border-accent transition-colors duration-[--dur-fast]",
          disabled && "opacity-60",
        )}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={disabled || busy || !editor || empty}
        >
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <span className="text-muted ml-auto text-xs">@ to mention</span>
      </div>

      {/* Mention dropdown. Fixed-positioned at the caret, glass because it
          floats above content. */}
      {suggestion.items.length > 0 && suggestion.rect && (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="glass fixed z-50 w-64 rounded-[--radius-md] p-1"
          style={{ top: suggestion.rect.top + 4, left: suggestion.rect.left }}
        >
          {suggestion.items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === suggestion.selected}
                onMouseDown={(e) => {
                  // mousedown, not click: the editor loses focus on mouseup
                  // and the suggestion would exit before the command runs.
                  e.preventDefault();
                  suggestion.command?.({ id: item.id, label: label(item) });
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[--radius-sm] px-2 py-1.5 text-left text-sm",
                  index === suggestion.selected
                    ? "bg-accent-soft text-ink"
                    : "hover:bg-surface-2",
                )}
              >
                <Avatar
                  src={item.avatarUrl}
                  name={item.fullName}
                  email={item.email}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate">{label(item)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Walks the document for mention nodes.
 *
 * Read from the DOCUMENT rather than by scanning the text for "@name": the
 * text is ambiguous (two people can share a display name) while a mention node
 * carries the profile id that was actually chosen.
 */
function collectMentionIds(editor: Editor): string[] {
  const ids = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "mention") {
      const id = node.attrs.id;
      if (typeof id === "string") ids.add(id);
    }
  });
  return [...ids];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
