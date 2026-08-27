import type { Card } from "./ai/schemas";

/**
 * Export formatters.
 *
 * Each target has its own escaping rules and getting them wrong silently corrupts
 * a student's deck on import, so these are covered by unit tests.
 */

/** Collapse anything that would break a one-line-per-card format. */
function flatten(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\t/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Quizlet: one card per line, front and back separated by a tab.
 * Tabs and newlines inside a field would break the row, so they are flattened.
 */
export function toQuizlet(cards: Card[]): string {
  return cards.map((c) => `${flatten(c.front)}\t${flatten(c.back)}`).join("\n");
}

/**
 * Brainscape's importer takes two comma-separated columns, question first.
 * Unlike the Quizlet path this keeps RFC-4180 quoting, so commas survive.
 */
export function toBrainscape(cards: Card[]): string {
  return cards.map((c) => `${csvField(flatten(c.front))},${csvField(flatten(c.back))}`).join("\n");
}

/** RFC 4180: wrap in quotes when the value contains a comma, quote, or newline. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Anki / generic CSV. Includes a `Front,Back` header and CRLF line endings,
 * which is what spreadsheet tools and Anki's importer expect.
 */
export function toCsv(cards: Card[], options?: { header?: boolean }): string {
  const rows = cards.map((c) => `${csvField(c.front.trim())},${csvField(c.back.trim())}`);
  const header = options?.header === false ? [] : ["Front,Back"];
  return [...header, ...rows].join("\r\n");
}

/** Human-readable plain text, for pasting into a document or a message. */
export function toPlainText(cards: Card[]): string {
  return cards.map((c) => `${c.front.trim()}\n${c.back.trim()}`).join("\n\n");
}

export type ExportFormat = "quizlet" | "brainscape" | "csv" | "plain";

export function formatCards(cards: Card[], format: ExportFormat): string {
  switch (format) {
    case "quizlet":
      return toQuizlet(cards);
    case "brainscape":
      return toBrainscape(cards);
    case "csv":
      return toCsv(cards);
    case "plain":
      return toPlainText(cards);
  }
}

/** A filesystem-safe filename for the CSV download. */
export function csvFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `note2card-${stamp}.csv`;
}
