import type { Metadata } from "next";
import Link from "next/link";

import { AuthDivider, OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl">Create your account</h1>
        <p className="text-muted text-sm">You will set up a workspace next.</p>
      </div>

      <OAuthButtons />
      <AuthDivider />
      <SignUpForm />

      <p className="text-muted text-center text-sm">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-accent rounded-[--radius-sm] font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
