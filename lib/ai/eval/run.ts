/**
 * Run the generation stage against the fixture set and report.
 *
 * This is the gate for moving generation onto a cheaper model. Establish the
 * baseline on the model you ship with, then re-run with
 * AI_PROVIDER_GENERATE=openmodel and compare — swap only if quality holds.
 *
 *   npm run eval
 *   AI_PROVIDER_GENERATE=openmodel npm run eval
 */
import { getProvider } from "../index";
import { CASES } from "./fixtures";
import { render, scoreCase, summarise, type CaseScore } from "./score";

async function main() {
  const provider = getProvider("generate");
  const model =
    process.env.AI_PROVIDER_GENERATE === "openmodel"
      ? (process.env.OPENMODEL_MODEL ?? "unknown")
      : (process.env.ANTHROPIC_MODEL_GENERATE ?? "claude-sonnet-5");

  if (provider.name === "mock") {
    console.log(
      "\n  NOTE: the mock provider is a regex stub for UI and test runs, not a card\n" +
        "  generator. Its scores say nothing about model quality — point this at a\n" +
        "  real provider to establish a baseline.\n",
    );
  }

  console.log(`\nEvaluating ${CASES.length} cases against ${provider.name}…`);

  const scores: CaseScore[] = [];
  for (const testCase of CASES) {
    process.stdout.write(`  ${testCase.id}… `);
    try {
      const result = await provider.generate({
        source: testCase.source,
        count: "auto",
        style: "mixed",
        difficulty: "standard",
      });
      const score = scoreCase(testCase, result.cards);
      scores.push(score);
      console.log(score.passed ? "ok" : "FAIL");
    } catch (error) {
      console.log("error");
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
      scores.push({
        id: testCase.id,
        cards: 0,
        coverage: 0,
        missed: testCase.mustCover.map((c) => c[0] ?? ""),
        fabrications: [],
        qualityIssues: 0,
        passed: false,
      });
    }
  }

  const report = summarise(provider.name, model, scores);
  console.log(render(report));
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
