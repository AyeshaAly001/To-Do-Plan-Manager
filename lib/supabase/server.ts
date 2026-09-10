import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Must be created per-request — never hoisted to a module-level singleton,
 * because it closes over that request's cookies. A shared instance would leak
 * one user's session into another user's request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. That is expected and
            // harmless: the Proxy (proxy.ts) refreshes tokens and writes them
            // on every request, so the session still stays current. Only
            // Server Actions and Route Handlers can set them here.
          }
        },
      },
    },
  );
}
