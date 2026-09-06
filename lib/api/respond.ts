import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { MissingCredentialsError, ProviderResponseError } from "@/lib/ai/provider";
import { PdfTooLongError } from "@/lib/pdf";

/** Error codes the client switches on to pick the right UI state. */
export type ApiErrorCode =
  | "not_configured"
  | "rate_limited"
  | "quota_exceeded"
  | "budget_exhausted"
  | "invalid_request"
  | "too_large"
  | "upstream"
  | "unknown";

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

export function fail(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status });
}

/**
 * Map a thrown error to a response the UI can act on.
 *
 * Deliberately never echoes upstream error text that could contain fragments of
 * the user's notes, and never logs request content.
 */
export function handleError(error: unknown) {
  if (error instanceof MissingCredentialsError) {
    return fail(
      "not_configured",
      "The server has no AI credentials configured. Add ANTHROPIC_API_KEY to .env.local and restart.",
      503,
    );
  }

  if (error instanceof PdfTooLongError) {
    return fail("too_large", error.message, 413);
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return fail("not_configured", "The configured API key was rejected. Check ANTHROPIC_API_KEY.", 503);
  }

  if (error instanceof Anthropic.RateLimitError) {
    return fail("rate_limited", "The AI service is rate limiting us right now. Try again in a moment.", 429);
  }

  if (error instanceof Anthropic.BadRequestError) {
    return fail(
      "invalid_request",
      "The AI service rejected the request. Your notes may be too long — try fewer pages at once.",
      400,
    );
  }

  if (error instanceof Anthropic.APIError) {
    return fail("upstream", "The AI service had a problem. Try again in a moment.", 502);
  }

  if (error instanceof ProviderResponseError) {
    return fail("upstream", "The AI returned something unusable. Try generating again.", 502);
  }

  console.error("[note2card] unhandled route error:", error instanceof Error ? error.name : "unknown");
  return fail("unknown", "Something went wrong. Try again.", 500);
}
