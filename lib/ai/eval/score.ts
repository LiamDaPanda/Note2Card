import { runChecks } from "@/lib/checks";
import type { Card, GeneratedCard } from "@/lib/ai/schemas";
import type { EvalCase } from "./fixtures";

export interface CaseScore {
  id: string;
  cards: number;
  /** Fraction of required concepts the set actually tests. */
  coverage: number;
  missed: string[];
  /** Claims that appear in the cards but not in the source. The critical metric. */
  fabrications: string[];
  /** Findings from the same deterministic checks the product runs. */
  qualityIssues: number;
  passed: boolean;
}

export interface Report {
  provider: string;
  model: string;
  cases: CaseScore[];
  coverage: number;
  fabrications: number;
  qualityIssues: number;
  passed: boolean;
}

function haystack(cards: GeneratedCard[]): string {
  return cards.map((c) => `${c.front} ${c.back}`).join(" ").toLowerCase();
}

export function scoreCase(testCase: EvalCase, cards: GeneratedCard[]): CaseScore {
  const text = haystack(cards);

  const missed: string[] = [];
  for (const concept of testCase.mustCover) {
    // A concept counts as covered if any of its accepted spellings appears.
    if (!concept.some((alias) => text.includes(alias.toLowerCase()))) {
      missed.push(concept[0] ?? "");
    }
  }

  const fabrications = testCase.mustNotClaim.filter((claim) =>
    text.includes(claim.toLowerCase()),
  );

  const asCards: Card[] = cards.map((c, i) => ({
    id: `${testCase.id}-${i}`,
    front: c.front,
    back: c.back,
    confidence: c.confidence,
    evidence: c.evidence,
  }));
  const qualityIssues = runChecks(asCards).length;

  const covered = testCase.mustCover.length - missed.length;
  const coverage = testCase.mustCover.length === 0 ? 1 : covered / testCase.mustCover.length;

  return {
    id: testCase.id,
    cards: cards.length,
    coverage,
    missed,
    fabrications,
    qualityIssues,
    // A single fabrication fails the case outright: a confidently wrong card is
    // the one failure mode that makes the product worse than doing nothing.
    passed: fabrications.length === 0 && coverage >= 0.8 && cards.length > 0,
  };
}

export function summarise(provider: string, model: string, cases: CaseScore[]): Report {
  const coverage = cases.reduce((sum, c) => sum + c.coverage, 0) / (cases.length || 1);
  const fabrications = cases.reduce((sum, c) => sum + c.fabrications.length, 0);
  const qualityIssues = cases.reduce((sum, c) => sum + c.qualityIssues, 0);

  return {
    provider,
    model,
    cases,
    coverage,
    fabrications,
    qualityIssues,
    passed: cases.every((c) => c.passed),
  };
}

export function render(report: Report): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  Provider: ${report.provider}  ·  Model: ${report.model}`);
  lines.push("");

  for (const c of report.cases) {
    const mark = c.passed ? "PASS" : "FAIL";
    lines.push(`  ${mark}  ${c.id.padEnd(20)} ${c.cards} cards  coverage ${(c.coverage * 100).toFixed(0)}%`);
    if (c.missed.length > 0) lines.push(`         missed: ${c.missed.join(", ")}`);
    if (c.fabrications.length > 0) {
      lines.push(`         FABRICATED (not in source): ${c.fabrications.join(", ")}`);
    }
    if (c.qualityIssues > 0) lines.push(`         ${c.qualityIssues} quality finding(s)`);
  }

  lines.push("");
  lines.push(`  Coverage      ${(report.coverage * 100).toFixed(1)}%`);
  lines.push(`  Fabrications  ${report.fabrications}  ${report.fabrications === 0 ? "" : "<- blocks any provider swap"}`);
  lines.push(`  Quality       ${report.qualityIssues} finding(s)`);
  lines.push("");
  lines.push(report.passed ? "  RESULT: pass" : "  RESULT: fail");
  lines.push("");

  return lines.join("\n");
}
