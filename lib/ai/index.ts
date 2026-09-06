import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { OpenModelProvider } from "./openmodel";
import { MissingCredentialsError, type AIProvider } from "./provider";

/** The three places a model gets used. Each resolves its provider independently. */
export type Stage = "extract" | "generate" | "check";

type ProviderName = "anthropic" | "openmodel" | "mock";

const DEFAULT_MODELS: Record<Stage, string> = {
  // Reading handwriting is the one step where a mistake becomes a memorised error.
  extract: "claude-opus-5",
  generate: "claude-sonnet-5",
  // The deterministic pass in lib/checks.ts does most of the review work.
  check: "claude-haiku-4-5",
};

const DEFAULT_EFFORT: Record<Stage, "low" | "medium" | "high"> = {
  extract: "high",
  generate: "medium",
  check: "low",
};

function envFor(stage: Stage) {
  const upper = stage.toUpperCase();
  return {
    provider: process.env[`AI_PROVIDER_${upper}`] ?? process.env.AI_PROVIDER,
    model: process.env[`ANTHROPIC_MODEL_${upper}`] ?? process.env.ANTHROPIC_MODEL,
  };
}

function resolveProviderName(stage: Stage): ProviderName {
  const configured = envFor(stage).provider?.toLowerCase();
  if (configured === "mock" || configured === "openmodel" || configured === "anthropic") {
    return configured;
  }
  // No key configured anywhere means the caller gets a clear setup error rather
  // than a confusing 500 from the SDK.
  return "anthropic";
}

/**
 * Build the provider for one pipeline stage.
 *
 * `userApiKey` is an optional bring-your-own-key from the request. It is used for
 * this call only and never stored.
 */
export function getProvider(stage: Stage, userApiKey?: string): AIProvider {
  const name = userApiKey ? "anthropic" : resolveProviderName(stage);

  switch (name) {
    case "mock":
      return new MockProvider();

    case "openmodel":
      if (stage === "extract") {
        // Vision never moves off the frontier model, whatever the env says.
        return new AnthropicProvider({
          model: envFor(stage).model ?? DEFAULT_MODELS.extract,
          effort: DEFAULT_EFFORT.extract,
        });
      }
      return new OpenModelProvider();

    case "anthropic":
      return new AnthropicProvider({
        apiKey: userApiKey,
        model: envFor(stage).model ?? DEFAULT_MODELS[stage],
        effort: DEFAULT_EFFORT[stage],
      });
  }
}

/** True when the server has credentials for its own configured providers. */
export function isConfigured(): boolean {
  if (process.env.AI_PROVIDER === "mock") return true;
  const stages: Stage[] = ["extract", "generate", "check"];
  return stages.every((s) => {
    const name = resolveProviderName(s);
    if (name === "mock") return true;
    if (name === "openmodel") {
      return s === "extract"
        ? Boolean(process.env.ANTHROPIC_API_KEY)
        : Boolean(process.env.OPENMODEL_BASE_URL && process.env.OPENMODEL_API_KEY && process.env.OPENMODEL_MODEL);
    }
    return Boolean(process.env.ANTHROPIC_API_KEY);
  });
}

export { MissingCredentialsError };
export type { AIProvider };
