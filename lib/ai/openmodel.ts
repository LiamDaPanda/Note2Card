import { z } from "zod";

import { costUsd } from "./pricing";
import {
  buildGenerationPrompt,
  buildRegeneratePrompt,
  GENERATION_RULES,
  REVIEW_SYSTEM,
} from "./prompts";
import { GenerationResult, RegeneratedCard, ReviewResult } from "./schemas";
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

/**
 * An OpenAI-compatible chat-completions client, for running the *generation*
 * stage on a commodity open-model host at a fraction of frontier pricing.
 *
 * Writing cards from already-clean text is a narrow task; reading handwriting is
 * not. This provider deliberately refuses to transcribe — extraction stays on a
 * frontier vision model. Only move generation here once `npm run eval` shows
 * quality holds.
 */
export class OpenModelProvider implements AIProvider {
  readonly name = "openmodel";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts?: { baseUrl?: string; apiKey?: string; model?: string }) {
    const baseUrl = opts?.baseUrl ?? process.env.OPENMODEL_BASE_URL;
    const apiKey = opts?.apiKey ?? process.env.OPENMODEL_API_KEY;
    const model = opts?.model ?? process.env.OPENMODEL_MODEL;
    if (!baseUrl || !apiKey || !model) throw new MissingCredentialsError("openmodel");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(_images: ImageInput[]): Promise<TranscribeResult> {
    throw new ProviderResponseError(
      "The open-model provider does not do vision extraction. Set AI_PROVIDER_EXTRACT=anthropic.",
    );
  }

  private async complete<T extends z.ZodType>(args: {
    system: string;
    user: string;
    schema: T;
    schemaName: string;
    maxTokens: number;
  }): Promise<{ value: z.infer<T>; usage: Usage }> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: args.maxTokens,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: args.schemaName,
            strict: true,
            schema: z.toJSONSchema(args.schema, { target: "draft-7" }),
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ProviderResponseError(
        `Open-model host returned ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new ProviderResponseError("Open-model host returned no content");

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new ProviderResponseError("Open-model host returned invalid JSON");
    }

    const parsed = args.schema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderResponseError(
        `Open-model output did not match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      );
    }

    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;

    return {
      value: parsed.data,
      usage: {
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        costUsd: costUsd({ model: this.model, inputTokens, outputTokens }),
        model: this.model,
      },
    };
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const { value, usage } = await this.complete({
      system: GENERATION_RULES,
      user: buildGenerationPrompt(input),
      schema: GenerationResult,
      schemaName: "flashcards",
      maxTokens: 8000,
    });
    return { cards: value.cards, warnings: value.warnings, usage };
  }

  async regenerate(input: RegenerateInput) {
    const { value, usage } = await this.complete({
      system: GENERATION_RULES,
      user: buildRegeneratePrompt(input),
      schema: RegeneratedCard,
      schemaName: "replacement_card",
      maxTokens: 2000,
    });
    return { card: value.card, usage };
  }

  async review(input: ReviewInput): Promise<ReviewOutcome> {
    const cardList = input.cards
      .map((c) => `[${c.id}]\nFRONT: ${c.front}\nBACK: ${c.back}`)
      .join("\n\n");

    const { value, usage } = await this.complete({
      system: REVIEW_SYSTEM,
      user: `Review these flashcards against the material below. Use the exact bracketed id when reporting an issue.\n\n<cards>\n${cardList}\n</cards>\n\n<material>\n${input.source}\n</material>`,
      schema: ReviewResult,
      schemaName: "review",
      maxTokens: 4000,
    });

    const known = new Set(input.cards.map((c) => c.id));
    return { issues: value.issues.filter((i) => known.has(i.cardId)), usage };
  }
}
