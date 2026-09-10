import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (Next.js 16's rename of middleware).
 *
 * It does exactly two jobs:
 *
 *   1. REFRESH the auth session. Server Components cannot write cookies, so
 *      without this the access token would expire mid-session and the user
 *      would be silently logged out. This is the only place tokens get
 *      rotated.
 *
 *   2. REDIRECT unauthenticated visitors away from app routes. This is a
 *      user-experience concern, not the security boundary.
 *
 * IT IS NOT THE SECURITY BOUNDARY. Next's own docs are explicit about why:
 * Server Functions are POSTs to whatever route they are used on, so a matcher
 * change or moving an action to another route can silently drop proxy
 * coverage. Real authorization therefore lives in `lib/auth/action.ts`, which
 * every mutation goes through, and the database additionally refuses the
 * public key outright (RLS deny-all).
 *
 * Deliberately does no database work: the proxy runs on every matched request
 * and may be deployed to the edge, so it stays limited to the auth cookie
 * round-trip.
 */

/** Routes that require a session. */
const PROTECTED_PREFIXES = [
  "/home",
  "/inbox",
  "/my-tasks",
  "/projects",
  "/goals",
  "/reports",
  "/team",
  "/settings",
  "/onboarding",
];

/** Auth pages a signed-in user should not see. */
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  // Start from a pass-through response; Supabase writes refreshed cookies onto
  // both the request (so this render sees them) and the response (so the
  // browser stores them).
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser(), never getSession(): getSession trusts the cookie without
  // verifying it against the auth server, so it must not drive access
  // decisions. This call is also what triggers the token refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname === p);

  if (!user && isProtected) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    // Preserve where they were headed so login can send them back, but only
    // ever as a relative path — taking an absolute URL here would be an open
    // redirect.
    login.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }

  if (user && isAuthRoute) {
    const home = request.nextUrl.clone();
    home.pathname = "/home";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  /**
   * Everything except static assets and the auth callback.
   *
   * Without a matcher the proxy runs on `_next/static`, images and public
   * files too, which would put an auth round-trip in front of every CSS and
   * font request.
   *
   * `/api` is excluded because route handlers authenticate themselves — the
   * cron endpoint uses CRON_SECRET, and future handlers will use
   * `authedAction`'s primitives.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
