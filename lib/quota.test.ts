import { describe, expect, it } from "vitest";

import {
  check,
  dayKey,
  emptyState,
  FREE_LIMITS,
  IP_DAILY_CEILING,
  IpQuota,
  record,
  rollOver,
} from "./quota";

const MONDAY = new Date("2026-03-02T10:00:00Z");
const TUESDAY = new Date("2026-03-03T09:00:00Z");

describe("quota counters", () => {
  it("allows the first text run", () => {
    expect(check(emptyState(MONDAY), "text", MONDAY).allowed).toBe(true);
  });

  it("blocks once the daily text limit is reached", () => {
    let state = emptyState(MONDAY);
    for (let i = 0; i < FREE_LIMITS.text; i += 1) {
      expect(check(state, "text", MONDAY).allowed).toBe(true);
      state = record(state, "text", MONDAY);
    }

    const decision = check(state, "text", MONDAY);
    expect(decision.allowed).toBe(false);
    expect(decision.message).toContain("free generations");
  });

  it("meters photos separately from text, since they cost ~20x more", () => {
    let state = emptyState(MONDAY);
    for (let i = 0; i < FREE_LIMITS.photo; i += 1) {
      state = record(state, "photo", MONDAY);
    }

    expect(check(state, "photo", MONDAY).allowed).toBe(false);
    // Text is untouched — running out of photos must not block pasted notes.
    expect(check(state, "text", MONDAY).allowed).toBe(true);
  });

  it("explains that pasted text still works when photos run out", () => {
    let state = emptyState(MONDAY);
    for (let i = 0; i < FREE_LIMITS.photo; i += 1) state = record(state, "photo", MONDAY);
    expect(check(state, "photo", MONDAY).message).toContain("pasted text");
  });

  it("rolls the counters over at the next calendar day", () => {
    let state = emptyState(MONDAY);
    for (let i = 0; i < FREE_LIMITS.text; i += 1) state = record(state, "text", MONDAY);
    expect(check(state, "text", MONDAY).allowed).toBe(false);

    const next = rollOver(state, TUESDAY);
    expect(next.day).toBe(dayKey(TUESDAY));
    expect(next.text).toBe(0);
    expect(check(state, "text", TUESDAY).allowed).toBe(true);
  });
});

describe("IpQuota", () => {
  it("is far looser than the per-person limit, so a school on one IP isn't locked out", () => {
    // A full class each doing a full day's work must stay under the ceiling,
    // or the backstop becomes the thing that locks out a school.
    expect(IP_DAILY_CEILING).toBeGreaterThan(35 * FREE_LIMITS.text);
  });

  it("eventually blocks a single abusive source", () => {
    const quota = new IpQuota(3);
    expect(quota.check("1.2.3.4", MONDAY)).toBe(true);
    expect(quota.check("1.2.3.4", MONDAY)).toBe(true);
    expect(quota.check("1.2.3.4", MONDAY)).toBe(true);
    expect(quota.check("1.2.3.4", MONDAY)).toBe(false);
  });

  it("tracks each address independently", () => {
    const quota = new IpQuota(1);
    expect(quota.check("1.1.1.1", MONDAY)).toBe(true);
    expect(quota.check("2.2.2.2", MONDAY)).toBe(true);
    expect(quota.check("1.1.1.1", MONDAY)).toBe(false);
  });

  it("resets the next day", () => {
    const quota = new IpQuota(1);
    expect(quota.check("1.1.1.1", MONDAY)).toBe(true);
    expect(quota.check("1.1.1.1", MONDAY)).toBe(false);
    expect(quota.check("1.1.1.1", TUESDAY)).toBe(true);
  });
});
