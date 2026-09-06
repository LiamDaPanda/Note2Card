import { describe, expect, it } from "vitest";

import { runChecks, similarity, summarise } from "./checks";
import type { Card } from "./ai/schemas";

function card(front: string, back: string, extra?: Partial<Card>): Card {
  return {
    id: `${front}|${back}`.slice(0, 40),
    front,
    back,
    confidence: "high",
    evidence: "",
    ...extra,
  };
}

const kinds = (cards: Card[]) => runChecks(cards).map((i) => i.kind);

describe("similarity", () => {
  it("scores identical wording as 1", () => {
    expect(similarity("What is osmosis?", "what is osmosis")).toBe(1);
  });

  it("scores unrelated questions near zero", () => {
    expect(similarity("What is osmosis?", "Define active transport")).toBeLessThan(0.2);
  });
});

describe("runChecks", () => {
  it("passes a well-formed card with no findings", () => {
    expect(kinds([card("What is diffusion?", "Movement from high to low concentration.")])).toEqual(
      [],
    );
  });

  it("flags a back longer than the limit", () => {
    expect(kinds([card("What is photosynthesis?", "x".repeat(240))])).toContain("too-long");
  });

  it("flags a front that names no subject", () => {
    expect(kinds([card("What is it?", "Something.")])).toContain("vague");
  });

  it("flags a single-word front", () => {
    expect(kinds([card("Osmosis", "Water movement.")])).toContain("vague");
  });

  it("flags an answer that just restates the question", () => {
    expect(kinds([card("Active transport", "active transport!")])).toContain("incomplete");
  });

  it("flags an empty side", () => {
    expect(kinds([card("What is ATP?", "  ")])).toContain("incomplete");
  });

  it("flags near-duplicate fronts against the later card", () => {
    const first = card("What is osmosis?", "Water across a membrane.");
    const second = card("What is osmosis", "Movement of water.");
    const issues = runChecks([first, second]);
    const duplicate = issues.find((i) => i.kind === "duplicate");

    expect(duplicate).toBeDefined();
    expect(duplicate?.cardId).toBe(second.id);
  });

  it("does not flag genuinely different cards as duplicates", () => {
    expect(
      kinds([
        card("What is diffusion?", "High to low concentration."),
        card("What is active transport?", "Movement against a gradient using ATP."),
      ]),
    ).not.toContain("duplicate");
  });

  it("flags OCR debris such as a digit inside a word", () => {
    expect(kinds([card("What is m1tochondria?", "The powerhouse.")])).toContain("ocr");
  });

  it("surfaces low-confidence cards for review", () => {
    expect(
      kinds([card("What is the Calvin cycle?", "Carbon fixation.", { confidence: "low" })]),
    ).toContain("incomplete");
  });
});

describe("summarise", () => {
  it("reports a clean set", () => {
    expect(summarise([])).toBe("No problems found — these cards look good.");
  });

  it("counts affected cards, not issues", () => {
    const issues = runChecks([card("What is it?", "x".repeat(240))]);
    expect(issues.length).toBeGreaterThan(1);
    expect(summarise(issues)).toBe("1 card could be improved");
  });

  it("pluralises correctly", () => {
    const issues = runChecks([card("What is it?", "A."), card("What is this?", "B.")]);
    expect(summarise(issues)).toBe("2 cards could be improved");
  });
});
