import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where every out-of-band auth flow lands: OAuth, magic link, email
 * confirmation and password recovery.
 *
 * Supabase sends one of two shapes:
 *   - `?code=...`                 PKCE (OAuth, and newer email links)
 *   - `?token_hash=...&type=...`  email OTP links
 *
 * Both are handled, because which one arrives depends on the project's email
 * template settings and can change without the app changing.
 *
 * Exchanging the code is what actually creates the session cookies, so this
 * must be a Route Handler — Server Components cannot write cookies.
 */

/** Never redirect to a caller-supplied absolute URL: that is an open redirect. */
function safeNext(value: string | null): string {
  if (!value) return "/home";
  // Reject protocol-relative ("//evil.com") and absolute URLs alike.
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));

  // Supabase reports failures (expired link, denied consent) as query params
  // rather than a non-2xx, so check them before trying to exchange anything.
  const authError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (authError) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", errorDescription ?? authError);
    return NextResponse.redirect(login);
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const login = new URL("/login", url.origin);
      login.searchParams.set("error", "That sign-in link is invalid or has expired.");
      return NextResponse.redirect(login);
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "email" | "recovery" | "invite" | "magiclink" | "signup" | "email_change",
      token_hash: tokenHash,
    });
    if (error) {
      const login = new URL("/login", url.origin);
      login.searchParams.set("error", "That link is invalid or has expired.");
      return NextResponse.redirect(login);
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // Reached with neither a code nor a token — someone opened the URL directly.
  const login = new URL("/login", url.origin);
  login.searchParams.set("error", "That sign-in link was incomplete.");
  return NextResponse.redirect(login);
}
