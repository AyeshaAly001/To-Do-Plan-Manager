import type { Metadata } from "next";

import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { getMemberships, requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Create your workspace" };

/**
 * First-run: create a workspace.
 *
 * Lives in the `(auth)` group because it needs the centered shell — there is
 * no workspace yet, so the app sidebar has nothing to navigate. It is NOT an
 * auth route as far as the proxy is concerned: `/onboarding` is in
 * PROTECTED_PREFIXES (signed-in only) but absent from AUTH_ROUTES, so a
 * signed-in user is allowed to stay here.
 *
 * Anyone who already has a workspace is sent on, so this page cannot become a
 * way to accumulate empty workspaces by revisiting the URL.
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);

  if (memberships.length > 0) {
    redirect("/home");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl">Create your workspace</h1>
        <p className="text-muted text-sm">
          A workspace holds your projects, tasks and teammates. You can invite people once it
          exists.
        </p>
      </div>

      <CreateWorkspaceForm />
    </div>
  );
}
