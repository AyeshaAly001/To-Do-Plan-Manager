"use client";

import { Download, FileText, ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  confirmAttachmentUpload,
  deleteAttachment,
  getAttachmentDownloadUrl,
  requestAttachmentUpload,
} from "@/lib/collab/attachment-actions";
import { fetchAttachments } from "@/lib/collab/read-actions";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/validation/comment";
import { cn } from "@/lib/utils";

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { id: string; fullName: string | null; email: string };
};

/** 1.4 MB rather than 1468006 bytes. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Task attachments.
 *
 * Uploads go browser → Storage directly using a signed URL, so a 10 MB file
 * never passes through the Next server. The row is written only after the
 * bytes land: a row pointing at a failed upload would offer a broken
 * download, which is worse than an orphaned object.
 *
 * Download URLs are fetched per click and expire in a minute, so nothing in
 * this page's HTML is a working link to a private file.
 */
export function AttachmentPanel({
  taskId,
  currentUserId,
  canUpload,
  canDeleteAny,
}: {
  taskId: string;
  currentUserId: string;
  canUpload: boolean;
  canDeleteAny: boolean;
}) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await fetchAttachments({ taskId });
    if (result.ok) setItems(result.data as unknown as Attachment[]);
    else setError(result.error);
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAttachments({ taskId }).then((result) => {
      if (cancelled) return;
      if (result.ok) setItems(result.data as unknown as Attachment[]);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const upload = async (file: File) => {
    setError(undefined);

    // Checked here for a good message; the server and the bucket both enforce
    // it again, so this is convenience rather than the control.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`${file.name} is larger than 10 MB.`);
      return;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as never)) {
      setError(
        `${file.name} is a ${file.type || "unknown"} file, which is not allowed. SVG is excluded deliberately.`,
      );
      return;
    }

    setUploading(file.name);
    try {
      const signed = await requestAttachmentUpload({
        taskId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!signed.ok) {
        setError(signed.error);
        return;
      }

      const put = await fetch(signed.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        // No row was written, so there is nothing inconsistent to clean up.
        setError(`Upload of ${file.name} failed (${put.status}).`);
        return;
      }

      const confirmed = await confirmAttachmentUpload({
        taskId,
        storagePath: signed.data.storagePath,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!confirmed.ok) {
        setError(confirmed.error);
        return;
      }

      await load();
    } finally {
      setUploading(null);
    }
  };

  const download = (attachmentId: string) => {
    start(async () => {
      const result = await getAttachmentDownloadUrl({ attachmentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Opened rather than fetched: the browser handles Content-Disposition,
      // and the URL is single-purpose and short-lived.
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  };

  const remove = (attachmentId: string) => {
    start(async () => {
      const result = await deleteAttachment({ attachmentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await load();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Paperclip className="text-muted size-4" aria-hidden />
        <h4 className="font-display text-sm font-semibold">
          Files{" "}
          {items && items.length > 0 && (
            <span className="text-muted text-xs" data-numeric>
              {items.length}
            </span>
          )}
        </h4>
      </div>

      <FormError message={error} />

      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={cn(
            "border-border-strong rounded-[--radius-md] border border-dashed p-3 text-center",
            "transition-colors duration-[--dur-fast]",
            dragOver && "border-accent bg-accent-soft",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              // Reset so choosing the same file twice still fires onChange.
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(uploading)}
          >
            <Upload />
            {uploading ? `Uploading ${uploading}…` : "Choose a file"}
          </Button>
          <p className="text-muted mt-1.5 text-xs">
            or drop it here · up to 10 MB · images, PDF, documents
          </p>
        </div>
      )}

      {items === null ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted text-xs">No files attached.</p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((item) => {
            const isImage = item.mimeType.startsWith("image/");
            const canRemove = canDeleteAny || item.uploadedBy.id === currentUserId;

            return (
              <li key={item.id} className="flex items-center gap-2 py-1.5">
                <span className="text-muted shrink-0" aria-hidden>
                  {isImage ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.filename}</span>
                  <span className="text-muted block text-xs" data-numeric>
                    {formatBytes(item.sizeBytes)} ·{" "}
                    {item.uploadedBy.fullName ?? item.uploadedBy.email}
                  </span>
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => download(item.id)}
                  aria-label={`Download ${item.filename}`}
                  title="Download"
                >
                  <Download />
                </Button>

                {canRemove && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.filename}`}
                    title="Remove"
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
