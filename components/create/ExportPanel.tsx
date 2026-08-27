"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";

import { csvFilename, formatCards, toCsv, type ExportFormat } from "@/lib/export";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import type { Card } from "@/lib/ai/schemas";

const TARGETS: { format: ExportFormat; title: string; body: string; cta: string }[] = [
  {
    format: "quizlet",
    title: "Quizlet",
    body: "Tab between the two sides, one card per line. Paste into Quizlet's Import box with “Tab” selected.",
    cta: "Copy for Quizlet",
  },
  {
    format: "brainscape",
    title: "Brainscape",
    body: "Two comma-separated columns, question first — the shape Brainscape's bulk importer expects.",
    cta: "Copy for Brainscape",
  },
  {
    format: "plain",
    title: "Plain text",
    body: "Front and back on separate lines, a blank line between cards. For a doc or a message.",
    cta: "Copy as plain text",
  },
];

export function ExportPanel({ cards }: { cards: Card[] }) {
  const toast = useToast();
  const [copied, setCopied] = useState<ExportFormat | null>(null);

  async function copy(format: ExportFormat) {
    const text = formatCards(cards, format);
    const ok = await writeClipboard(text);
    if (!ok) {
      toast.show("Couldn't reach the clipboard — try selecting and copying manually.");
      return;
    }
    setCopied(format);
    window.setTimeout(() => setCopied((c) => (c === format ? null : c)), 2000);
    toast.show("Copied to clipboard!");
  }

  function download() {
    const blob = new Blob([toCsv(cards)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = csvFilename();
    anchor.click();
    URL.revokeObjectURL(url);
    toast.show("CSV downloaded");
  }

  const disabled = cards.length === 0;

  return (
    <section aria-labelledby="export-heading" className="space-y-3">
      <h2 id="export-heading" className="text-sm font-semibold text-ink">
        Export {cards.length} card{cards.length === 1 ? "" : "s"}
      </h2>

      {TARGETS.map((target) => (
        <div key={target.format} className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="font-medium text-ink">{target.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{target.body}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => copy(target.format)}
            className={cn(
              "mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
              copied === target.format
                ? "bg-ok-soft text-ok"
                : "bg-accent text-accent-ink hover:bg-accent-hover",
              "disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-3",
            )}
          >
            {copied === target.format ? (
              <>
                <Check aria-hidden className="size-4" />
                Copied to clipboard!
              </>
            ) : (
              <>
                <Copy aria-hidden className="size-4" />
                {target.cta}
              </>
            )}
          </button>
        </div>
      ))}

      <div className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="font-medium text-ink">Anki / CSV</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          A <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">Front,Back</code> file
          that imports into Anki, Excel, or Sheets.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={download}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-3"
        >
          <Download aria-hidden className="size-4" />
          Download CSV
        </button>
      </div>
    </section>
  );
}

/**
 * The async clipboard API needs a secure context and a user gesture, and is
 * blocked outright in some embedded browsers. Fall back to a hidden textarea.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
