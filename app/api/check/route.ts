import { NextResponse } from "next/server";
import { z } from "zod";

import { getProvider } from "@/lib/ai";
import { Card, type CardIssue } from "@/lib/ai/schemas";
import { guard, userKeyFrom } from "@/lib/api/guard";
import { fail, handleError } from "@/lib/api/respond";
import { runChecks, summarise } from "@/lib/checks";
import { ledger } from "@/lib/spend";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  source: z.string().max(120_000),
  cards: z.array(Card).min(1).max(200),
});

export interface CheckResponse {
  issues: CardIssue[];
  summary: string;
}

/**
 * Quality check, deterministic-first.
 *
 * lib/checks.ts catches duplicates, over-long answers, subject-less fronts and
 * OCR debris for free. The model is only asked about what a regex can't see —
 * claims the source doesn't support, and missing qualifiers — and only when
 * there's source material to check against.
 */
export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return fail("invalid_request", "The request was malformed.", 400);

    const { source, cards } = parsed.data;
    const deterministic = runChecks(cards);

    // Without source text there is nothing to ground an "unsupported" claim
    // against, so the model pass would be guessing. Skip it.
    if (source.trim().length === 0) {
      return NextResponse.json<CheckResponse>({
        issues: deterministic,
        summary: summarise(deterministic),
      });
    }

    const userKey = userKeyFrom(request);
    const blocked = guard(request, { usesOwnKey: Boolean(userKey), spends: true });
    // A blocked model pass still returns the free checks rather than failing.
    if (blocked) {
      return NextResponse.json<CheckResponse>({
        issues: deterministic,
        summary: summarise(deterministic),
      });
    }

    const provider = getProvider("check", userKey);
    const { issues, usage } = await provider.review({
      source,
      cards: cards.map((c) => ({ id: c.id, front: c.front, back: c.back, evidence: c.evidence })),
    });
    if (!userKey) ledger.add(usage.costUsd);

    const all = dedupe([...deterministic, ...issues]);
    return NextResponse.json<CheckResponse>({ issues: all, summary: summarise(all) });
  } catch (error) {
    return handleError(error);
  }
}

/** One issue of each kind per card — the model often restates a deterministic finding. */
function dedupe(issues: CardIssue[]): CardIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.cardId}:${issue.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
