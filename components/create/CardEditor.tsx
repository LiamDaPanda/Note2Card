"use client";

import { Copy, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";

import { AutoTextarea } from "@/components/ui/AutoTextarea";
import { cn } from "@/components/ui/cn";
import type { Card, CardIssue } from "@/lib/ai/schemas";

export function CardEditor({
  card,
  index,
  issues,
  busy,
  onEdit,
  onDelete,
  onDuplicate,
  onRegenerate,
}: {
  card: Card;
  index: number;
  issues: CardIssue[];
  busy: boolean;
  onEdit: (patch: Partial<Card>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRegenerate: () => void;
}) {
  const flagged = issues.length > 0;

  return (
    <li
      id={`card-${card.id}`}
      className={cn(
        "n2c-rise group relative rounded-2xl border bg-surface transition-colors",
        flagged ? "border-warn/40" : "border-line",
      )}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className="mt-1 w-6 shrink-0 text-sm tabular-nums text-ink-3">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              Front
            </span>
            <AutoTextarea
              value={card.front}
              onChange={(e) => onEdit({ front: e.target.value })}
              placeholder="The question or term"
              className="mt-1 font-medium leading-relaxed"
            />
          </label>

          <div className="border-t border-line" />

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              Back
            </span>
            <AutoTextarea
              value={card.back}
              onChange={(e) => onEdit({ back: e.target.value })}
              placeholder="The answer or definition"
              className="mt-1 leading-relaxed text-ink-2"
            />
          </label>
        </div>

        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <IconButton label="Regenerate this card" onClick={onRegenerate} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden className="size-4" />
            )}
          </IconButton>
          <IconButton label="Duplicate this card" onClick={onDuplicate}>
            <Copy aria-hidden className="size-4" />
          </IconButton>
          <IconButton label="Delete this card" onClick={onDelete} danger>
            <Trash2 aria-hidden className="size-4" />
          </IconButton>
        </div>
      </div>

      {flagged ? (
        <ul className="space-y-1.5 border-t border-warn/25 bg-warn-soft px-4 py-3 sm:px-5">
          {issues.map((issue) => (
            <li key={issue.kind} className="flex items-start gap-2 text-sm text-warn">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2",
        danger ? "hover:text-danger" : "hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}
