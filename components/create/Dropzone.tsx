"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";

import { formatBytes, isAcceptedImage, isPdf, MAX_FILES } from "@/lib/image";
import { cn } from "@/components/ui/cn";
import type { UploadedFile } from "./state";

export function Dropzone({
  files,
  onAdd,
  onRemove,
  disabled,
}: {
  files: UploadedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const usable = Array.from(list).filter(
        (f) => isAcceptedImage(f.type) || isPdf(f.type),
      );
      if (usable.length > 0) onAdd(usable.slice(0, MAX_FILES - files.length));
    },
    [files.length, onAdd],
  );

  const full = files.length >= MAX_FILES;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !full) accept(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed p-8 text-center transition-colors duration-150 sm:p-10",
          dragging ? "border-accent bg-accent-soft" : "border-line bg-surface-2",
          (disabled || full) && "opacity-60",
        )}
      >
        <Upload aria-hidden className="mx-auto size-6 text-ink-3" />
        <p className="mt-3 font-medium text-ink">
          {full ? `That's the ${MAX_FILES}-file limit` : "Drop photos or PDFs here"}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          Photos of handwriting, printed pages, or a PDF study guide.
        </p>
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:text-ink-3"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(e) => {
            accept(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="n2c-rise flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <Thumbnail file={file} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                <p className="truncate text-xs text-ink-3">
                  {file.status === "reading" ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Loader2 aria-hidden className="size-3 animate-spin" />
                      Reading…
                    </span>
                  ) : file.status === "error" ? (
                    <span className="text-danger">{file.error ?? "Couldn't read this file"}</span>
                  ) : file.status === "done" ? (
                    `${formatBytes(file.size)} · read`
                  ) : (
                    formatBytes(file.size)
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Thumbnail({ file }: { file: UploadedFile }) {
  if (file.previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote asset
      <img
        src={file.previewUrl}
        alt=""
        className="size-10 shrink-0 rounded-lg border border-line object-cover"
      />
    );
  }

  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3">
      {file.kind === "pdf" ? (
        <FileText aria-hidden className="size-4" />
      ) : (
        <ImageIcon aria-hidden className="size-4" />
      )}
    </div>
  );
}
