import { describe, expect, it } from "vitest";

import { Budget } from "../src/budget.js";
import { affordablePlans, isFlatFee, planSet, priceOf } from "../src/policy.js";
import type { Candidate } from "../src/types.js";

/**
 * `@tollgate/discovery`'s first test suite. Starts here, with the flat-fee fix, because it is the
 * most consequential thing in the package today — see spec/PROMPTS.md's account of what shipped
 * without it: a model reasoning about a dial that does nothing, and rationalizing the result.
 */

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  label: "uniswap-pools",
  name: "uniswap-pools.tollgatehq.eth",
  context: "Top Uniswap v3 pools by TVL",
  endpoint: "https://svc.example/s/uniswap-pools",
  unitPrice: "0.001",
  unit: "pool",
  asset: "0.0.0",
  schema: "{pools:[]}",
  ...over,
});

const flatFee = (over: Partial<Candidate> = {}): Candidate =>
  candidate({ label: "uniswap-tvl", unit: "query", unitPrice: "0.001", ...over });

describe("isFlatFee", () => {
  it("is true only for unit: query", () => {
    expect(isFlatFee(flatFee())).toBe(true);
    expect(isFlatFee(candidate({ unit: "pool" }))).toBe(false);
    expect(isFlatFee(candidate({ unit: "block" }))).toBe(false);
  });
});

describe("priceOf on a flat-fee candidate", () => {
  it("charges for exactly one unit, whatever was asked for", () => {
    for (const requested of [1, 3, 10, 25, 50, 1000]) {
      const plan = priceOf(flatFee(), requested);
      expect(plan.units).toBe(1);
      expect(plan.costBaseUnits).toBe(100_000n); // 0.001 HBAR, once
    }
  });

  it("is unchanged for a metered candidate", () => {
    expect(priceOf(candidate(), 10).costBaseUnits).toBe(1_000_000n); // 0.001 * 10
  });
});

describe("planSet and affordablePlans on a flat-fee candidate", () => {
  const candidates = [candidate(), flatFee()];
  const unitChoices = [3, 10, 25, 50];

  it("offers exactly one plan for the flat-fee listing, not one per unit choice", () => {
    const budget = new Budget(20_000_000n);
    const { affordable } = planSet(candidates, budget, unitChoices);
    const tvlPlans = affordable.filter((p) => p.candidate.label === "uniswap-tvl");
    expect(tvlPlans).toHaveLength(1);
    expect(tvlPlans[0]!.units).toBe(1);

    const same = affordablePlans(candidates, budget, unitChoices).filter(
      (p) => p.candidate.label === "uniswap-tvl",
    );
    expect(same).toHaveLength(1);
  });

  it("does not change the metered candidate's plan count", () => {
    const budget = new Budget(20_000_000n);
    const { affordable } = planSet(candidates, budget, unitChoices);
    const poolPlans = affordable.filter((p) => p.candidate.label === "uniswap-pools");
    expect(poolPlans).toHaveLength(unitChoices.length);
  });

  it("excludes the flat-fee listing's one plan when the budget cannot cover it, same as any other", () => {
    const budget = new Budget(50_000n); // less than 0.001 HBAR
    const { affordable, excluded } = planSet(candidates, budget, unitChoices);
    expect(affordable.filter((p) => p.candidate.label === "uniswap-tvl")).toHaveLength(0);
    expect(excluded.filter((p) => p.plan.candidate.label === "uniswap-tvl")).toHaveLength(1);
  });

  /**
   * The bug this whole suite exists to close, reproduced directly: before the clamp, offering
   * "10 query" and "50 query" of a flat-fee listing priced them at 10x and 50x — indistinguishable
   * in shape from a real bulk discount on a metered listing, and exactly what let the model
   * rationalize paying more for identical data. Asserted on `priceOf` directly, which is what
   * would misprice it if the clamp in `priceOf` (not just the deduplication in `planSet`) were
   * ever removed.
   */
  it("would have priced 50 'queries' at 50x without the clamp", () => {
    const unitCost = 100_000n; // 0.001 HBAR
    const wouldBeUnclamped = unitCost * 50n;
    expect(wouldBeUnclamped).toBe(5_000_000n); // what the old arithmetic charged
    expect(priceOf(flatFee(), 50).costBaseUnits).toBe(unitCost); // what it charges now
  });
});
