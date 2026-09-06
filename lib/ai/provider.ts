import type {
  CardCount,
  CardIssue,
  CardStyle,
  Difficulty,
  GeneratedCard,
  TranscriptionResult,
} from "./schemas";

/** An image ready to hand to a vision model. */
export interface ImageInput {
  /** base64, no data: prefix, no newlines. */
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** Original filename, used only for error messages. */
  name: string;
}

export interface TranscribeResult extends TranscriptionResult {
  usage: Usage;
}

export interface GenerateInput {
  source: string;
  count: CardCount;
  style: CardStyle;
  difficulty: Difficulty;
  /** Fronts that already exist, so the model doesn't repeat them. */
  avoid?: string[];
}

export interface GenerateResult {
  cards: GeneratedCard[];
  warnings: string[];
  usage: Usage;
}

export interface RegenerateInput {
  source: string;
  front: string;
  back: string;
  style: CardStyle;
  difficulty: Difficulty;
  avoid: string[];
}

export interface ReviewInput {
  source: string;
  cards: { id: string; front: string; back: string; evidence: string }[];
}

export interface ReviewOutcome {
  issues: CardIssue[];
  usage: Usage;
}

/** Token counts plus the dollar cost we actually incurred, for the spend ledger. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  model: string;
}

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0,
  model: "none",
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    costUsd: a.costUsd + b.costUsd,
    model: a.model === "none" ? b.model : `${a.model}+${b.model}`,
  };
}

/**
 * The seam that keeps the app model-agnostic.
 *
 * Each pipeline stage resolves its own provider, so extraction can stay on a
 * frontier vision model while generation moves to something cheap — see
 * getProvider() in ./index.
 */
export interface AIProvider {
  readonly name: string;
  /** Photos and scanned pages -> plain text. */
  transcribe(images: ImageInput[]): Promise<TranscribeResult>;
  /** Clean text -> flashcards. */
  generate(input: GenerateInput): Promise<GenerateResult>;
  /** One card -> a better version of that card. */
  regenerate(input: RegenerateInput): Promise<{ card: GeneratedCard; usage: Usage }>;
  /** Cards + source -> the problems a regex can't see. */
  review(input: ReviewInput): Promise<ReviewOutcome>;
}

/** Raised when a provider is asked to work without credentials. */
export class MissingCredentialsError extends Error {
  constructor(public readonly provider: string) {
    super(`${provider} is not configured`);
    this.name = "MissingCredentialsError";
  }
}

/** Raised when the model returns something that isn't usable. */
export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}
