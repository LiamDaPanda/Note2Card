"use client";

import type { Card, CardCount, CardIssue, CardStyle, Difficulty } from "@/lib/ai/schemas";

export type Phase = "input" | "extracting" | "generating" | "ready";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  kind: "image" | "pdf";
  /** Object URL for the thumbnail; revoked on removal. */
  previewUrl?: string;
  status: "pending" | "reading" | "done" | "error";
  /** Text pulled out of this file, once extracted. */
  text?: string;
  error?: string;
}

export interface State {
  phase: Phase;
  files: UploadedFile[];
  pastedText: string;
  options: { count: CardCount; style: CardStyle; difficulty: Difficulty };
  cards: Card[];
  warnings: string[];
  issues: CardIssue[];
  /** Issues the user has explicitly waved away. */
  dismissed: string[];
  checkSummary: string | null;
  error: { code: string; message: string } | null;
  busyCardId: string | null;
  /**
   * Browser-only values, filled in after mount.
   *
   * These come from localStorage, which does not exist during server rendering.
   * Reading them while rendering would make the server and client markup differ
   * and trigger a hydration mismatch, so they start null/empty and the UI that
   * depends on them renders nothing until hydration has happened.
   */
  userKey: string;
  remainingText: number | null;
}

export const initialState: State = {
  phase: "input",
  files: [],
  pastedText: "",
  options: { count: "auto", style: "mixed", difficulty: "standard" },
  cards: [],
  warnings: [],
  issues: [],
  dismissed: [],
  checkSummary: null,
  error: null,
  busyCardId: null,
  userKey: "",
  remainingText: null,
};

export type Action =
  | { type: "add-files"; files: UploadedFile[] }
  | { type: "remove-file"; id: string }
  | { type: "file-status"; id: string; patch: Partial<UploadedFile> }
  | { type: "set-text"; text: string }
  | { type: "set-options"; patch: Partial<State["options"]> }
  | { type: "phase"; phase: Phase }
  | { type: "error"; error: State["error"] }
  | { type: "generated"; cards: Card[]; warnings: string[] }
  | { type: "edit-card"; id: string; patch: Partial<Card> }
  | { type: "delete-card"; id: string }
  | { type: "restore-card"; card: Card; index: number }
  | { type: "duplicate-card"; id: string }
  | { type: "add-card" }
  | { type: "replace-card"; id: string; card: Card }
  | { type: "busy-card"; id: string | null }
  | { type: "remaining"; count: number }
  | { type: "checked"; issues: CardIssue[]; summary: string }
  | { type: "dismiss-issue"; key: string }
  | { type: "reset" }
  | { type: "hydrate"; state: Partial<State> };

export function issueKey(issue: CardIssue): string {
  return `${issue.cardId}:${issue.kind}`;
}

function newCard(): Card {
  return { id: crypto.randomUUID(), front: "", back: "", confidence: "high", evidence: "" };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add-files":
      return { ...state, files: [...state.files, ...action.files], error: null };

    case "remove-file": {
      const file = state.files.find((f) => f.id === action.id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return { ...state, files: state.files.filter((f) => f.id !== action.id) };
    }

    case "file-status":
      return {
        ...state,
        files: state.files.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      };

    case "set-text":
      return { ...state, pastedText: action.text };

    case "set-options":
      return { ...state, options: { ...state.options, ...action.patch } };

    case "phase":
      return { ...state, phase: action.phase };

    case "error":
      return { ...state, error: action.error, phase: state.cards.length ? "ready" : "input" };

    case "generated":
      return {
        ...state,
        cards: action.cards,
        warnings: action.warnings,
        issues: [],
        dismissed: [],
        checkSummary: null,
        phase: "ready",
        error: null,
      };

    case "edit-card":
      return {
        ...state,
        cards: state.cards.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
        // Editing a card invalidates any finding about it.
        issues: state.issues.filter((i) => i.cardId !== action.id),
      };

    case "delete-card":
      return {
        ...state,
        cards: state.cards.filter((c) => c.id !== action.id),
        issues: state.issues.filter((i) => i.cardId !== action.id),
      };

    case "restore-card": {
      const cards = [...state.cards];
      cards.splice(action.index, 0, action.card);
      return { ...state, cards };
    }

    case "duplicate-card": {
      const index = state.cards.findIndex((c) => c.id === action.id);
      const original = state.cards[index];
      if (!original) return state;
      const copy: Card = { ...original, id: crypto.randomUUID() };
      const cards = [...state.cards];
      cards.splice(index + 1, 0, copy);
      return { ...state, cards };
    }

    case "add-card":
      return { ...state, cards: [...state.cards, newCard()] };

    case "replace-card":
      return {
        ...state,
        cards: state.cards.map((c) => (c.id === action.id ? action.card : c)),
        issues: state.issues.filter((i) => i.cardId !== action.id),
      };

    case "busy-card":
      return { ...state, busyCardId: action.id };

    case "remaining":
      return { ...state, remainingText: action.count };

    case "checked":
      return { ...state, issues: action.issues, checkSummary: action.summary };

    case "dismiss-issue":
      return { ...state, dismissed: [...state.dismissed, action.key] };

    case "reset":
      for (const file of state.files) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      }
      return { ...initialState };

    case "hydrate":
      return { ...state, ...action.state };
  }
}

/** Everything the model needs, assembled from files plus whatever was typed. */
export function sourceText(state: State): string {
  const parts = state.files
    .filter((f) => f.status === "done" && f.text)
    .map((f) => `## ${f.name}\n\n${f.text}`);
  if (state.pastedText.trim()) parts.push(state.pastedText.trim());
  return parts.join("\n\n---\n\n");
}

export function hasSource(state: State): boolean {
  return sourceText(state).trim().length > 0;
}

/** True when this run needs the vision model — the metered path. */
export function needsVision(state: State): boolean {
  return state.files.some((f) => f.kind === "image" || f.status === "pending");
}
