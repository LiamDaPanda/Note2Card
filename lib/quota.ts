/**
 * Free-tier limits.
 *
 * Two counters, because the two paths cost roughly 20x different amounts: reading
 * a photo runs a frontier vision model, while generating from text the user typed
 * is nearly free. Metering them together would either strangle text use or
 * subsidise photo use.
 */

export type RunKind = "text" | "photo";

export interface QuotaState {
  /** Day key in YYYY-MM-DD, so counters roll over at local midnight. */
  day: string;
  text: number;
  photo: number;
}

export interface QuotaDecision {
  allowed: boolean;
  kind: RunKind;
  used: number;
  limit: number;
  /** Shown to the user when a limit is hit. */
  message?: string;
}

/**
 * Free-tier limits are product constants, not configuration.
 *
 * They run in the browser (the per-person counter) as well as on the server, and
 * a server-only env var would read as undefined client-side — giving the two
 * halves different numbers. A constant keeps them honest.
 */
export const FREE_LIMITS = { text: 10, photo: 2 } as const;

export function limits(): { text: number; photo: number } {
  return FREE_LIMITS;
}

export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function emptyState(now = new Date()): QuotaState {
  return { day: dayKey(now), text: 0, photo: 0 };
}

/** Reset the counters when the calendar day has rolled over. */
export function rollOver(state: QuotaState, now = new Date()): QuotaState {
  const today = dayKey(now);
  return state.day === today ? state : emptyState(now);
}

export function check(state: QuotaState, kind: RunKind, now = new Date()): QuotaDecision {
  const current = rollOver(state, now);
  const limit = kind === "text" ? limits().text : limits().photo;
  const used = kind === "text" ? current.text : current.photo;

  if (used >= limit) {
    return {
      allowed: false,
      kind,
      used,
      limit,
      message:
        kind === "photo"
          ? `You've used today's ${limit} free photo ${limit === 1 ? "upload" : "uploads"}. Reading handwriting is the expensive part — pasted text and PDFs are still available, or go premium for unlimited.`
          : `You've used today's ${limit} free generations. They reset at midnight, or go premium for unlimited.`,
    };
  }

  return { allowed: true, kind, used, limit };
}

export function record(state: QuotaState, kind: RunKind, now = new Date()): QuotaState {
  const current = rollOver(state, now);
  return kind === "text"
    ? { ...current, text: current.text + 1 }
    : { ...current, photo: current.photo + 1 };
}

/**
 * A per-IP backstop, deliberately far looser than the per-browser limit.
 *
 * A school shares one public IP, so a class of thirty would collectively hit a
 * strict per-IP quota. This ceiling exists to stop scripted abuse, not students.
 */
/**
 * Sized so a large class sharing one NAT address stays well clear of it:
 * 35 students x the daily text limit, with headroom. Anything approaching this
 * from one address is a script, not a classroom.
 */
export const IP_DAILY_CEILING = 1000;

export class IpQuota {
  private readonly hits = new Map<string, { day: string; count: number }>();

  constructor(private readonly perDay = IP_DAILY_CEILING) {}

  check(ip: string, now = new Date()): boolean {
    const today = dayKey(now);
    const entry = this.hits.get(ip);
    if (!entry || entry.day !== today) {
      this.hits.set(ip, { day: today, count: 1 });
      return true;
    }
    if (entry.count >= this.perDay) return false;
    entry.count += 1;
    return true;
  }
}

/** Process-wide instance. In-memory is fine: worst case a restart forgives some usage. */
export const ipQuota = new IpQuota();
