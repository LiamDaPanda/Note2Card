import { NextResponse } from "next/server";
import { z } from "zod";

import { getProvider } from "@/lib/ai";
import { CardStyle, CardCount, Difficulty, type Card } from "@/lib/ai/schemas";
import { guard, userKeyFrom } from "@/lib/api/guard";
import { fail, handleError } from "@/lib/api/respond";
import { ledger } from "@/lib/spend";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Beyond this the request is too large to be one study session's worth of notes. */
const MAX_SOURCE_CHARS = 120_000;

const Body = z.object({
  source: z.string().min(1).max(MAX_SOURCE_CHARS),
  count: CardCount,
  style: CardStyle,
  difficulty: Difficulty,
  /** Set when replacing a single card rather than generating a whole set. */
  regenerate: z
    .object({ front: z.string(), back: z.string(), avoid: z.array(z.string()) })
    .optional(),
  avoid: z.array(z.string()).optional(),
});

export interface GenerateResponse {
  cards: Card[];
  warnings: string[];
}

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((i) => i.code === "too_big");
      return fail(
        "invalid_request",
        tooLong
          ? "That's more material than one generation can handle. Try splitting it into a couple of sets."
          : "The request was malformed.",
        400,
      );
    }

    const body = parsed.data;
    const userKey = userKeyFrom(request);
    const blocked = guard(request, { usesOwnKey: Boolean(userKey), spends: true });
    if (blocked) return blocked;

    const provider = getProvider("generate", userKey);

    if (body.regenerate) {
      const { card, usage } = await provider.regenerate({
        source: body.source,
        front: body.regenerate.front,
        back: body.regenerate.back,
        style: body.style,
        difficulty: body.difficulty,
        avoid: body.regenerate.avoid,
      });
      if (!userKey) ledger.add(usage.costUsd);

      return NextResponse.json<GenerateResponse>({
        cards: [{ id: newId(), ...card }],
        warnings: [],
      });
    }

    const result = await provider.generate({
      source: body.source,
      count: body.count,
      style: body.style,
      difficulty: body.difficulty,
      avoid: body.avoid,
    });
    if (!userKey) ledger.add(result.usage.costUsd);

    return NextResponse.json<GenerateResponse>({
      cards: result.cards.map((c) => ({ id: newId(), ...c })),
      warnings: result.warnings,
    });
  } catch (error) {
    return handleError(error);
  }
}

function newId(): string {
  return crypto.randomUUID();
}
