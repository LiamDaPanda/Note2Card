import {
  ZERO_USAGE,
  type AIProvider,
  type GenerateInput,
  type GenerateResult,
  type ImageInput,
  type RegenerateInput,
  type ReviewInput,
  type ReviewOutcome,
  type TranscribeResult,
} from "./provider";
import type { GeneratedCard } from "./schemas";

/**
 * An offline provider that needs no credentials.
 *
 * It derives cards from the actual input text rather than returning canned
 * strings, so the editor, exports, and quality checks all get realistic data to
 * work on. This is what `npm test` and the Playwright pass run against.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";

  async transcribe(images: ImageInput[]): Promise<TranscribeResult> {
    const pages = images
      .map(
        (img, i) =>
          `# Page ${i + 1} — ${img.name}\n\nPhotosynthesis is the process by which plants convert light energy into chemical energy.\nChlorophyll is the pigment that absorbs light, primarily in the blue and red wavelengths.\nThe light-dependent reactions occur in the thylakoid membrane and produce ATP and NADPH.\nThe Calvin cycle occurs in the stroma and fixes carbon dioxide into glucose.`,
      )
      .join("\n\n---\n\n");

    return {
      text: pages,
      unclear: images.length > 2 ? ["one word in the final bullet of page 3"] : [],
      usage: { ...ZERO_USAGE, model: "mock" },
    };
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const target = input.count === "auto" ? 8 : input.count;
    const avoid = new Set((input.avoid ?? []).map(normalise));

    const cards: GeneratedCard[] = [];
    for (const sentence of sentences(input.source)) {
      if (cards.length >= target) break;
      const card = cardFrom(sentence, input.style === "term-definition" ? "term" : "question");
      if (!card || avoid.has(normalise(card.front))) continue;
      if (cards.some((c) => normalise(c.front) === normalise(card.front))) continue;
      cards.push(card);
    }

    return {
      cards,
      warnings: input.source.includes("[unclear]")
        ? ["Part of the source could not be read and was left out of the cards."]
        : [],
      usage: { ...ZERO_USAGE, model: "mock" },
    };
  }

  async regenerate(input: RegenerateInput) {
    return {
      card: {
        front: `${input.front.replace(/\?$/, "")} (revised)?`,
        back: input.back,
        confidence: "high" as const,
        evidence: input.back.slice(0, 60),
      },
      usage: { ...ZERO_USAGE, model: "mock" },
    };
  }

  async review(_input: ReviewInput): Promise<ReviewOutcome> {
    // The deterministic pass finds the real problems; the mock adds nothing.
    return { issues: [], usage: { ...ZERO_USAGE, model: "mock" } };
  }
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function sentences(source: string): string[] {
  return source
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[#>\-*\d.\s]+/, "").trim())
    .filter((s) => s.length > 25 && s.length < 400);
}

/**
 * Turn "X is the process by which Y" into a front/back pair. Crude on purpose —
 * it just needs to produce something shaped like a real card.
 */
function cardFrom(sentence: string, shape: "term" | "question"): GeneratedCard | null {
  const match = sentence.match(
    /^(.{2,60}?)\s+(?:is|are|was|were|refers to|means)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i,
  );
  if (!match) return null;

  const [, subject, rest] = match;
  if (!subject || !rest) return null;

  const back = rest.replace(/\.$/, "").trim();
  const term = subject.trim();

  return {
    front: shape === "term" ? term : `What is ${term.replace(/^The\s+/i, "")}?`,
    back: back.charAt(0).toUpperCase() + back.slice(1) + ".",
    confidence: "high",
    evidence: sentence.slice(0, 80),
  };
}
