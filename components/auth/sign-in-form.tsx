"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { signIn, sendMagicLink, type AuthState } from "@/lib/auth/auth-actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMPTY: AuthState = {};

/**
 * Sign-in, with password and magic link in one form.
 *
 * They share the email field rather than living on separate pages, because
 * making someone re-type their address to switch method is the kind of small
 * friction that makes people give up.
 *
 * `useActionState` keeps the server's field errors attached to the inputs
 * across the round trip, and `pending` comes from the same hook so the button
 * cannot be double-submitted.
 */
export function SignInForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");

  const [passwordState, passwordAction, passwordPending] = useActionState(signIn, EMPTY);
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, EMPTY);

  const state = mode === "password" ? passwordState : magicState;
  const pending = mode === "password" ? passwordPending : magicPending;
  const firstError = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <div className="space-y-4">
      {/* An error handed over by the callback route (expired link, denied consent). */}
      <FormError message={state.error ?? initialError} />
      <FormSuccess message={state.success} />

      <form
        action={mode === "password" ? passwordAction : magicAction}
        className="space-y-4"
        noValidate
      >
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <Field label="Email" error={firstError("email")} required>
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
            />
          )}
        </Field>

        {mode === "password" && (
          <Field label="Password" error={firstError("password")} required>
            {(props) => (
              <Input
                {...props}
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            )}
          </Field>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending
            ? mode === "password"
              ? "Signing in…"
              : "Sending…"
            : mode === "password"
              ? "Sign in"
              : "Email me a sign-in link"}
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setMode(mode === "password" ? "magic" : "password")}
          className="text-accent rounded-[--radius-sm] font-medium hover:underline"
        >
          {mode === "password" ? "Use a sign-in link instead" : "Use a password instead"}
        </button>

        {mode === "password" && (
          <Link
            href="/forgot-password"
            className="text-muted rounded-[--radius-sm] hover:underline"
          >
            Forgot password?
          </Link>
        )}
      </div>
    </div>
  );
}
