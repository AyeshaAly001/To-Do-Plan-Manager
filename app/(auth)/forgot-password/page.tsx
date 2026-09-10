import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl">Reset your password</h1>
        <p className="text-muted text-sm">We will email you a link to choose a new one.</p>
      </div>

      <ForgotPasswordForm />

      <p className="text-muted text-center text-sm">
        <Link
          href="/login"
          className="text-accent rounded-[--radius-sm] font-medium hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
