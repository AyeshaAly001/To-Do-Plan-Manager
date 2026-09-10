"use client";

import { useState, useTransition } from "react";

import { startOAuth } from "@/lib/auth/auth-actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

/**
 * Google and GitHub sign-in.
 *
 * These are inert until the providers are configured with client IDs and
 * secrets in the Supabase dashboard (Authentication -> Providers). Rather than
 * hide them or let them fail with a raw Supabase error, `startOAuth` returns a
 * clear "not configured yet" message — a dead button with no explanation is
 * worse than an honest one.
 */

function GoogleMark() {
  // Google's brand guidelines mandate these exact colours, and a brand mark
  // must NOT follow our theme — so these four are a deliberate exception to
  // the no-hardcoded-colour rule. GitHub's mark uses currentColor instead,
  // because its logo is monochrome and inherits correctly.
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

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.99 7.99 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function OAuthButtons({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [provider, setProvider] = useState<"google" | "github">();

  const go = (p: "google" | "github") => {
    setError(undefined);
    setProvider(p);
    startTransition(async () => {
      // On success this redirects and never returns.
      const result = await startOAuth(p, next);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="space-y-3">
      <FormError message={error} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => go("google")}
          disabled={pending}
        >
          <GoogleMark />
          {pending && provider === "google" ? "Redirecting…" : "Google"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => go("github")}
          disabled={pending}
        >
          <GitHubMark />
          {pending && provider === "github" ? "Redirecting…" : "GitHub"}
        </Button>
      </div>
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
