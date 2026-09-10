import { z } from "zod";

/**
 * Auth input schemas, shared by the client form and the server action.
 *
 * One definition per shape so the two cannot drift — a client-only rule is a
 * suggestion, and a server-only rule produces errors the form cannot explain.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(320, "That email is too long")
  .email("Enter a valid email address")
  // Supabase lowercases emails; matching that here keeps our `profiles.email`
  // unique index consistent with what auth stores.
  .transform((v) => v.toLowerCase());

/**
 * Minimum 8 characters.
 *
 * Deliberately no composition rules (one upper, one symbol, …): they push
 * people toward predictable substitutions and reusable passwords, and NIST
 * SP 800-63B advises against them. Length is what matters. Note that Supabase
 * enforces its own project-level minimum (6 by default) — this is the
 * stricter of the two, so raise it there if you want it enforced at the API.
 */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Passwords are limited to 72 characters");

export const signInSchema = z.object({
  email: emailSchema,
  // Not `passwordSchema`: an existing account may predate the rule, and
  // telling someone their *stored* password is too short at sign-in is
  // useless. Only presence matters here.
  password: z.string().min(1, "Password is required"),
  /** Relative path to return to. Absolute URLs are rejected — open redirect. */
  next: z
    .string()
    .optional()
    .refine((v) => !v || (v.startsWith("/") && !v.startsWith("//")), "Invalid redirect"),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Your name is required").max(80, "That name is too long"),
  email: emailSchema,
  password: passwordSchema,
});

export const magicLinkSchema = z.object({
  email: emailSchema,
  next: z
    .string()
    .optional()
    .refine((v) => !v || (v.startsWith("/") && !v.startsWith("//")), "Invalid redirect"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Your name is required").max(80),
  timezone: z.string().trim().min(1).max(64),
  weeklyCapacityHours: z.coerce
    .number()
    .int("Whole hours only")
    .min(0, "Cannot be negative")
    .max(168, "There are only 168 hours in a week"),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
