import { redirect } from "next/navigation";

/**
 * Phase 0: the only thing built is the design system, so land there.
 * Phase 1 replaces this with an auth check — session -> /home, otherwise
 * -> /login.
 */
export default function RootPage() {
  redirect("/design");
}
