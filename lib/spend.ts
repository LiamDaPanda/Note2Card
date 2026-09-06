/**
 * The spend ceiling.
 *
 * Every model call reports what it actually cost (from `response.usage`, not an
 * estimate). Those costs accumulate here, and once the month's free-tier spend
 * crosses MONTHLY_AI_BUDGET_USD, free generation stops until the month rolls over.
 *
 * This is the mechanism that makes the worst case a number you chose rather than
 * a number the internet chose for you. Requests carrying a user's own API key
 * never touch the ledger — they cost the operator nothing.
 */

export interface LedgerState {
  /** YYYY-MM, so the ledger resets on the first of the month. */
  month: string;
  spentUsd: number;
  runs: number;
}

export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function budgetUsd(): number {
  const raw = Number(process.env.MONTHLY_AI_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

export class SpendLedger {
  private state: LedgerState;

  constructor(now = new Date()) {
    this.state = { month: monthKey(now), spentUsd: 0, runs: 0 };
  }

  private current(now: Date): LedgerState {
    const month = monthKey(now);
    if (this.state.month !== month) {
      this.state = { month, spentUsd: 0, runs: 0 };
    }
    return this.state;
  }

  /** True while there is budget left for free-tier work. */
  withinBudget(now = new Date()): boolean {
    return this.current(now).spentUsd < budgetUsd();
  }

  add(costUsd: number, now = new Date()): void {
    const state = this.current(now);
    state.spentUsd += costUsd;
    state.runs += 1;
  }

  snapshot(now = new Date()): LedgerState & { budgetUsd: number; remainingUsd: number } {
    const state = this.current(now);
    const budget = budgetUsd();
    return {
      ...state,
      budgetUsd: budget,
      remainingUsd: Math.max(0, budget - state.spentUsd),
    };
  }
}

/**
 * Process-wide ledger. In-memory means a redeploy forgives the month's tally —
 * acceptable for a spend *ceiling*, whose job is bounding a runaway, not
 * accounting. Back it with a KV store when there's more than one instance.
 */
export const ledger = new SpendLedger();
