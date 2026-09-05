import { describe, expect, it } from "vitest";

import { Budget, BudgetExceededError } from "../src/budget.js";
import { affordablePlans, priceOf, toBaseUnits } from "../src/policy.js";
import { ALL_DEX, UNISWAP } from "./support.js";

describe("Budget", () => {
  it("tracks spend and refuses to exceed the limit", () => {
    const budget = new Budget(1_000n);
    expect(budget.canAfford(600n)).toBe(true);
    budget.reserve(600n);
    expect(budget.remaining).toBe(400n);
    expect(budget.canAfford(600n)).toBe(false);
    expect(() => budget.reserve(600n)).toThrow(BudgetExceededError);
    // The failed reserve must not have moved the counter.
    expect(budget.spent).toBe(600n);
  });
});

describe("pricing", () => {
  it("converts HBAR to tinybars exactly", () => {
    expect(toBaseUnits("0.001", "0.0.0")).toBe(100_000n);
    expect(toBaseUnits("1", "0.0.0")).toBe(100_000_000n);
  });

  it("prices a plan by unit count", () => {
    expect(priceOf(UNISWAP, 50).costBaseUnits).toBe(5_000_000n);
    expect(priceOf(ALL_DEX, 50).costBaseUnits).toBe(15_000_000n);
  });
});

describe("affordablePlans", () => {
  it("offers only what the budget can actually cover", () => {
    // 0.005 HBAR: enough for 3 uniswap pools (0.003) but not 3 all-DEX pools (0.009).
    const plans = affordablePlans([UNISWAP, ALL_DEX], new Budget(500_000n), [3, 50]);
    const labels = plans.map((p) => `${p.candidate.label}x${p.units}`);

    expect(labels).toContain("uniswap-poolsx3");
    expect(labels).not.toContain("dex-poolsx3");
    expect(labels).not.toContain("uniswap-poolsx50");
  });

  it("presents options cheapest first", () => {
    const plans = affordablePlans([UNISWAP, ALL_DEX], new Budget(100_000_000n), [3, 10]);
    const costs = plans.map((p) => p.costBaseUnits);
    expect([...costs].sort((a, b) => (a < b ? -1 : 1))).toEqual(costs);
  });

  it("drops a candidate it cannot price rather than failing the question", () => {
    const broken = { ...UNISWAP, label: "broken", unitPrice: "not-a-number" };
    const plans = affordablePlans([broken, UNISWAP], new Budget(100_000_000n), [3]);
    expect(plans.map((p) => p.candidate.label)).toEqual(["uniswap-pools"]);
  });
});
