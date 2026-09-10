import { z } from "zod";

/**
 * Comment and attachment input.
 *
 * `body` (the rich-text document) and `bodyText` (its plain-text mirror) are
 * both sent. The mirror is what search, notification previews and email use,
 * none of which can render a document — and deriving it server-side would mean
 * re-implementing the editor's serialisation.
 *
 * `mentionedProfileIds` comes from the editor's mention nodes rather than being
 * re-parsed out of the text. The server still validates every id against
 * workspace membership, so a forged list buys nothing.
 */

/**
 * A JSON value, validated recursively.
 *
 * `z.unknown()` was wrong twice over. It let ANY value into a JSONB column
 * without inspection, and it passed the value through untouched — so a
 * non-plain object arriving from a client component reached Prisma as an
 * opaque React client reference and blew up with "cannot access toStringTag
 * on the server".
 *
 * Parsing with this rebuilds the value as plain data, which both validates the
 * shape and guarantees something Prisma can serialise.
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const createCommentSchema = z.object({
  taskId: z.string().uuid(),
  body: jsonValueSchema.nullable().optional(),
  bodyText: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(20_000, "That comment is too long"),
  parentCommentId: z.string().uuid().nullable().optional(),
  mentionedProfileIds: z.array(z.string().uuid()).max(50).optional(),
});

export const updateCommentSchema = z.object({
  commentId: z.string().uuid(),
  body: jsonValueSchema.nullable().optional(),
  bodyText: z.string().trim().min(1, "Write something first").max(20_000),
  mentionedProfileIds: z.array(z.string().uuid()).max(50).optional(),
});

export const deleteCommentSchema = z.object({ commentId: z.string().uuid() });

export const toggleReactionSchema = z.object({
  commentId: z.string().uuid(),
  /**
   * A short allowlist rather than "any string".
   *
   * Free-text here would let someone store arbitrary content — including
   * lookalike or abusive strings — in a field the UI renders verbatim to every
   * viewer. A fixed set keeps it a reaction rather than a second comment box.
   */
  emoji: z.enum(["👍", "🎉", "❤️", "👀", "🙏", "😄", "🚀", "😕"]),
});

// --- attachments ------------------------------------------------------------

/** 10 MB, matching the bucket's own limit. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const requestUploadSchema = z.object({
  taskId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  /**
   * SVG is deliberately absent: a crafted .svg served from our own origin can
   * execute JavaScript, which would be stored XSS against colleagues.
   */
  mimeType: z.enum(ALLOWED_ATTACHMENT_TYPES),
  sizeBytes: z
    .number()
    .int()
    .positive("That file is empty")
    .max(MAX_ATTACHMENT_BYTES, "Files are limited to 10 MB"),
});

export const confirmUploadSchema = z.object({
  taskId: z.string().uuid(),
  storagePath: z.string().min(1).max(500),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_ATTACHMENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});

export const attachmentSchema = z.object({ attachmentId: z.string().uuid() });

// --- notifications ----------------------------------------------------------

export const markNotificationsSchema = z.object({
  /** Omit to mark everything read. */
  notificationIds: z.array(z.string().uuid()).max(200).optional(),
});
