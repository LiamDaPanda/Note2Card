import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { costUsd } from "./pricing";
import {
  buildGenerationPrompt,
  buildRegeneratePrompt,
  GENERATION_RULES,
  REVIEW_SYSTEM,
  TRANSCRIPTION_SYSTEM,
} from "./prompts";
import {
  GenerationResult,
  RegeneratedCard,
  ReviewResult,
  TranscriptionResult,
} from "./schemas";
import {
  MissingCredentialsError,
  ProviderResponseError,
  type AIProvider,
  type GenerateInput,
  type GenerateResult,
  type ImageInput,
  type RegenerateInput,
  type ReviewInput,
  type ReviewOutcome,
  type TranscribeResult,
  type Usage,
} from "./provider";

type Effort = "low" | "medium" | "high";

/**
 * Adaptive thinking and `output_config.effort` are 4.6+/5-family features.
 * Haiku 4.5 rejects both, so it gets a plain request.
 */
function supportsAdaptiveThinking(model: string): boolean {
  return !model.startsWith("claude-haiku-4-5");
}

function usageFrom(model: string, u: Anthropic.Usage): Usage {
  const inputTokens = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    costUsd: costUsd({ model, inputTokens, outputTokens, cacheReadTokens }),
    model,
  };
}

export interface AnthropicProviderOptions {
  apiKey?: string;
  model: string;
  effort?: Effort;
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: Effort;

  constructor(opts: AnthropicProviderOptions) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new MissingCredentialsError("anthropic");
    this.client = new Anthropic({ apiKey });
    this.model = opts.model;
    this.effort = opts.effort ?? "medium";
  }

  /**
   * Shared request shape. The system prompt is passed as a cacheable block so the
   * rules — byte-identical on every call — bill at the cached rate after the first.
   */
  private common(system: string) {
    const base = {
      model: this.model,
      system: [
        {
          type: "text" as const,
          text: system,
          cache_control: { type: "ephemeral" as const },
        },
      ],
    };
    if (!supportsAdaptiveThinking(this.model)) return base;
    return { ...base, thinking: { type: "adaptive" as const } };
  }

  private outputConfig<T extends z.ZodType>(schema: T) {
    const format = zodOutputFormat(schema);
    return supportsAdaptiveThinking(this.model)
      ? { effort: this.effort, format }
      : { format };
  }

  async transcribe(images: ImageInput[]): Promise<TranscribeResult> {
    if (images.length === 0) {
      return { text: "", unclear: [], usage: usageFrom(this.model, {} as Anthropic.Usage) };
    }

    const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
    }));
    content.push({
      type: "text",
      text:
        images.length === 1
          ? "Transcribe this page of notes."
          : `Transcribe these ${images.length} pages of notes, in order. Separate each page with a line containing only ---.`,
    });

    const response = await this.client.messages.parse({
      ...this.common(TRANSCRIPTION_SYSTEM),
      max_tokens: 16000,
      // Reading handwriting is the step where accuracy actually matters.
      output_config: this.outputConfig(TranscriptionResult),
      messages: [{ role: "user", content }],
    });

    const parsed = response.parsed_output;
    if (!parsed) throw new ProviderResponseError("Transcription returned no parseable output");

    return { ...parsed, usage: usageFrom(this.model, response.usage) };
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    // Streaming keeps a 50-card response from tripping the HTTP timeout.
    const stream = this.client.messages.stream({
      ...this.common(GENERATION_RULES),
      max_tokens: 32000,
      output_config: this.outputConfig(GenerationResult),
      messages: [
        {
          role: "user",
          content: buildGenerationPrompt({
            source: input.source,
            count: input.count,
            style: input.style,
            difficulty: input.difficulty,
            avoid: input.avoid,
          }),
        },
      ],
    });

    const message = await stream.finalMessage();
    const parsed = message.parsed_output;
    if (!parsed) throw new ProviderResponseError("Generation returned no parseable output");

    return {
      cards: parsed.cards,
      warnings: parsed.warnings,
      usage: usageFrom(this.model, message.usage),
    };
  }

  async regenerate(input: RegenerateInput) {
    const response = await this.client.messages.parse({
      ...this.common(GENERATION_RULES),
      max_tokens: 4000,
      output_config: this.outputConfig(RegeneratedCard),
      messages: [{ role: "user", content: buildRegeneratePrompt(input) }],
    });

    const parsed = response.parsed_output;
    if (!parsed) throw new ProviderResponseError("Regeneration returned no parseable output");

    return { card: parsed.card, usage: usageFrom(this.model, response.usage) };
  }

  async review(input: ReviewInput): Promise<ReviewOutcome> {
    const cardList = input.cards
      .map((c) => `[${c.id}]\nFRONT: ${c.front}\nBACK: ${c.back}`)
      .join("\n\n");

    const response = await this.client.messages.parse({
      ...this.common(REVIEW_SYSTEM),
      max_tokens: 8000,
      output_config: this.outputConfig(ReviewResult),
      messages: [
        {
          role: "user",
          content: `Review these flashcards against the material below. Use the exact bracketed id when reporting an issue.\n\n<cards>\n${cardList}\n</cards>\n\n<material>\n${input.source}\n</material>`,
        },
      ],
    });

    const parsed = response.parsed_output;
    if (!parsed) throw new ProviderResponseError("Review returned no parseable output");

    // The model can hallucinate an id; drop anything that doesn't match a real card.
    const known = new Set(input.cards.map((c) => c.id));
    return {
      issues: parsed.issues.filter((i) => known.has(i.cardId)),
      usage: usageFrom(this.model, response.usage),
    };
  }
}
