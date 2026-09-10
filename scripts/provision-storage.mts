/**
 * Creates the Supabase Storage bucket for task attachments.
 *
 *   npm run provision:storage
 *
 * Idempotent — safe to re-run. Uses SUPABASE_SECRET_KEY, so it is a local
 * provisioning tool and never imported by application code.
 *
 * The bucket is PRIVATE. Downloads go through short-lived signed URLs issued
 * server-side after the authorization check, so a leaked path is useless on
 * its own. A public bucket would make every attachment world-readable to
 * anyone who learns the path, which for a task manager holding client work is
 * unacceptable.
 *
 * Limits are set on the bucket as well as in the app: the app check is the
 * good error message, the bucket check is the one that cannot be bypassed by
 * calling Storage directly with a stolen token.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error("  Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.");
  process.exit(1);
}

export const ATTACHMENTS_BUCKET = "task-attachments";

/** 10 MB. The free tier gives 1 GB total, so this keeps one file from eating it. */
const FILE_SIZE_LIMIT = 10 * 1024 * 1024;

/**
 * Deliberately no SVG.
 *
 * SVG is a script-execution vector: a crafted .svg served from your own origin
 * can run JavaScript. Since attachments are user-supplied, allowing it would
 * hand any workspace member stored XSS against their colleagues.
 */
const ALLOWED_MIME_TYPES = [
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
];

const headers = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};

const existing = await fetch(`${url}/storage/v1/bucket/${ATTACHMENTS_BUCKET}`, { headers });

if (existing.ok) {
  // Re-apply the settings, so changing a limit here takes effect on re-run
  // rather than silently doing nothing.
  const update = await fetch(`${url}/storage/v1/bucket/${ATTACHMENTS_BUCKET}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      public: false,
      file_size_limit: FILE_SIZE_LIMIT,
      allowed_mime_types: ALLOWED_MIME_TYPES,
    }),
  });

  if (!update.ok) {
    console.error(`  Bucket exists but could not be updated: ${await update.text()}`);
    process.exit(1);
  }
  console.log(`\n  Bucket "${ATTACHMENTS_BUCKET}" already existed — settings re-applied.`);
} else {
  const created = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: ATTACHMENTS_BUCKET,
      name: ATTACHMENTS_BUCKET,
      public: false,
      file_size_limit: FILE_SIZE_LIMIT,
      allowed_mime_types: ALLOWED_MIME_TYPES,
    }),
  });

  if (!created.ok) {
    console.error(`  Could not create the bucket: ${created.status} ${await created.text()}`);
    process.exit(1);
  }
  console.log(`\n  Created private bucket "${ATTACHMENTS_BUCKET}".`);
}

// Read it back rather than trusting the write — the point of the check is to
// confirm it is actually private.
const verify = await fetch(`${url}/storage/v1/bucket/${ATTACHMENTS_BUCKET}`, { headers });
const bucket = (await verify.json()) as {
  public?: boolean;
  file_size_limit?: number;
  allowed_mime_types?: string[];
};

console.log(`  public:      ${bucket.public} ${bucket.public ? "  <-- SHOULD BE FALSE" : ""}`);
console.log(`  size limit:  ${((bucket.file_size_limit ?? 0) / 1024 / 1024).toFixed(0)} MB`);
console.log(`  mime types:  ${bucket.allowed_mime_types?.length ?? 0} allowed (no SVG)`);
console.log("");

if (bucket.public) process.exit(1);
