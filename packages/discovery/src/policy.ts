import type { Budget } from "./budget.js";
import type { Candidate, Plan } from "./types.js";

/** HBAR is denominated in tinybars. Mirrors the service's own conversion. */
const HBAR_DECIMALS = 8;
const DECIMALS: Record<string, number> = { "0.0.0": HBAR_DECIMALS };

export class UnpriceableCandidateError extends Error {
  constructor(readonly label: string, reason: string) {
    super(`cannot price "${label}": ${reason}`);
    this.name = "UnpriceableCandidateError";
  }
}

/** Convert a decimal string to an asset's smallest units, exactly. */
export function toBaseUnits(amount: string, asset: string): bigint {
  const decimals = DECIMALS[asset];
  if (decimals === undefined) throw new UnpriceableCandidateError(asset, "unknown asset");
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new UnpriceableCandidateError(asset, `malformed amount "${amount}"`);
  }
  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new UnpriceableCandidateError(asset, `"${amount}" exceeds ${decimals} decimals`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/** What buying `units` from `candidate` would cost. */
export function priceOf(candidate: Candidate, units: number): Plan {
  if (!Number.isSafeInteger(units) || units < 1) {
    throw new UnpriceableCandidateError(candidate.label, `invalid unit count ${units}`);
  }
  const unitCost = toBaseUnits(candidate.unitPrice, candidate.asset);
  return { candidate, units, costBaseUnits: unitCost * BigInt(units) };
}

/**
 * The decision space: every plan the agent could actually execute right now.
 *
 * @remarks
 * Computed before the model is consulted, and it is the *only* thing the model gets to choose
 * from. This is what keeps "which service, how much, is it worth it" a real decision rather than
 * free-form generation — the options are priced, affordability is already settled, and a plan the
 * budget cannot cover is never on the menu to be talked into.
 */
export function affordablePlans(
  candidates: readonly Candidate[],
  budget: Budget,
  unitChoices: readonly number[],
): Plan[] {
  const plans: Plan[] = [];
  for (const candidate of candidates) {
    for (const units of unitChoices) {
      try {
        const plan = priceOf(candidate, units);
        if (budget.canAfford(plan.costBaseUnits)) plans.push(plan);
      } catch {
        // A candidate we cannot price is a candidate we cannot buy. Skipping it here means a
        // malformed listing removes one option rather than failing the whole question.
      }
    }
  }
  return plans.sort((a, b) => (a.costBaseUnits < b.costBaseUnits ? -1 : 1));
}

export interface PlanSet {
  readonly affordable: Plan[];
  /** Priced, then removed by arithmetic — never offered to the model. */
  readonly excluded: { plan: Plan; because: string }[];
}

/**
 * The full decision space, with the excluded half kept rather than discarded.
 *
 * @remarks
 * `affordablePlans` answers "what may be bought"; this also answers "what was ruled out, and by
 * what". The second half is what makes the budget legible as a constraint in the trace — an option
 * the model never saw is a stronger statement than an option it declined.
 */
export function planSet(
  candidates: readonly Candidate[],
  budget: Budget,
  unitChoices: readonly number[],
): PlanSet {
  const affordable: Plan[] = [];
  const excluded: { plan: Plan; because: string }[] = [];

  for (const candidate of candidates) {
    for (const units of unitChoices) {
      let plan: Plan;
      try {
        plan = priceOf(candidate, units);
      } catch (err) {
        continue; // unpriceable listings are not options at all
      }
      if (budget.canAfford(plan.costBaseUnits)) {
        affordable.push(plan);
      } else {
        excluded.push({
          plan,
          because: `costs ${formatAmount(plan.costBaseUnits, plan.candidate.asset)} HBAR, budget has ${formatAmount(budget.remaining, "0.0.0")}`,
        });
      }
    }
  }

  affordable.sort((a, b) => (a.costBaseUnits < b.costBaseUnits ? -1 : 1));
  excluded.sort((a, b) => (a.plan.costBaseUnits < b.plan.costBaseUnits ? -1 : 1));
  return { affordable, excluded };
}

/** Human-readable amount, for traces and prompts. */
export function formatAmount(baseUnits: bigint, asset: string): string {
  const decimals = DECIMALS[asset] ?? 0;
  const s = baseUnits.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals || undefined);
  const frac = decimals ? s.slice(-decimals).replace(/0+$/, "") : "";
  return frac ? `${whole}.${frac}` : whole;
}
