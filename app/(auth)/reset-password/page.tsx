import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Reached only via the emailed recovery link, which the auth callback route
 * turns into a recovery session before redirecting here. It is deliberately
 * not in the proxy's PROTECTED_PREFIXES: the user is mid-recovery and has a
 * session, but bouncing them to /home would defeat the purpose.
 */
export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl">Choose a new password</h1>
        <p className="text-muted text-sm">You will be signed in afterwards.</p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
