"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";

import type { Card, CardCount, CardStyle, Difficulty } from "@/lib/ai/schemas";
import { downscale, isPdf } from "@/lib/image";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";

import { CardEditor } from "./CardEditor";
import { Dropzone } from "./Dropzone";
import { ExportPanel } from "./ExportPanel";
import { clearDraft, loadDraft, loadUserKey, saveDraft } from "./persist";
import { checkQuota, recordRun, remaining } from "./quotaStore";
import {
  hasSource,
  initialState,
  issueKey,
  reducer,
  sourceText,
  type UploadedFile,
} from "./state";

const COUNTS: { value: CardCount; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 30, label: "30" },
  { value: 50, label: "50" },
];

const STYLES: { value: CardStyle; label: string }[] = [
  { value: "term-definition", label: "Term → Definition" },
  { value: "question-answer", label: "Question → Answer" },
  { value: "mixed", label: "Mixed" },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "standard", label: "Standard" },
  { value: "hard", label: "Hard" },
];

const PROGRESS = [
  "Reading your notes…",
  "Finding the key concepts…",
  "Writing your cards…",
];

export function Workspace({ startInTextMode }: { startInTextMode: boolean }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const toast = useToast();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // Restore the draft and every browser-only value once, on mount. Nothing that
  // touches localStorage may be read during render — the server has no such
  // storage, and the differing markup would fail hydration.
  useEffect(() => {
    const draft = loadDraft() ?? {};
    dispatch({
      type: "hydrate",
      state: { ...draft, userKey: loadUserKey(), remainingText: remaining("text") },
    });
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) saveDraft(state);
  }, [state]);

  useEffect(() => {
    if (startInTextMode) textRef.current?.focus();
  }, [startInTextMode]);

  // Cycle the progress copy so a long generation doesn't look frozen. The
  // counter is reset where the work starts, not here — resetting inside the
  // effect body would trigger a cascading render on every phase change.
  useEffect(() => {
    if (state.phase !== "generating" && state.phase !== "extracting") return;
    const timer = window.setInterval(
      () => setProgress((p) => Math.min(p + 1, PROGRESS.length - 1)),
      2600,
    );
    return () => window.clearInterval(timer);
  }, [state.phase]);

  const userKey = state.userKey;

  const headers = useCallback(
    (base: Record<string, string> = {}) =>
      userKey ? { ...base, "x-user-api-key": userKey } : base,
    [userKey],
  );

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const entries: UploadedFile[] = incoming.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        kind: isPdf(file.type) ? "pdf" : "image",
        previewUrl: isPdf(file.type) ? undefined : URL.createObjectURL(file),
        status: "reading",
      }));
      dispatch({ type: "add-files", files: entries });

      // Photos are metered separately — reading handwriting is the expensive step.
      const hasPhoto = incoming.some((f) => !isPdf(f.type));
      if (hasPhoto && !userKey) {
        const decision = checkQuota("photo");
        if (!decision.allowed) {
          for (const entry of entries) {
            dispatch({
              type: "file-status",
              id: entry.id,
              patch: { status: "error", error: decision.message },
            });
          }
          dispatch({ type: "error", error: { code: "quota_exceeded", message: decision.message ?? "" } });
          return;
        }
      }

      const form = new FormData();
      for (const file of incoming) {
        form.append("files", isPdf(file.type) ? file : await downscale(file));
      }

      try {
        const response = await fetch("/api/extract", {
          method: "POST",
          body: form,
          headers: headers(),
        });
        const payload = await response.json();

        if (!response.ok) {
          const message = payload?.error?.message ?? "Couldn't read those files.";
          for (const entry of entries) {
            dispatch({ type: "file-status", id: entry.id, patch: { status: "error", error: message } });
          }
          dispatch({ type: "error", error: { code: payload?.error?.code ?? "unknown", message } });
          return;
        }

        if (hasPhoto && !userKey) recordRun("photo");

        payload.sources.forEach((source: { text: string; error?: string }, i: number) => {
          const entry = entries[i];
          if (!entry) return;
          dispatch({
            type: "file-status",
            id: entry.id,
            patch: source.error
              ? { status: "error", error: source.error }
              : { status: "done", text: source.text },
          });
        });
      } catch {
        for (const entry of entries) {
          dispatch({
            type: "file-status",
            id: entry.id,
            patch: { status: "error", error: "Network error while uploading." },
          });
        }
      }
    },
    [headers, userKey],
  );

  const generate = useCallback(async () => {
    if (!hasSource(state)) return;

    if (!userKey) {
      const decision = checkQuota("text");
      if (!decision.allowed) {
        dispatch({ type: "error", error: { code: "quota_exceeded", message: decision.message ?? "" } });
        return;
      }
    }

    setProgress(0);
    dispatch({ type: "phase", phase: "generating" });
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: headers({ "content-type": "application/json" }),
        body: JSON.stringify({ source: sourceText(state), ...state.options }),
      });
      const payload = await response.json();

      if (!response.ok) {
        dispatch({
          type: "error",
          error: {
            code: payload?.error?.code ?? "unknown",
            message: payload?.error?.message ?? "Generation failed.",
          },
        });
        return;
      }

      if (!userKey) {
        recordRun("text");
        dispatch({ type: "remaining", count: remaining("text") });
      }
      dispatch({ type: "generated", cards: payload.cards, warnings: payload.warnings });
      window.setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        60,
      );
    } catch {
      dispatch({
        type: "error",
        error: { code: "unknown", message: "Network error. Check your connection and try again." },
      });
    }
  }, [headers, state, userKey]);

  const regenerateOne = useCallback(
    async (card: Card) => {
      dispatch({ type: "busy-card", id: card.id });
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: headers({ "content-type": "application/json" }),
          body: JSON.stringify({
            source: sourceText(state),
            ...state.options,
            regenerate: {
              front: card.front,
              back: card.back,
              avoid: state.cards.filter((c) => c.id !== card.id).map((c) => c.front),
            },
          }),
        });
        const payload = await response.json();
        if (response.ok && payload.cards?.[0]) {
          dispatch({ type: "replace-card", id: card.id, card: { ...payload.cards[0], id: card.id } });
          toast.show("Card regenerated");
        } else {
          toast.show(payload?.error?.message ?? "Couldn't regenerate that card.");
        }
      } catch {
        toast.show("Network error while regenerating.");
      } finally {
        dispatch({ type: "busy-card", id: null });
      }
    },
    [headers, state, toast],
  );

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: headers({ "content-type": "application/json" }),
        body: JSON.stringify({ source: sourceText(state), cards: state.cards }),
      });
      const payload = await response.json();
      if (response.ok) {
        dispatch({ type: "checked", issues: payload.issues, summary: payload.summary });
      } else {
        toast.show(payload?.error?.message ?? "Couldn't check the cards.");
      }
    } catch {
      toast.show("Network error while checking.");
    } finally {
      setChecking(false);
    }
  }, [headers, state, toast]);

  const deleteCard = useCallback(
    (card: Card) => {
      const index = state.cards.findIndex((c) => c.id === card.id);
      dispatch({ type: "delete-card", id: card.id });
      toast.show("Card deleted", {
        label: "Undo",
        run: () => dispatch({ type: "restore-card", card, index }),
      });
    },
    [state.cards, toast],
  );

  const visibleIssues = useMemo(
    () => state.issues.filter((i) => !state.dismissed.includes(issueKey(i))),
    [state.issues, state.dismissed],
  );

  const issuesByCard = useMemo(() => {
    const map = new Map<string, typeof visibleIssues>();
    for (const issue of visibleIssues) {
      map.set(issue.cardId, [...(map.get(issue.cardId) ?? []), issue]);
    }
    return map;
  }, [visibleIssues]);

  const busy = state.phase === "generating" || state.phase === "extracting";
  const reading = state.files.some((f) => f.status === "reading");
  const ready = hasSource(state) && !busy && !reading;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24">
      <Step number={1} title="Add Notes">
        <Dropzone
          files={state.files}
          onAdd={addFiles}
          onRemove={(id) => dispatch({ type: "remove-file", id })}
          disabled={busy}
        />

        <div className="mt-5">
          <label htmlFor="paste" className="text-sm font-medium text-ink-2">
            Or paste your notes
          </label>
          <textarea
            id="paste"
            ref={textRef}
            value={state.pastedText}
            onChange={(e) => dispatch({ type: "set-text", text: e.target.value })}
            placeholder="Paste a study guide, lecture notes, or a textbook passage…"
            rows={6}
            className="mt-2 w-full resize-y rounded-2xl border border-line bg-surface p-4 leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-line-strong"
          />
        </div>
      </Step>

      <Step number={2} title="Generate">
        <div className="grid gap-5 sm:grid-cols-3">
          <OptionGroup
            name="count"
            label="Number of cards"
            options={COUNTS}
            value={state.options.count}
            onChange={(count) => dispatch({ type: "set-options", patch: { count } })}
          />
          <OptionGroup
            name="style"
            label="Card type"
            orientation="stack"
            options={STYLES}
            value={state.options.style}
            onChange={(style) => dispatch({ type: "set-options", patch: { style } })}
          />
          <OptionGroup
            name="difficulty"
            label="Difficulty"
            options={DIFFICULTIES}
            value={state.options.difficulty}
            onChange={(difficulty) => dispatch({ type: "set-options", patch: { difficulty } })}
          />
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={!ready}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-medium text-accent-ink shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-3 sm:w-auto"
        >
          {busy ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {PROGRESS[progress]}
            </>
          ) : (
            <>
              <Sparkles aria-hidden className="size-4" />
              Generate Flashcards
            </>
          )}
        </button>

        {!hasSource(state) && !reading ? (
          <p className="mt-3 text-sm text-ink-3">
            Add a photo, a PDF, or some text above to get started.
          </p>
        ) : null}

        {!userKey && state.remainingText !== null ? (
          <p className="mt-3 text-sm text-ink-3">
            {state.remainingText} free generation{state.remainingText === 1 ? "" : "s"} left today.
          </p>
        ) : null}

        {state.error ? <ErrorBanner error={state.error} /> : null}
      </Step>

      <div ref={resultsRef}>
        {busy ? <Skeleton /> : null}

        {state.phase === "ready" && state.cards.length > 0 ? (
          <Step number={3} title="Review & Export">
            {state.warnings.length > 0 ? (
              <div className="mb-5 rounded-2xl border border-warn/30 bg-warn-soft p-4">
                <p className="flex items-center gap-2 font-medium text-warn">
                  <TriangleAlert aria-hidden className="size-4" />
                  Some of your notes couldn&apos;t be read
                </p>
                <ul className="mt-2 space-y-1 text-sm text-warn">
                  {state.warnings.map((warning) => (
                    <li key={warning}>· {warning}</li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-warn">
                  Nothing was invented to fill the gaps — check those parts yourself.
                </p>
              </div>
            ) : null}

            <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={runCheck}
                    disabled={checking}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong disabled:text-ink-3"
                  >
                    {checking ? (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <Wand2 aria-hidden className="size-4" />
                    )}
                    Check Cards
                  </button>
                  <button
                    type="button"
                    onClick={generate}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong"
                  >
                    <RefreshCw aria-hidden className="size-4" />
                    Regenerate all
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "add-card" })}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong"
                  >
                    <Plus aria-hidden className="size-4" />
                    Add card
                  </button>
                  <span className="ml-auto text-sm text-ink-3">
                    {state.cards.length} card{state.cards.length === 1 ? "" : "s"}
                  </span>
                </div>

                {state.checkSummary ? (
                  <CheckBanner
                    summary={state.checkSummary}
                    count={visibleIssues.length}
                    onDismissAll={() => {
                      for (const issue of visibleIssues) {
                        dispatch({ type: "dismiss-issue", key: issueKey(issue) });
                      }
                    }}
                  />
                ) : null}

                <ul className="space-y-3">
                  {state.cards.map((card, index) => (
                    <CardEditor
                      key={card.id}
                      card={card}
                      index={index}
                      issues={issuesByCard.get(card.id) ?? []}
                      busy={state.busyCardId === card.id}
                      onEdit={(patch) => dispatch({ type: "edit-card", id: card.id, patch })}
                      onDelete={() => deleteCard(card)}
                      onDuplicate={() => dispatch({ type: "duplicate-card", id: card.id })}
                      onRegenerate={() => regenerateOne(card)}
                    />
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => {
                    clearDraft();
                    dispatch({ type: "reset" });
                  }}
                  className="mt-6 text-sm text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  Start a new set
                </button>
              </div>

              <div className="lg:sticky lg:top-6 lg:self-start">
                <ExportPanel cards={state.cards} />
              </div>
            </div>
          </Step>
        ) : null}

        {state.phase === "ready" && state.cards.length === 0 ? (
          <Step number={3} title="Review & Export">
            <div className="rounded-2xl border border-line bg-surface-2 p-10 text-center">
              <p className="font-medium text-ink">No cards yet</p>
              <p className="mt-1 text-sm text-ink-2">
                The material didn&apos;t contain anything worth turning into a card. Try adding
                more notes.
              </p>
            </div>
          </Step>
        ) : null}
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-10 first:border-t-0 sm:py-12">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {number}
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function CheckBanner({
  summary,
  count,
  onDismissAll,
}: {
  summary: string;
  count: number;
  onDismissAll: () => void;
}) {
  const clean = count === 0;
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4",
        clean ? "border-ok/30 bg-ok-soft" : "border-warn/30 bg-warn-soft",
      )}
    >
      {clean ? <Check aria-hidden className="size-4 shrink-0 text-ok" /> : null}
      <p className={cn("font-medium", clean ? "text-ok" : "text-warn")}>
        {clean ? "No problems found — these cards look good." : `⚠️ ${summary}`}
      </p>
      {!clean ? (
        <button
          type="button"
          onClick={onDismissAll}
          className="ml-auto text-sm font-medium text-warn underline-offset-4 hover:underline"
        >
          Dismiss all
        </button>
      ) : null}
    </div>
  );
}

function ErrorBanner({ error }: { error: { code: string; message: string } }) {
  const setup = error.code === "not_configured";
  return (
    <div className="mt-4 rounded-2xl border border-danger/30 bg-danger-soft p-4">
      <p className="flex items-center gap-2 font-medium text-danger">
        <AlertCircle aria-hidden className="size-4" />
        {setup ? "Note2Card isn't configured yet" : "That didn't work"}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-danger">{error.message}</p>
      {setup ? (
        <p className="mt-2 text-sm text-danger">
          Copy <code className="rounded bg-surface px-1 py-0.5 text-xs">.env.example</code> to{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-xs">.env.local</code>, add your key,
          and restart the dev server.
        </p>
      ) : null}
      {error.code === "quota_exceeded" || error.code === "budget_exhausted" ? (
        <Link
          href="/create#premium"
          className="mt-3 inline-flex h-9 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          Go Premium
        </Link>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <section className="border-t border-line py-10 sm:py-12">
      <ul className="space-y-3" aria-label="Generating cards">
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className="n2c-skeleton rounded-2xl border border-line bg-surface p-5"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="h-3 w-16 rounded bg-surface-2" />
            <div className="mt-3 h-4 w-2/3 rounded bg-surface-2" />
            <div className="mt-4 h-3 w-12 rounded bg-surface-2" />
            <div className="mt-3 h-4 w-full rounded bg-surface-2" />
          </li>
        ))}
      </ul>
    </section>
  );
}
