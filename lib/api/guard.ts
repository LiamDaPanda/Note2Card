import { ledger } from "@/lib/spend";
import { clientIp, limiter } from "@/lib/ratelimit";
import { ipQuota } from "@/lib/quota";
import { fail } from "./respond";

/**
 * Everything that has to be true before a request is allowed to spend money.
 *
 * A request carrying the user's own API key skips the budget check entirely —
 * it costs the operator nothing — but still passes through rate limiting.
 */
export function guard(request: Request, opts: { usesOwnKey: boolean; spends: boolean }) {
  const ip = clientIp(request);

  if (!limiter.take(ip)) {
    return fail("rate_limited", "Too many requests. Give it a few seconds.", 429);
  }

  if (opts.usesOwnKey) return null;

  if (opts.spends && !ipQuota.check(ip)) {
    return fail("quota_exceeded", "This network has hit today's shared limit. Try again tomorrow.", 429);
  }

  if (opts.spends && !ledger.withinBudget()) {
    return fail(
      "budget_exhausted",
      "Note2Card has hit its monthly AI budget, so free generation is paused until next month. You can keep going by adding your own API key in Settings.",
      503,
    );
  }

  return null;
}

/** Read a bring-your-own API key from the request, if present. */
export function userKeyFrom(request: Request): string | undefined {
  const header = request.headers.get("x-user-api-key");
  return header && header.startsWith("sk-") ? header : undefined;
}
