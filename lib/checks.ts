import type { Card, CardIssue } from "./ai/schemas";

/**
 * Deterministic quality checks.
 *
 * These run instantly and for free, and they catch the majority of what's wrong
 * with a generated set: duplicates, over-long answers, fronts that can't be
 * answered, OCR debris. The model pass in /api/check only has to find what
 * regexes cannot — unsupported claims and missing qualifiers.
 */

/** A back longer than this is a paragraph, not a flashcard answer. */
const MAX_BACK_CHARS = 200;

/** Below this Jaccard distance two fronts are asking the same question. */
const NEAR_DUPLICATE_THRESHOLD = 0.8;

export function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalise(value).split(" ").filter(Boolean));
}

/** Jaccard similarity — 1.0 means identical token sets. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/** Question openers that say nothing without a named subject. */
const SUBJECTLESS = /^(what|which|who|why|how|when|where)\s+(is|are|was|were|does|do|did)\s+(it|this|that|they|these|those)\b/i;

/**
 * Characters that essentially never appear mid-word in real text but are common
 * OCR debris — a digit inside a word, a pipe standing in for l/I, stray brackets.
 */
const OCR_ARTIFACT = /\b[a-z]+[0-9]+[a-z]+\b|\b[a-z]*\|[a-z]*\b|\bl{2,}[aeiou]/i;

export function runChecks(cards: Card[]): CardIssue[] {
  const issues: CardIssue[] = [];

  for (const card of cards) {
    const front = card.front.trim();
    const back = card.back.trim();

    if (!front || !back) {
      issues.push({
        cardId: card.id,
        kind: "incomplete",
        message: !front ? "This card has no front." : "This card has no back.",
        suggestion: null,
      });
      continue;
    }

    if (back.length > MAX_BACK_CHARS) {
      issues.push({
        cardId: card.id,
        kind: "too-long",
        message: `The answer is ${back.length} characters. Aim for under ${MAX_BACK_CHARS} — long answers are hard to recall.`,
        suggestion: null,
      });
    }

    const frontWords = normalise(front).split(" ").filter(Boolean);
    if (frontWords.length < 2) {
      issues.push({
        cardId: card.id,
        kind: "vague",
        message: "The front is a single word, which may be too broad to test anything specific.",
        suggestion: null,
      });
    } else if (SUBJECTLESS.test(front)) {
      issues.push({
        cardId: card.id,
        kind: "vague",
        message: "The front refers to “it” or “this” without naming the subject, so it can't be answered on its own.",
        suggestion: null,
      });
    }

    if (normalise(front) === normalise(back)) {
      issues.push({
        cardId: card.id,
        kind: "incomplete",
        message: "The answer just restates the question.",
        suggestion: null,
      });
    }

    if (OCR_ARTIFACT.test(front) || OCR_ARTIFACT.test(back)) {
      issues.push({
        cardId: card.id,
        kind: "ocr",
        message: "This card contains characters that look like a scanning error. Check the spelling against your notes.",
        suggestion: null,
      });
    }

    if (card.confidence === "low") {
      issues.push({
        cardId: card.id,
        kind: "incomplete",
        message: "The source for this card was hard to read, so it's worth checking against your notes.",
        suggestion: null,
      });
    }
  }

  // Duplicates are reported against the later card so the first stays untouched.
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i];
      const b = cards[j];
      if (!a || !b) continue;
      if (similarity(a.front, b.front) >= NEAR_DUPLICATE_THRESHOLD) {
        issues.push({
          cardId: b.id,
          kind: "duplicate",
          message: `This asks the same thing as “${a.front.slice(0, 60)}”.`,
          suggestion: null,
        });
      }
    }
  }

  return issues;
}

/** One line for the results banner. */
export function summarise(issues: CardIssue[]): string {
  const affected = new Set(issues.map((i) => i.cardId)).size;
  if (affected === 0) return "No problems found — these cards look good.";
  return `${affected} card${affected === 1 ? "" : "s"} could be improved`;
}
