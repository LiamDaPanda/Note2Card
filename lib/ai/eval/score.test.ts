import { describe, expect, it } from "vitest";

import { CASES } from "./fixtures";
import { scoreCase, summarise } from "./score";
import type { GeneratedCard } from "@/lib/ai/schemas";

function card(front: string, back: string): GeneratedCard {
  return { front, back, confidence: "high", evidence: "" };
}

const photosynthesis = CASES.find((c) => c.id === "bio-photosynthesis")!;
const ocr = CASES.find((c) => c.id === "ocr-damaged")!;

/** What a good set for the photosynthesis fixture looks like. */
const GOOD = [
  card("Where do the light-dependent reactions occur?", "In the thylakoid membrane."),
  card("Where does the Calvin cycle occur?", "In the stroma, where it fixes carbon dioxide."),
  card("Which wavelengths does chlorophyll absorb most strongly?", "Blue and red."),
];

describe("scoreCase", () => {
  it("passes a set that covers the material without inventing", () => {
    const score = scoreCase(photosynthesis, GOOD);
    expect(score.coverage).toBe(1);
    expect(score.fabrications).toEqual([]);
    expect(score.passed).toBe(true);
  });

  it("fails a set that invents a fact absent from the source", () => {
    const withFabrication = [
      ...GOOD,
      // True of photosynthesis, but this passage never mentions rubisco.
      card("Which enzyme fixes carbon in the Calvin cycle?", "Rubisco."),
    ];

    const score = scoreCase(photosynthesis, withFabrication);
    expect(score.fabrications).toContain("rubisco");
    expect(score.passed).toBe(false);
  });

  it("fails on fabrication even when coverage is perfect", () => {
    const score = scoreCase(photosynthesis, [...GOOD, card("Photosystem II?", "Splits water.")]);
    expect(score.coverage).toBe(1);
    expect(score.passed).toBe(false);
  });

  it("fails a set that misses too much of the material", () => {
    const score = scoreCase(photosynthesis, [GOOD[0]!]);
    expect(score.coverage).toBeLessThan(0.8);
    expect(score.passed).toBe(false);
  });

  it("fails an empty set", () => {
    expect(scoreCase(photosynthesis, []).passed).toBe(false);
  });

  it("counts a concept as covered under any accepted spelling", () => {
    const score = scoreCase(CASES.find((c) => c.id === "chem-bonding")!, [
      card("Ionic bonding", "Electrons transfer from a metal to a non-metal."),
      card("Covalent bonding", "Two non-metals share a pair of electrons."),
      card("Why do metals conduct?", "A sea of delocalized electrons carries charge."),
      card("Electronegativity", "An atom's tendency to attract a shared pair of electrons."),
    ]);
    // "delocalized" (z) must satisfy the "delocalis" (s) requirement.
    expect(score.missed).toEqual([]);
    expect(score.passed).toBe(true);
  });

  it("catches the redacted-word completion on damaged OCR input", () => {
    const guessed = [
      card("Where does glycolysis occur?", "In the cytoplasm, producing two pyruvate."),
      // The source says "[unclear] cycle" — filling in "Krebs" is the exact
      // confident invention the prompt forbids.
      card("Where does the Krebs cycle occur?", "In the mitochondrial matrix."),
    ];

    const score = scoreCase(ocr, guessed);
    expect(score.fabrications).toContain("krebs");
    expect(score.passed).toBe(false);
  });

  it("passes damaged input when the unreadable part is left alone", () => {
    const honest = [
      card("Where does glycolysis occur?", "In the cytoplasm."),
      card("What does glycolysis produce?", "Two molecules of pyruvate."),
    ];
    expect(scoreCase(ocr, honest).passed).toBe(true);
  });

  it("reports deterministic quality findings alongside coverage", () => {
    const sloppy = [
      card("What is it?", "Something vague."),
      card("What is it?", "Something vague."),
    ];
    expect(scoreCase(photosynthesis, sloppy).qualityIssues).toBeGreaterThan(0);
  });
});

describe("summarise", () => {
  it("fails the whole run if any single case fails", () => {
    const pass = scoreCase(photosynthesis, GOOD);
    const fail = scoreCase(photosynthesis, []);
    expect(summarise("test", "m", [pass, fail]).passed).toBe(false);
  });

  it("passes only when every case passes", () => {
    const pass = scoreCase(photosynthesis, GOOD);
    expect(summarise("test", "m", [pass, pass]).passed).toBe(true);
  });

  it("totals fabrications across cases", () => {
    const bad = scoreCase(photosynthesis, [...GOOD, card("Rubisco?", "An enzyme.")]);
    expect(summarise("test", "m", [bad, bad]).fabrications).toBe(2);
  });
});
