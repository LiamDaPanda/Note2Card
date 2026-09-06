"use client";

import type { State } from "./state";

const KEY = "note2card:draft:v1";

/**
 * Mirror the working draft into localStorage so a refresh doesn't destroy an
 * afternoon of editing. Files themselves are never stored — only the text pulled
 * out of them — so this stays small and holds nothing binary.
 *
 * Every access is wrapped: private windows and blocked site data throw on
 * localStorage, and that must never break the app.
 */
export interface Draft {
  pastedText: State["pastedText"];
  options: State["options"];
  cards: State["cards"];
  warnings: State["warnings"];
  files: { id: string; name: string; size: number; kind: "image" | "pdf"; text?: string }[];
}

export function saveDraft(state: State): void {
  try {
    const draft: Draft = {
      pastedText: state.pastedText,
      options: state.options,
      cards: state.cards,
      warnings: state.warnings,
      files: state.files
        .filter((f) => f.status === "done")
        .map((f) => ({ id: f.id, name: f.name, size: f.size, kind: f.kind, text: f.text })),
    };
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable — the app works fine without persistence.
  }
}

export function loadDraft(): Partial<State> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!Array.isArray(draft.cards)) return null;

    return {
      pastedText: draft.pastedText ?? "",
      options: draft.options,
      cards: draft.cards,
      warnings: draft.warnings ?? [],
      files: (draft.files ?? []).map((f) => ({ ...f, status: "done" as const })),
      phase: draft.cards.length > 0 ? ("ready" as const) : ("input" as const),
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

const KEY_API = "note2card:userkey:v1";

/** A bring-your-own key lives only in this browser and is sent per request. */
export function saveUserKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_API, key);
    else localStorage.removeItem(KEY_API);
  } catch {
    // Ignore.
  }
}

export function loadUserKey(): string {
  try {
    return localStorage.getItem(KEY_API) ?? "";
  } catch {
    return "";
  }
}
