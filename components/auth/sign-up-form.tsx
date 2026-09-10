"use client";

import { useActionState } from "react";

import { signUp, type AuthState } from "@/lib/auth/auth-actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMPTY: AuthState = {};

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, EMPTY);
  const firstError = (field: string) => state.fieldErrors?.[field]?.[0];

  // Once the confirmation email is sent there is nothing left to do on this
  // page — showing the form again invites a pointless second submit.
  if (state.success) {
    return <FormSuccess message={state.success} />;
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />

      <Field label="Your name" error={firstError("fullName")} required>
        {(props) => (
          <Input
            {...props}
            name="fullName"
            autoComplete="name"
            autoFocus
            placeholder="Ayesha"
          />
        )}
      </Field>

      <Field label="Email" error={firstError("email")} required>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        )}
      </Field>

      <Field
        label="Password"
        hint="At least 8 characters. Length matters more than symbols."
        error={firstError("password")}
        required
      >
        {(props) => (
          <Input
            {...props}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        )}
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
