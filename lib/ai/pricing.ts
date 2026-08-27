/**
 * Per-million-token prices, USD. Used to turn `response.usage` into a real
 * dollar figure for the spend ledger — we meter what actually happened rather
 * than estimating from an assumed card count.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Cached input reads bill at roughly a tenth of the normal input rate. */
const CACHE_READ_MULTIPLIER = 0.1;

/** Unknown models (a self-hosted or commodity endpoint) bill at their configured rate. */
const OPEN_MODEL_FALLBACK = { input: 0.2, output: 0.6 };

export function priceFor(model: string): { input: number; output: number } {
  return PRICES[model] ?? OPEN_MODEL_FALLBACK;
}

export function costUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}): number {
  const p = priceFor(args.model);
  const cacheRead = args.cacheReadTokens ?? 0;
  return (
    (args.inputTokens * p.input +
      cacheRead * p.input * CACHE_READ_MULTIPLIER +
      args.outputTokens * p.output) /
    1_000_000
  );
}
