import { z } from "zod";

import type { StructuredModel } from "./model.js";
import { formatAmount } from "./policy.js";
import { selectModel } from "./providers/index.js";
import type { Plan, Verdict } from "./types.js";

const PurchaseDecision = z.object({
  chosenPlanIndex: z
    .number()
    .int()
    .describe("Index of the chosen plan, or -1 to buy nothing at all."),
  ceiling: z
    .string()
    .describe(
      "The most you would pay for this, as a decimal HBAR string. Your own judgement of what " +
        "the answer is worth — not simply the quoted price.",
    ),
  serviceReasoning: z.string().describe("Why this service rather than the alternatives."),
  rejected: z
    .array(z.object({ label: z.string(), because: z.string() }))
    .describe("Each service you did not choose, and the specific reason."),
  sizeReasoning: z.string().describe("Why this quantity is right for the question asked."),
  worthReasoning: z
    .string()
    .describe("Why this is (or is not) worth paying for, given the budget and the question."),
});

const Assessment = z.object({
  verdict: z.enum(["sufficient", "insufficient", "unanswerable"]),
  reasoning: z.string().describe("What the data does and does not support."),
  answer: z
    .string()
    .describe("The answer to the user's question when sufficient; otherwise an empty string."),
});

export interface PurchaseJudgment {
  readonly plan: Plan | null;
  readonly ceilingBaseUnits: bigint;
  readonly serviceReasoning: string;
  readonly rejected: readonly { label: string; because: string }[];
  readonly sizeReasoning: string;
  readonly worthReasoning: string;
}

export interface AssessmentJudgment {
  readonly verdict: Verdict;
  readonly reasoning: string;
  readonly answer: string;
}

export interface Reasoner {
  decide(input: {
    question: string;
    plans: readonly Plan[];
    remainingBaseUnits: bigint;
    alreadyBought: readonly string[];
  }): Promise<PurchaseJudgment>;

  assess(input: {
    question: string;
    data: unknown;
    boughtSoFar: readonly string[];
    remainingBaseUnits: bigint;
  }): Promise<AssessmentJudgment>;
}

const SYSTEM = `You are a purchasing agent for on-chain data. You have a real budget denominated \
in HBAR and every purchase spends it. You are not a router: your job is to decide whether buying \
data is justified at all, which source is the right one for the question actually asked, and how \
much of it is enough.

Principles:
- Buying nothing is a legitimate outcome. If the question cannot be answered well by any available \
service, or the price is not justified by what the answer is worth, choose -1 and say why.
- Prefer the cheapest source that genuinely answers the question. A broader, more expensive source \
is only worth it when the question actually needs its breadth.
- Buy the smallest quantity that supports a sound answer. More rows cost more and rarely help \
past the point where the answer is stable.
- Your ceiling is your own valuation, not an echo of the quoted price. Say what this answer is \
worth to you.
- Be specific about rejected options. "Too expensive" is not a reason; "covers 12 protocols when \
the question names one, at 3x the price" is.`;

/**
 * The judgement layer.
 *
 * @remarks
 * Provider-agnostic by construction. Every prompt and every schema lives here and is used
 * unchanged whichever vendor answers, so a provider swap cannot alter what the agent is asked,
 * what shape comes back, or what `unanswerable` means. The provider only translates.
 */
export class ModelReasoner implements Reasoner {
  private readonly model: StructuredModel;

  constructor(model?: StructuredModel) {
    this.model = model ?? selectModel();
  }

  /** Which provider is answering. For startup logging only — never a trace event. */
  get provider(): string {
    return this.model.describe;
  }

  async decide(input: {
    question: string;
    plans: readonly Plan[];
    remainingBaseUnits: bigint;
    alreadyBought: readonly string[];
  }): Promise<PurchaseJudgment> {
    const menu = input.plans
      .map((plan, i) => {
        const c = plan.candidate;
        return `[${i}] ${c.label}: ${plan.units} ${c.unit}(s) for ${formatAmount(
          plan.costBaseUnits,
          c.asset,
        )} HBAR
     sells: ${c.context}
     unit price: ${c.unitPrice} HBAR per ${c.unit}
     response shape: ${c.schema}`;
      })
      .join("\n");

    const parsed = await this.model.complete({
      system: SYSTEM,
      schema: PurchaseDecision,
      schemaName: "purchase_decision",
      user: `Question to answer: ${input.question}

Budget remaining: ${formatAmount(input.remainingBaseUnits, "0.0.0")} HBAR
${input.alreadyBought.length ? `Already bought this session: ${input.alreadyBought.join("; ")}` : "Nothing bought yet."}

Options you can afford:
${menu || "(none — nothing is affordable within the remaining budget)"}

Choose one option, or -1 to buy nothing.`,
    });

    const index = parsed.chosenPlanIndex;
    const plan = index >= 0 && index < input.plans.length ? input.plans[index]! : null;

    return {
      plan,
      ceilingBaseUnits: safeCeiling(parsed.ceiling),
      serviceReasoning: parsed.serviceReasoning,
      rejected: parsed.rejected,
      sizeReasoning: parsed.sizeReasoning,
      worthReasoning: parsed.worthReasoning,
    };
  }

  async assess(input: {
    question: string;
    data: unknown;
    boughtSoFar: readonly string[];
    remainingBaseUnits: bigint;
  }): Promise<AssessmentJudgment> {
    const parsed = await this.model.complete({
      system: SYSTEM,
      schema: Assessment,
      schemaName: "assessment",
      user: `Question: ${input.question}

Data purchased so far (${input.boughtSoFar.join("; ")}):
${JSON.stringify(input.data, null, 2).slice(0, 20000)}

Budget remaining: ${formatAmount(input.remainingBaseUnits, "0.0.0")} HBAR

Can you answer the question well from this? Reply "sufficient" with the answer, "insufficient" if \
buying more would genuinely help, or "unanswerable" if no amount of this data answers it. Do not \
pad a weak answer — saying you cannot answer well is better than implying confidence you lack.`,
    });

    return { verdict: parsed.verdict, reasoning: parsed.reasoning, answer: parsed.answer };
  }
}

/** A malformed ceiling means "would pay nothing", which fails closed. */
function safeCeiling(value: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return 0n;
  const [whole = "0", fraction = ""] = value.trim().split(".");
  if (fraction.length > 8) return 0n;
  return BigInt(whole + fraction.padEnd(8, "0"));
}
