/**
 * A small in-memory token bucket, per IP.
 *
 * Best-effort: it exists to blunt a burst from one source, not to be a security
 * boundary. Serverless instances each keep their own bucket.
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity = 12,
    private readonly refillPerSecond = 0.2,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsedSeconds = (now - bucket.updatedAt) / 1000;
    const tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);

    if (tokens < 1) {
      this.buckets.set(key, { tokens, updatedAt: now });
      return false;
    }

    this.buckets.set(key, { tokens: tokens - 1, updatedAt: now });
    return true;
  }
}

export const limiter = new RateLimiter();

/** Best available client identifier behind a proxy. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
