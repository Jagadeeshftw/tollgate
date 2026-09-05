import type { PaidResponse } from "@tollgate/x402-client";

import type { Directory } from "../src/directory.js";
import type { AssessmentJudgment, PurchaseJudgment, Reasoner } from "../src/reasoner.js";
import type { Candidate, Plan } from "../src/types.js";

export const UNISWAP: Candidate = {
  label: "uniswap-pools",
  name: "uniswap-pools.tollgate.eth",
  context: "Top Uniswap v3 pools by TVL.",
  endpoint: "https://svc.example/s/uniswap-pools",
  unitPrice: "0.001",
  unit: "pool",
  asset: "0.0.0",
  schema: "{pools:[{id,tvlUSD}]}",
};

export const ALL_DEX: Candidate = {
  label: "dex-pools",
  name: "dex-pools.tollgate.eth",
  context: "Pools across every indexed DEX, one standardized schema.",
  endpoint: "https://svc.example/s/dex-pools",
  unitPrice: "0.003",
  unit: "pool",
  asset: "0.0.0",
  schema: "{pools:[{id,protocol,tvlUSD}]}",
};

export class StaticDirectory implements Directory {
  constructor(private readonly candidates: Candidate[]) {}
  async list(): Promise<Candidate[]> {
    return this.candidates;
  }
}

/**
 * A reasoner whose answers are scripted.
 *
 * Substitutes for the *model*, so the loop's guard rails can be asserted deterministically: that
 * the budget stops a purchase the model approved, that a ceiling below the price declines, that an
 * "unanswerable" verdict does not get padded into an answer. It says nothing about the quality of
 * real reasoning — that is what the live agent run is for.
 */
export class ScriptedReasoner implements Reasoner {
  decideCalls: number = 0;
  assessCalls: number = 0;

  constructor(
    private readonly decisions: Partial<PurchaseJudgment>[],
    private readonly assessments: AssessmentJudgment[],
  ) {}

  async decide(input: { plans: readonly Plan[] }): Promise<PurchaseJudgment> {
    const scripted = this.decisions[this.decideCalls++] ?? {};
    return {
      plan: scripted.plan !== undefined ? scripted.plan : (input.plans[0] ?? null),
      ceilingBaseUnits: scripted.ceilingBaseUnits ?? 10_000_000n,
      serviceReasoning: scripted.serviceReasoning ?? "scripted",
      rejected: scripted.rejected ?? [],
      sizeReasoning: scripted.sizeReasoning ?? "scripted",
      worthReasoning: scripted.worthReasoning ?? "scripted",
    };
  }

  async assess(): Promise<AssessmentJudgment> {
    const next = this.assessments[this.assessCalls++];
    return next ?? { verdict: "sufficient", reasoning: "scripted", answer: "scripted answer" };
  }
}

export function fakePurchase(amountTinybar: string, body: unknown = { pools: [{ id: "p1" }] }) {
  const calls: { url: string; maxAmount?: bigint }[] = [];
  const fn = async (
    url: string,
    _payer: unknown,
    options: { maxAmount?: bigint } = {},
  ): Promise<PaidResponse> => {
    calls.push({ url, ...(options.maxAmount !== undefined ? { maxAmount: options.maxAmount } : {}) });
    return {
      challenge: { asset: "0.0.0", amount: amountTinybar, payTo: "0.0.999", network: "hedera:testnet" },
      status: 200,
      body: JSON.stringify(body),
      transactionId: "0.0.1@1.2",
      hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.1@1.2",
    };
  };
  return { fn: fn as never, calls };
}
