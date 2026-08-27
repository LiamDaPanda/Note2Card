import { z } from "zod";

/** How a card's two sides should be phrased. */
export const CardStyle = z.enum(["term-definition", "question-answer", "mixed"]);
export type CardStyle = z.infer<typeof CardStyle>;

export const Difficulty = z.enum(["basic", "standard", "hard"]);
export type Difficulty = z.infer<typeof Difficulty>;

/** "auto" lets the model choose a count that fits the material. */
export const CardCount = z.union([z.literal("auto"), z.literal(10), z.literal(20), z.literal(30), z.literal(50)]);
export type CardCount = z.infer<typeof CardCount>;

/**
 * The model's view of a card. `evidence` is a short quote from the source that
 * supports the answer — it is how the quality checker tells a grounded card from
 * an invented one, and it is never exported.
 */
export const GeneratedCard = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  confidence: z.enum(["high", "low"]),
  evidence: z.string(),
});
export type GeneratedCard = z.infer<typeof GeneratedCard>;

export const GenerationResult = z.object({
  cards: z.array(GeneratedCard),
  /** Material that could not be read. Flagged, never guessed at. */
  warnings: z.array(z.string()),
});
export type GenerationResult = z.infer<typeof GenerationResult>;

/** A single replacement card — the shape the regenerate call returns. */
export const RegeneratedCard = z.object({ card: GeneratedCard });

export const TranscriptionResult = z.object({
  /** The notes, transcribed as plain markdown-ish text. */
  text: z.string(),
  /** Passages that were unreadable or ambiguous. */
  unclear: z.array(z.string()),
});
export type TranscriptionResult = z.infer<typeof TranscriptionResult>;

export const IssueKind = z.enum([
  "duplicate",
  "vague",
  "too-long",
  "incomplete",
  "ocr",
  "unsupported",
]);
export type IssueKind = z.infer<typeof IssueKind>;

export const CardIssue = z.object({
  cardId: z.string(),
  kind: IssueKind,
  message: z.string(),
  /** A concrete rewrite the user can accept with one click, when one exists. */
  suggestion: z.object({ front: z.string(), back: z.string() }).nullable(),
});
export type CardIssue = z.infer<typeof CardIssue>;

/** Model-facing review shape — ids are remapped to real card ids by the caller. */
export const ReviewResult = z.object({
  issues: z.array(CardIssue),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

/** A card as it lives in the editor. */
export const Card = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  confidence: z.enum(["high", "low"]),
  evidence: z.string(),
});
export type Card = z.infer<typeof Card>;

export const GenerateOptions = z.object({
  count: CardCount,
  style: CardStyle,
  difficulty: Difficulty,
});
export type GenerateOptions = z.infer<typeof GenerateOptions>;
