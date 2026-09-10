"use client";

// Client component: `useId` is a hook, and the render-prop `children` is a
// function, which cannot cross the server/client boundary anyway. Every form
// that uses this is interactive, so this costs nothing.
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Label + control + error message, wired together.
 *
 * Exists so no form has to remember to connect `htmlFor`/`id`, or to set
 * `aria-describedby` and `aria-invalid` when an error appears. Getting those
 * wrong is invisible to sighted users and completely breaks the form for a
 * screen reader, so the wiring is done once here.
 *
 * The control is a render prop rather than `children`, because it needs the
 * generated ids.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  /** First message from the server's `fieldErrors`, if any. */
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    required?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // Point at the error when there is one, otherwise the hint. Announcing both
  // buries the actionable message.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="font-display text-ink block text-sm font-medium">
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
        required,
      })}

      {error ? (
        // role="alert" so it is announced when it appears after a submit.
        <p id={errorId} role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Form-level error — the one that isn't attached to a single field
 * ("incorrect email or password", "something went wrong").
 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="bg-danger/15 text-danger rounded-[--radius-md] px-3 py-2 text-sm"
    >
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="bg-success/15 text-success rounded-[--radius-md] px-3 py-2 text-sm"
    >
      {message}
    </p>
  );
}
