import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

/**
 * Entry point.
 *
 * Signed in -> the app. Otherwise -> sign in. The app shell then decides
 * whether they need onboarding, so that branch does not have to be duplicated
 * here.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/home" : "/login");
}
