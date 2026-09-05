/**
 * Spend limits for the public deployment.
 *
 * @remarks
 * The point of these is not cost — testnet HBAR is free and refills daily. It is that **the demo
 * has to work every single time a judge touches it**, right through to 13 September. An uncapped
 * public endpoint that runs a model on demand can be drained in one evening by one person, and a
 * dead demo during judging is the failure that costs everything.
 *
 * So the caps are generous enough that no honest visitor meets them, and hard enough that no
 * single visitor can consume the day.
 *
 * Counters are in memory. A restart resets them, which is a real hole — but Railway restarts are
 * infrequent and not something a visitor can force, so the trade is worth it against the
 * complexity of a store. Stated rather than hidden.
 */
export interface LimitConfig {
  /** Runs allowed across all visitors per UTC day. */
  readonly runsPerDay: number;
  /** Runs allowed from one IP per rolling hour. */
  readonly runsPerHourPerIp: number;
  /** Largest budget a visitor may select, in tinybars. */
  readonly maxBudgetTinybar: bigint;
}

export const DEFAULT_LIMITS: LimitConfig = {
  runsPerDay: Number(process.env.MAX_RUNS_PER_DAY ?? 150),
  runsPerHourPerIp: Number(process.env.MAX_RUNS_PER_HOUR_PER_IP ?? 6),
  maxBudgetTinybar: BigInt(process.env.MAX_BUDGET_TINYBAR ?? 2_000_000), // 0.02 HBAR
};

export type Refusal =
  | { kind: "daily-cap"; used: number; limit: number; resetsAt: string }
  | { kind: "rate-limit"; limit: number; retryAfterMinutes: number }
  | { kind: "budget-too-large"; requested: bigint; max: bigint };

/** Human wording for a refusal. Says what happened, and what the visitor can still do. */
export function explain(refusal: Refusal): string {
  switch (refusal.kind) {
    case "daily-cap":
      return (
        `This demo has run ${refusal.used} of its ${refusal.limit} live runs for today. ` +
        `Live runs spend real HBAR and real model tokens, so the daily budget is capped to keep ` +
        `the demo working for everyone. It resets at ${refusal.resetsAt}. ` +
        `The recorded runs below are the same agent and are always available.`
      );
    case "rate-limit":
      return (
        `You've used this demo's per-visitor limit of ${refusal.limit} live runs in an hour. ` +
        `Try again in about ${refusal.retryAfterMinutes} minutes, or watch a recorded run below — ` +
        `they are real runs, not simulations.`
      );
    case "budget-too-large":
      return (
        `The largest budget this public demo allows is ` +
        `${Number(refusal.max) / 1e8} HBAR per run. Run it locally with ` +
        `\`pnpm --filter @tollgate/agent demo\` for an unrestricted budget.`
      );
  }
}

export class Limiter {
  private day = utcDay();
  private runsToday = 0;
  private readonly perIp = new Map<string, number[]>();

  constructor(private readonly config: LimitConfig = DEFAULT_LIMITS) {}

  /** Check and, if allowed, consume one run. Returns the reason when refused. */
  take(ip: string, budgetTinybar: bigint): Refusal | null {
    if (budgetTinybar > this.config.maxBudgetTinybar) {
      return { kind: "budget-too-large", requested: budgetTinybar, max: this.config.maxBudgetTinybar };
    }

    const today = utcDay();
    if (today !== this.day) {
      this.day = today;
      this.runsToday = 0;
      this.perIp.clear();
    }

    if (this.runsToday >= this.config.runsPerDay) {
      return {
        kind: "daily-cap",
        used: this.runsToday,
        limit: this.config.runsPerDay,
        resetsAt: `${nextUtcMidnight().toISOString().slice(0, 16).replace("T", " ")} UTC`,
      };
    }

    const hourAgo = Date.now() - 3_600_000;
    const recent = (this.perIp.get(ip) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= this.config.runsPerHourPerIp) {
      const oldest = Math.min(...recent);
      return {
        kind: "rate-limit",
        limit: this.config.runsPerHourPerIp,
        retryAfterMinutes: Math.max(1, Math.ceil((oldest + 3_600_000 - Date.now()) / 60_000)),
      };
    }

    recent.push(Date.now());
    this.perIp.set(ip, recent);
    this.runsToday++;
    return null;
  }

  get status(): { runsToday: number; runsPerDay: number; remaining: number; resetsAt: string } {
    if (utcDay() !== this.day) return { runsToday: 0, runsPerDay: this.config.runsPerDay, remaining: this.config.runsPerDay, resetsAt: nextUtcMidnight().toISOString() };
    return {
      runsToday: this.runsToday,
      runsPerDay: this.config.runsPerDay,
      remaining: Math.max(0, this.config.runsPerDay - this.runsToday),
      resetsAt: nextUtcMidnight().toISOString(),
    };
  }
}

const utcDay = () => new Date().toISOString().slice(0, 10);
function nextUtcMidnight(): Date {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
}
