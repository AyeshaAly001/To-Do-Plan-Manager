"use client";

import { useState, useTransition } from "react";

import { startOAuth } from "@/lib/auth/auth-actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

/**
 * Google sign-in.
 *
 * GitHub was deliberately removed from the sign-in options. `startOAuth` still
 * accepts it, so restoring it means adding one button back — see git history
 * for the mark and the button.
 *
 * This is inert until Google is configured with a client ID and secret in the
 * Supabase dashboard (Authentication -> Providers). Rather than hide it or let
 * it fail with a raw Supabase error, `startOAuth` returns a clear "not
 * configured yet" message — a dead button with no explanation is worse than an
 * honest one.
 */

function GoogleMark() {
  // Google's brand guidelines mandate these exact colours, and a brand mark
  // must NOT follow our theme — so these four are a deliberate exception to
  // the no-hardcoded-colour rule.
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-4">
      <path
        // allow-hardcoded-color: Google brand mark, must not be themed
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        // allow-hardcoded-color: Google brand mark, must not be themed
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        // allow-hardcoded-color: Google brand mark, must not be themed
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        // allow-hardcoded-color: Google brand mark, must not be themed
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function OAuthButtons({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const go = () => {
    setError(undefined);
    startTransition(async () => {
      // On success this redirects and never returns.
      const result = await startOAuth("google", next);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="space-y-3">
      <FormError message={error} />

      <Button
        type="button"
        variant="secondary"
        onClick={go}
        disabled={pending}
        className="w-full"
      >
        <GoogleMark />
        {pending ? "Redirecting…" : "Continue with Google"}
      </Button>
    </div>
  );
}

/** "or" rule between OAuth and the email form. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="bg-border h-px flex-1" />
      <span className="text-muted text-xs">{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
