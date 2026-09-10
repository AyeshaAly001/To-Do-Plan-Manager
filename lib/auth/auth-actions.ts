"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  magicLinkSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { z } from "zod";

/**
 * Authentication actions.
 *
 * These sit outside `authedAction` on purpose: that wrapper requires a
 * session, and these are how a session comes to exist. They talk only to
 * Supabase Auth — never to application tables — so there is no tenancy
 * decision to make here.
 */

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
};

const flatten = (error: z.ZodError) =>
  z.flattenError(error).fieldErrors as Record<string, string[]>;

/** Absolute origin for auth redirect links, from the actual request. */
async function getOrigin(): Promise<string> {
  const h = await headers();
  // x-forwarded-* is what Vercel sets; fall back to host for local dev.
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/** Only ever redirect to a relative path — never a caller-supplied absolute URL. */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/home";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately does not distinguish "no such account" from "wrong
    // password": that difference is an account-enumeration oracle.
    return { error: "Incorrect email or password." };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(parsed.data.next));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error) };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the handle_new_auth_user trigger to populate profiles.full_name.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // With email confirmation enabled, Supabase returns a user but no session.
  // Say so rather than redirecting to a page that will bounce them back.
  if (data.user && !data.session) {
    return {
      success: `Check ${parsed.data.email} for a link to confirm your account.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error) };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeNext(parsed.data.next);

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Same message whether or not the account exists — otherwise this endpoint
  // becomes a way to test which emails are registered.
  return { success: `If that address has an account, a sign-in link is on its way.` };
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error) };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=%2Freset-password`,
  });

  // Response is intentionally identical regardless of outcome.
  return { success: "If that address has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error) };
  }

  const supabase = await createClient();

  // Requires the recovery session established by the callback route.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

/** OAuth start. Returns the provider URL for the client to navigate to. */
export async function startOAuth(provider: "google" | "github", next?: string) {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
    },
  });

  if (error || !data.url) {
    // Almost always "provider is not enabled" — these need client IDs and
    // secrets configured in the Supabase dashboard before they work.
    return {
      error: `${provider === "google" ? "Google" : "GitHub"} sign-in is not configured yet.`,
    };
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Drop the active-workspace hint too, so the next user on this browser does
  // not start out pointed at someone else's workspace.
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);

  revalidatePath("/", "layout");
  redirect("/login");
}
