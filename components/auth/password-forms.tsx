"use client";

import { useActionState } from "react";

import { requestPasswordReset, updatePassword, type AuthState } from "@/lib/auth/auth-actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMPTY: AuthState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, EMPTY);

  // The response is identical whether or not the account exists, so there is
  // nothing more to show once it has been sent.
  if (state.success) {
    return <FormSuccess message={state.success} />;
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />

      <Field label="Email" error={state.fieldErrors?.email?.[0]} required>
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

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

/**
 * Sets a new password. Only works with the recovery session that the auth
 * callback route establishes, which is why this page is reached through the
 * emailed link rather than linked from anywhere.
 */
export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, EMPTY);
  const firstError = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />

      <Field
        label="New password"
        hint="At least 8 characters."
        error={firstError("password")}
        required
      >
        {(props) => (
          <Input
            {...props}
            name="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            placeholder="••••••••"
          />
        )}
      </Field>

      <Field label="Confirm password" error={firstError("confirmPassword")} required>
        {(props) => (
          <Input
            {...props}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        )}
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
