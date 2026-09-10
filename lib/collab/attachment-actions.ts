"use server";

import { randomUUID } from "node:crypto";

import { authedAction } from "@/lib/auth/action";
import { prisma } from "@/lib/db/prisma";
import { assertTaskAccess } from "@/lib/projects/access";
import {
  attachmentSchema,
  confirmUploadSchema,
  requestUploadSchema,
} from "@/lib/validation/comment";

/**
 * Task attachments, stored in a PRIVATE Supabase Storage bucket.
 *
 * The flow is deliberately three steps:
 *
 *   1. `requestAttachmentUpload` — authorize, then hand back a signed upload
 *      URL scoped to one path.
 *   2. The browser PUTs the bytes straight to Storage. They never pass through
 *      the Next server, which would mean buffering a 10 MB body in a serverless
 *      function for no reason.
 *   3. `confirmAttachmentUpload` — record the row once the bytes are there.
 *
 * The database row is written LAST on purpose: a row pointing at a file that
 * failed to upload is worse than an orphaned file, because the UI would offer
 * a broken download. Orphans are recoverable by a sweep; broken rows are user-
 * visible.
 */

const BUCKET = "task-attachments";

/** Downloads expire quickly — a leaked link should stop working. */
const SIGNED_DOWNLOAD_SECONDS = 60;
/** Uploads get longer, since a large file on a slow link takes a while. */
const SIGNED_UPLOAD_SECONDS = 15 * 60;

function storageHeaders() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not configured; attachments are unavailable");
  }
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

function storageUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  // Normalise both forms. Storage's sign endpoints return a path like
  // "/object/upload/sign/<bucket>/<key>?token=..." — relative, with a leading
  // slash and WITHOUT the /storage/v1 prefix. Joining that naively yields a
  // double slash, which some proxies then reject.
  const normalised = path.replace(/^\/+/, "").replace(/^storage\/v1\//, "");
  return `${base}/storage/v1/${normalised}`;
}

/**
 * Strips anything that could escape the intended path.
 *
 * The stored path is built from a uuid, so the original name is only kept for
 * display — but it is also sent to Storage as `x-upsert` metadata and used as
 * the download filename, so it still needs cleaning.
 */
function safeFilename(name: string): string {
  return (
    name
      .replace(/[/\\]/g, "-")
      .replace(/\.{2,}/g, ".")
      .replace(/[^\w.\-() ]/g, "_")
      .slice(0, 200) || "file"
  );
}

export const requestAttachmentUpload = authedAction({
  capability: "attachment.upload",
  schema: requestUploadSchema,
  handler: async ({ taskId, filename, mimeType, sizeBytes }, ctx) => {
    await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    // Workspace-scoped path, so a storage listing is at least organised by
    // tenant. It is NOT the access control — the bucket is private and every
    // read goes through a signed URL issued after this check.
    const path = `${ctx.workspace.workspaceId}/${taskId}/${randomUUID()}/${safeFilename(filename)}`;

    const response = await fetch(storageUrl(`object/upload/sign/${BUCKET}/${path}`), {
      method: "POST",
      headers: storageHeaders(),
      body: JSON.stringify({ expiresIn: SIGNED_UPLOAD_SECONDS }),
    });

    if (!response.ok) {
      console.error(
        `[attachments] sign upload failed: ${response.status}`,
        await response.text(),
      );
      throw new Error("Could not prepare the upload");
    }

    // Verified against the live API: this returns { url, token }, where url is
    // a relative path carrying the token as a query parameter.
    const { url } = (await response.json()) as { url: string; token: string };

    return {
      // Absolute URL for the browser to PUT the bytes to directly.
      uploadUrl: storageUrl(url),
      storagePath: path,
      sizeBytes,
      mimeType,
    };
  },
});

export const confirmAttachmentUpload = authedAction({
  capability: "attachment.upload",
  schema: confirmUploadSchema,
  handler: async ({ taskId, storagePath, filename, mimeType, sizeBytes }, ctx) => {
    await assertTaskAccess(taskId, ctx.workspace, ctx.user.id);

    // The path must be inside this workspace's prefix. Without this check a
    // caller could register a row pointing at another tenant's object and
    // then download it through our own signed-URL endpoint.
    if (!storagePath.startsWith(`${ctx.workspace.workspaceId}/${taskId}/`)) {
      throw new Error("That storage path does not belong to this task");
    }

    const attachment = await prisma.attachment.create({
      data: {
        taskId,
        storagePath,
        filename: safeFilename(filename),
        mimeType,
        sizeBytes,
        uploadedById: ctx.user.id,
      },
      select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    });

    await ctx.audit({
      entityType: "task",
      entityId: taskId,
      action: "attachment_added",
      diff: { attachmentId: attachment.id, filename: attachment.filename, sizeBytes },
    });

    return attachment;
  },
});

/**
 * Issues a short-lived download URL.
 *
 * Signed per request, after the access check — never stored and never returned
 * alongside the attachment list, so a page response cannot leak working links
 * for files the viewer may no longer be allowed to see by the time they click.
 */
export const getAttachmentDownloadUrl = authedAction({
  capability: "task.view",
  schema: attachmentSchema,
  handler: async ({ attachmentId }, ctx) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId },
      select: { id: true, taskId: true, storagePath: true, filename: true },
    });
    if (!attachment) throw new Error("Attachment not found");

    // The real gate: can this person see the task it hangs off?
    await assertTaskAccess(attachment.taskId, ctx.workspace, ctx.user.id);

    const response = await fetch(
      storageUrl(`object/sign/${BUCKET}/${attachment.storagePath}`),
      {
        method: "POST",
        headers: storageHeaders(),
        body: JSON.stringify({ expiresIn: SIGNED_DOWNLOAD_SECONDS }),
      },
    );

    if (!response.ok) {
      console.error(`[attachments] sign download failed: ${response.status}`);
      throw new Error("Could not prepare the download");
    }

    const { signedURL } = (await response.json()) as { signedURL: string };
    return {
      url: storageUrl(signedURL),
      filename: attachment.filename,
      expiresInSeconds: SIGNED_DOWNLOAD_SECONDS,
    };
  },
});

export const deleteAttachment = authedAction({
  capability: "attachment.upload",
  schema: attachmentSchema,
  handler: async ({ attachmentId }, ctx) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId },
      select: {
        id: true,
        taskId: true,
        storagePath: true,
        filename: true,
        uploadedById: true,
      },
    });
    if (!attachment) throw new Error("Attachment not found");
    await assertTaskAccess(attachment.taskId, ctx.workspace, ctx.user.id);

    if (attachment.uploadedById !== ctx.user.id) {
      const { can } = await import("@/lib/auth/rbac");
      if (!can(ctx.workspace.role, "attachment.delete_any")) {
        throw new Error("You can only remove files you uploaded");
      }
    }

    // Row first, then the object. If the object delete fails we are left with
    // an orphaned file — invisible and sweepable — rather than a row whose
    // download 404s, which the user would see.
    await prisma.attachment.delete({ where: { id: attachmentId } });

    const response = await fetch(storageUrl(`object/${BUCKET}`), {
      method: "DELETE",
      headers: storageHeaders(),
      body: JSON.stringify({ prefixes: [attachment.storagePath] }),
    });
    if (!response.ok) {
      console.error(
        `[attachments] orphaned object left in storage: ${attachment.storagePath}`,
        await response.text(),
      );
    }

    await ctx.audit({
      entityType: "task",
      entityId: attachment.taskId,
      action: "attachment_removed",
      diff: { filename: attachment.filename },
    });

    return { attachmentId };
  },
});
