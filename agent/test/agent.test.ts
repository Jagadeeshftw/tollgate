import { describe, expect, it } from "vitest";

import { ask } from "../src/agent.js";
import { Budget } from "../src/budget.js";
import { priceOf } from "../src/policy.js";
import { ACTOR, collectTrace, type TraceEvent } from "../src/trace.js";
import { ALL_DEX, fakePurchase, ScriptedReasoner, StaticDirectory, UNISWAP } from "./support.js";

const payer = { accountId: "0.0.1", privateKey: "0x00" };

function run(options: {
  budget: bigint;
  decisions?: Parameters<typeof ScriptedReasoner.prototype.decide> extends never ? never : any[];
  assessments?: any[];
  candidates?: typeof UNISWAP[];
  amount?: string;
  maxPurchases?: number;
}) {
  const { sink, events } = collectTrace();
  const purchase = fakePurchase(options.amount ?? "300000");
  const reasoner = new ScriptedReasoner(options.decisions ?? [], options.assessments ?? []);
  const promise = ask("what are the top uniswap pools?", {
    directory: new StaticDirectory(options.candidates ?? [UNISWAP, ALL_DEX]),
    reasoner,
    payer,
    budget: new Budget(options.budget),
    trace: sink,
    unitChoices: [3, 10],
    ...(options.maxPurchases !== undefined ? { maxPurchases: options.maxPurchases } : {}),
    purchase: purchase.fn,
  });
  return { promise, events, purchase, reasoner };
}

const find = <T extends TraceEvent["type"]>(events: TraceEvent[], type: T) =>
  events.filter((e) => e.type === type) as Extract<TraceEvent, { type: T }>[];

describe("the agent buys, reasons, and answers", () => {
  it("surfaces all four decisions in the trace", async () => {
    const { promise, events } = run({ budget: 100_000_000n });
    await promise;

    // Track D is judged on whether the reasoning is visible and real. Each of these is a point
    // where the agent could have chosen otherwise.
    expect(find(events, "decision:select")).toHaveLength(1);
    expect(find(events, "decision:size")).toHaveLength(1);
    expect(find(events, "decision:authorize")).toHaveLength(1);
    expect(find(events, "decision:assess")).toHaveLength(1);
  });

  it("answers once the data is judged sufficient", async () => {
    const { promise, events } = run({
      budget: 100_000_000n,
      assessments: [{ verdict: "sufficient", reasoning: "covers it", answer: "Pool A leads." }],
    });
    const result = await promise;

    expect(result.answered).toBe(true);
    expect(result.text).toBe("Pool A leads.");
    expect(find(events, "payment")).toHaveLength(1);
  });

  it("charges the budget what actually settled, not what it estimated", async () => {
    const { promise } = run({ budget: 100_000_000n, amount: "777777" });
    const result = await promise;
    expect(result.spentBaseUnits).toBe(777_777n);
  });
});

describe("the agent declines", () => {
  it("when it judges no purchase worthwhile", async () => {
    const { promise, events } = run({ budget: 100_000_000n, decisions: [{ plan: null }] });
    const result = await promise;

    expect(result.answered).toBe(false);
    expect(result.spentBaseUnits).toBe(0n);
    expect(find(events, "payment")).toHaveLength(0);
    expect(find(events, "declined")).toHaveLength(1);
  });

  /**
   * The distinction the whole design turns on: the agent is not refusing because it *cannot*
   * afford this, but because it decided the answer is not worth the asking price.
   */
  it("when the price exceeds the ceiling it set for itself, despite having the budget", async () => {
    const cost = priceOf(UNISWAP, 3).costBaseUnits; // 300,000 tinybar
    const { promise, events } = run({
      budget: 100_000_000n, // plenty
      decisions: [{ ceilingBaseUnits: cost - 1n }], // but not worth it
    });
    const result = await promise;

    expect(result.answered).toBe(false);
    expect(result.spentBaseUnits).toBe(0n);
    const [authorize] = find(events, "decision:authorize");
    expect(authorize!.approved).toBe(false);
  });

  it("when nothing on offer fits the remaining budget", async () => {
    const { promise, events } = run({ budget: 1n });
    const result = await promise;

    expect(result.answered).toBe(false);
    expect(find(events, "decision:select")).toHaveLength(0); // never even asked
    expect(find(events, "declined")).toHaveLength(1);
  });

  it("rather than padding an answer the data cannot support", async () => {
    const { promise } = run({
      budget: 100_000_000n,
      assessments: [{ verdict: "unanswerable", reasoning: "wrong chain entirely", answer: "" }],
    });
    const result = await promise;

    expect(result.answered).toBe(false);
    expect(result.text).toContain("wrong chain");
  });
});

describe("the policy / judgment boundary is visible in the trace", () => {
  /**
   * The design's central claim, asserted as an ordering: arithmetic settles what is affordable
   * before the model is consulted at all. If the plan set were computed after — or worse, by the
   * model — the budget would be a suggestion.
   */
  it("computes and publishes the affordable set before asking the model", async () => {
    const { promise, events, reasoner } = run({ budget: 400_000n });
    await promise;

    const planIndex = events.findIndex((e) => e.type === "policy:plans");
    const selectIndex = events.findIndex((e) => e.type === "decision:select");
    expect(planIndex).toBeGreaterThanOrEqual(0);
    expect(planIndex).toBeLessThan(selectIndex);
    expect(reasoner.decideCalls).toBe(1);
  });

  it("records what the budget removed, not just what survived", async () => {
    // 0.004 HBAR: affords 3 uniswap pools (0.003) but not 3 all-DEX (0.009) or 10 of either.
    const { promise, events } = run({ budget: 400_000n });
    await promise;

    const [plans] = find(events, "policy:plans");
    expect(plans!.affordable.map((p) => `${p.label}x${p.units}`)).toEqual(["uniswap-poolsx3"]);

    const excluded = plans!.excluded.map((p) => `${p.label}x${p.units}`);
    expect(excluded).toContain("dex-poolsx3");
    expect(excluded).toContain("uniswap-poolsx10");
    // Every exclusion states its arithmetic reason.
    for (const e of plans!.excluded) expect(e.because).toMatch(/budget has/);
  });

  it("attributes every emitted event to policy, judgment or network", async () => {
    const { promise, events } = run({ budget: 100_000_000n });
    await promise;
    for (const event of events) {
      expect(ACTOR[event.type], `${event.type} has no actor`).toBeDefined();
    }
    // The four decisions must all be attributed to the model, not to arithmetic.
    for (const t of ["decision:select", "decision:size", "decision:authorize", "decision:assess"] as const) {
      expect(ACTOR[t]).toBe("judgment");
    }
    expect(ACTOR["policy:plans"]).toBe("policy");
  });
});

describe("budget enforcement is not the model's to override", () => {
  /**
   * The scripted reasoner approves a huge ceiling every round; only arithmetic stops it. An agent
   * that can talk past its own spending limit does not have one.
   */
  it("stops buying when the budget runs out however willing the reasoner is", async () => {
    const { promise, purchase } = run({
      budget: 700_000n, // enough for two 300k purchases, not three
      amount: "300000",
      maxPurchases: 5,
      assessments: [
        { verdict: "insufficient", reasoning: "need more", answer: "" },
        { verdict: "insufficient", reasoning: "need more", answer: "" },
        { verdict: "insufficient", reasoning: "need more", answer: "" },
        { verdict: "sufficient", reasoning: "enough now", answer: "done" },
      ],
    });
    const result = await promise;

    expect(purchase.calls.length).toBe(2);
    expect(result.spentBaseUnits).toBe(600_000n);
    expect(result.spentBaseUnits).toBeLessThanOrEqual(700_000n);
  });

  it("never offers the reasoner a plan it could not pay for", async () => {
    const { promise, purchase } = run({ budget: 400_000n, amount: "300000" });
    await promise;
    // 10 pools would be 1,000,000 tinybar — out of budget, so it must not have been chosen.
    expect(purchase.calls[0]!.url).toContain("limit=3");
  });

  it("passes its own ceiling to the payment client as a hard cap", async () => {
    const { promise, purchase } = run({
      budget: 100_000_000n,
      decisions: [{ ceilingBaseUnits: 500_000n }],
    });
    await promise;
    expect(purchase.calls[0]!.maxAmount).toBe(500_000n);
  });
});

describe("buying more than once", () => {
  it("buys again when the first purchase is judged insufficient", async () => {
    const { promise, purchase, events } = run({
      budget: 100_000_000n,
      maxPurchases: 3,
      assessments: [
        { verdict: "insufficient", reasoning: "too few rows", answer: "" },
        { verdict: "sufficient", reasoning: "now it holds", answer: "Pool A leads." },
      ],
    });
    const result = await promise;

    expect(purchase.calls.length).toBe(2);
    expect(result.answered).toBe(true);
    expect(find(events, "decision:assess")).toHaveLength(2);
  });
});
