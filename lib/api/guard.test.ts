import { afterEach, describe, expect, it } from "vitest";

import { guard, userKeyFrom } from "./guard";
import { budgetUsd, ledger } from "@/lib/spend";

/** Each test gets a distinct IP so the shared rate limiter doesn't bleed across cases. */
let n = 0;
function req(headers: Record<string, string> = {}): Request {
  n += 1;
  return new Request("https://example.test/api/generate", {
    method: "POST",
    headers: { "x-forwarded-for": `10.0.0.${n}`, ...headers },
  });
}

const original = process.env.MONTHLY_AI_BUDGET_USD;
afterEach(() => {
  if (original === undefined) delete process.env.MONTHLY_AI_BUDGET_USD;
  else process.env.MONTHLY_AI_BUDGET_USD = original;
});

describe("userKeyFrom", () => {
  it("reads a bring-your-own key from the header", () => {
    expect(userKeyFrom(req({ "x-user-api-key": "sk-ant-abc" }))).toBe("sk-ant-abc");
  });

  it("ignores a value that isn't shaped like a key", () => {
    expect(userKeyFrom(req({ "x-user-api-key": "not-a-key" }))).toBeUndefined();
  });

  it("is undefined when absent", () => {
    expect(userKeyFrom(req())).toBeUndefined();
  });
});

describe("guard", () => {
  it("allows a normal spending request", () => {
    expect(guard(req(), { usesOwnKey: false, spends: true })).toBeNull();
  });

  it("allows a non-spending request", () => {
    expect(guard(req(), { usesOwnKey: false, spends: false })).toBeNull();
  });

  describe("when the monthly budget is exhausted", () => {
    function exhaust() {
      process.env.MONTHLY_AI_BUDGET_USD = "1";
      // Push the shared ledger well past the ceiling for this month.
      ledger.add(budgetUsd() * 5);
    }

    it("blocks free generation with a 503 and an honest explanation", async () => {
      exhaust();
      const response = guard(req(), { usesOwnKey: false, spends: true });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(503);

      const body = await response!.json();
      expect(body.error.code).toBe("budget_exhausted");
      expect(body.error.message).toContain("monthly AI budget");
      expect(body.error.message).toContain("your own API key");
    });

    it("still lets a request through when the user brings their own key", () => {
      exhaust();
      // Their key, their bill — it never touches the operator's budget.
      expect(guard(req({ "x-user-api-key": "sk-ant-x" }), { usesOwnKey: true, spends: true })).toBeNull();
    });

    it("still allows work that spends nothing", () => {
      exhaust();
      expect(guard(req(), { usesOwnKey: false, spends: false })).toBeNull();
    });
  });

  it("rate limits a burst from one address", async () => {
    const ip = "203.0.113.9";
    const burst = () =>
      new Request("https://example.test/api/generate", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
      });

    let limited = null;
    for (let i = 0; i < 40 && !limited; i += 1) {
      limited = guard(burst(), { usesOwnKey: false, spends: false });
    }

    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
    expect((await limited!.json()).error.code).toBe("rate_limited");
  });

  it("rate limits even a request carrying its own key", () => {
    const ip = "203.0.113.10";
    const burst = () =>
      new Request("https://example.test/api/generate", {
        method: "POST",
        headers: { "x-forwarded-for": ip, "x-user-api-key": "sk-ant-x" },
      });

    let limited = null;
    for (let i = 0; i < 40 && !limited; i += 1) {
      limited = guard(burst(), { usesOwnKey: true, spends: true });
    }

    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
  });
});
