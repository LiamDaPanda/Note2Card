import { afterEach, describe, expect, it } from "vitest";

import { SpendLedger, budgetUsd, monthKey } from "./spend";
import { costUsd } from "./ai/pricing";

const MARCH = new Date("2026-03-10T12:00:00Z");
const APRIL = new Date("2026-04-01T00:00:00Z");

const original = process.env.MONTHLY_AI_BUDGET_USD;
afterEach(() => {
  if (original === undefined) delete process.env.MONTHLY_AI_BUDGET_USD;
  else process.env.MONTHLY_AI_BUDGET_USD = original;
});

describe("budgetUsd", () => {
  it("falls back to a sane default when unset", () => {
    delete process.env.MONTHLY_AI_BUDGET_USD;
    expect(budgetUsd()).toBe(25);
  });

  it("ignores a nonsense value rather than treating it as zero budget", () => {
    process.env.MONTHLY_AI_BUDGET_USD = "not-a-number";
    expect(budgetUsd()).toBe(25);
  });

  it("reads a configured ceiling", () => {
    process.env.MONTHLY_AI_BUDGET_USD = "5";
    expect(budgetUsd()).toBe(5);
  });
});

describe("SpendLedger", () => {
  it("starts within budget", () => {
    expect(new SpendLedger(MARCH).withinBudget(MARCH)).toBe(true);
  });

  it("stops free generation once the ceiling is crossed", () => {
    process.env.MONTHLY_AI_BUDGET_USD = "1";
    const ledger = new SpendLedger(MARCH);

    ledger.add(0.6, MARCH);
    expect(ledger.withinBudget(MARCH)).toBe(true);

    ledger.add(0.6, MARCH);
    expect(ledger.withinBudget(MARCH)).toBe(false);
  });

  it("resets on the first of the next month", () => {
    process.env.MONTHLY_AI_BUDGET_USD = "1";
    const ledger = new SpendLedger(MARCH);
    ledger.add(5, MARCH);
    expect(ledger.withinBudget(MARCH)).toBe(false);

    expect(ledger.withinBudget(APRIL)).toBe(true);
    expect(ledger.snapshot(APRIL).month).toBe(monthKey(APRIL));
    expect(ledger.snapshot(APRIL).spentUsd).toBe(0);
  });

  it("reports what is left", () => {
    process.env.MONTHLY_AI_BUDGET_USD = "10";
    const ledger = new SpendLedger(MARCH);
    ledger.add(2.5, MARCH);
    expect(ledger.snapshot(MARCH).remainingUsd).toBeCloseTo(7.5);
    expect(ledger.snapshot(MARCH).runs).toBe(1);
  });
});

describe("costUsd", () => {
  it("prices Opus input and output at their published rates", () => {
    // 1M input + 1M output on Opus 5 = $5 + $25.
    expect(
      costUsd({ model: "claude-opus-5", inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(30);
  });

  it("bills cached reads at a tenth of the input rate", () => {
    expect(
      costUsd({
        model: "claude-opus-5",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.5);
  });

  it("makes generation on the cheap tier ~an order of magnitude less than Sonnet", () => {
    const sonnet = costUsd({ model: "claude-sonnet-5", inputTokens: 1200, outputTokens: 1700 });
    const open = costUsd({ model: "some-open-model", inputTokens: 1200, outputTokens: 1700 });
    expect(open).toBeLessThan(sonnet / 10);
  });

  it("falls back to open-model pricing for an unknown model rather than charging zero", () => {
    expect(costUsd({ model: "mystery", inputTokens: 1_000_000, outputTokens: 0 })).toBeGreaterThan(0);
  });
});
