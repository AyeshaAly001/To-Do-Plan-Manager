"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components.
 *
 * Scope note — this client is used for exactly three things:
 *   1. auth (sign in/out, OAuth redirects, password reset)
 *   2. Storage uploads (avatars, attachments — Phase 4)
 *   3. Realtime subscriptions (Phase 4)
 *
 * It is NEVER used to query business tables. Those go through Server Actions
 * so authorization runs in `lib/auth/action.ts`. The database also refuses
 * this key outright: RLS is deny-all and the public roles hold no grants
 * (verified by `npm run verify:security`), so a query here would return
 * nothing even if someone tried.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
