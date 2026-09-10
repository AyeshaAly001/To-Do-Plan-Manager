import type { Metadata } from "next";
import Link from "next/link";

import { AuthDivider, OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * `next` carries the path the proxy bounced them from, so signing in returns
 * them where they were going. `error` is set by the auth callback route when a
 * link has expired.
 *
 * Both come from the URL, so both are treated as untrusted: `next` is
 * validated as a relative path before any redirect (see safeNext), and `error`
 * is rendered as text, never as markup.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl">Welcome back</h1>
        <p className="text-muted text-sm">Sign in to your workspace.</p>
      </div>

      <OAuthButtons next={next} />
      <AuthDivider />
      <SignInForm next={next} initialError={error} />

      <p className="text-muted text-center text-sm">
        New here?{" "}
        <Link
          href="/signup"
          className="text-accent rounded-[--radius-sm] font-medium hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
