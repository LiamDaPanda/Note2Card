"use client";

import { check, emptyState, record, rollOver, type QuotaState, type RunKind } from "@/lib/quota";

/**
 * The per-person half of the quota, kept in the browser.
 *
 * The server enforces a much looser per-IP ceiling as an abuse backstop, because
 * a school shares one public IP and a strict server-side limit would lock out a
 * whole class. Neither is airtight without accounts; at a tenth of a cent per
 * text run, being occasionally wrong is cheap.
 */
const KEY = "note2card:quota:v1";

export function readQuota(): QuotaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as QuotaState;
    if (typeof parsed.day !== "string") return emptyState();
    return rollOver(parsed);
  } catch {
    return emptyState();
  }
}

function write(state: QuotaState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Ignore.
  }
}

export function checkQuota(kind: RunKind) {
  return check(readQuota(), kind);
}

export function recordRun(kind: RunKind): void {
  write(record(readQuota(), kind));
}

/** Free limits, read from the client bundle's copy of the defaults. */
export function remaining(kind: RunKind): number {
  const decision = checkQuota(kind);
  return Math.max(0, decision.limit - decision.used);
}
