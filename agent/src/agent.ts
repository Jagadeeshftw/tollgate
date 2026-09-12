import { Budget, formatAmount, planSet, type Directory, type Plan } from "@tollgate/discovery";
import {
  OverQuoteError,
  ServiceFailedAfterPaymentError,
  SettlementFailedError,
  Tollgate,
  type HederaPayer,
} from "@tollgatehq/sdk";

import type { Reasoner } from "./reasoner.js";
import type { PlanView, TraceSink } from "./trace.js";

export interface AgentOptions {
  readonly directory: Directory;
  readonly reasoner: Reasoner;
  readonly payer: HederaPayer;
  readonly budget: Budget;
  readonly trace: TraceSink;
  /** Quantities the agent may choose between. A dial, not a free integer. */
  readonly unitChoices?: readonly number[];
  /** Hard stop on purchases per question, independent of budget. */
  readonly maxPurchases?: number;
  /**
   * How a purchase is executed. Defaults to a real x402 payment.
   *
   * Injectable so the loop's guard rails — budget arithmetic, the self-imposed ceiling, the
   * decline paths — can be tested without spending HBAR on every assertion. Passed straight
   * through to the SDK, which owns the actual purchase mechanics; the default is the real thing —
   * there is no "simulate" mode that could be left on by accident.
   */
  readonly purchase?: NonNullable<ConstructorParameters<typeof Tollgate>[0]>["purchase"];
}

export interface AgentResult {
  readonly answered: boolean;
  readonly text: string;
  readonly spentBaseUnits: bigint;
  readonly purchases: readonly { label: string; units: number; transactionId: string }[];
}

const DEFAULT_UNIT_CHOICES = [3, 10, 25, 50] as const;

/**
 * Answer a question, buying data if — and only if — that is the right call.
 *
 * @remarks
 * The loop is built around four decisions the agent could reasonably resolve either way: which
 * service, how much of it, whether the price is justified, and whether what came back is good
 * enough. Each is emitted to the trace with its reasoning, because a decision nobody can see is
 * indistinguishable from a hardcoded branch.
 *
 * Two guards sit outside the model's reach. `Budget` is arithmetic and cannot be argued with, and
 * the ceiling the agent sets for itself is compared against the actual quote before anything is
 * signed. The model decides what a thing is *worth*; the policy decides what is *permitted*.
 *
 * Discovery, pricing and the purchase itself are `@tollgatehq/sdk`'s — this loop is the judgment
 * layer the SDK deliberately leaves out. It supplies its own `Directory` and `Budget` rather than
 * letting the SDK build them, because both are shared with the policy layer above (`planSet`
 * prices every candidate against the same budget the SDK will later charge).
 */
export async function ask(question: string, options: AgentOptions): Promise<AgentResult> {
  const {
    directory,
    reasoner,
    payer,
    budget,
    trace,
    unitChoices = DEFAULT_UNIT_CHOICES,
    maxPurchases = 3,
    purchase,
  } = options;

  const tollgate = new Tollgate({
    directory,
    budget,
    hedera: payer,
    ...(purchase ? { purchase } : {}),
  });

  const purchases: { label: string; units: number; transactionId: string }[] = [];
  const collected: { from: string; data: unknown }[] = [];
  const bought: string[] = [];

  trace({
    type: "question",
    question,
    budget: formatAmount(budget.remaining, "0.0.0"),
    asset: "0.0.0",
  });

  const services = await tollgate.list();
  const candidates = services.map((s) => s.candidate);
  trace({ type: "discovered", candidates });

  if (candidates.length === 0) {
    return decline("No services are listed that could answer this.");
  }

  for (let round = 0; round < maxPurchases; round++) {
    const { affordable: plans, excluded } = planSet(candidates, budget, unitChoices);

    // Emitted before the model is consulted, because that ordering is the point.
    trace({
      type: "policy:plans",
      affordable: plans.map(toPlanView),
      excluded: excluded.map(({ plan, because }) => ({ ...toPlanView(plan), because })),
      remaining: `${formatAmount(budget.remaining, "0.0.0")} HBAR`,
    });

    if (plans.length === 0) {
      // Nothing affordable. If we already have data, answer from it rather than giving up.
      if (collected.length > 0) break;
      return decline(
        `Nothing on offer fits the remaining budget of ${formatAmount(budget.remaining, "0.0.0")} HBAR.`,
      );
    }

    const judgment = await reasoner.decide({
      question,
      plans,
      remainingBaseUnits: budget.remaining,
      alreadyBought: bought,
    });

    // Decision 1 — which service.
    trace({
      type: "decision:select",
      chose: judgment.plan?.candidate.label ?? "(none)",
      rejected: judgment.rejected,
      reasoning: judgment.serviceReasoning,
    });

    if (!judgment.plan) {
      if (collected.length > 0) break;
      return decline(judgment.worthReasoning || "Decided no purchase was justified.");
    }
    const plan: Plan = judgment.plan;

    // Decision 2 — how much.
    trace({
      type: "decision:size",
      units: plan.units,
      unit: plan.candidate.unit,
      reasoning: judgment.sizeReasoning,
    });

    // Decision 3 — is it worth paying? The agent's own ceiling, checked against the real cost.
    const approved =
      judgment.ceilingBaseUnits >= plan.costBaseUnits && budget.canAfford(plan.costBaseUnits);
    trace({
      type: "decision:authorize",
      approved,
      cost: `${formatAmount(plan.costBaseUnits, plan.candidate.asset)} HBAR`,
      ceiling: `${formatAmount(judgment.ceilingBaseUnits, "0.0.0")} HBAR`,
      remaining: `${formatAmount(budget.remaining, "0.0.0")} HBAR`,
      reasoning: judgment.worthReasoning,
    });

    if (!approved) {
      if (collected.length > 0) break;
      return decline(
        `Not worth the price. ${judgment.worthReasoning}`.trim(),
      );
    }

    const service = services.find((s) => s.label === plan.candidate.label)!;
    let received: unknown;
    try {
      const ceiling =
        judgment.ceilingBaseUnits < budget.remaining ? judgment.ceilingBaseUnits : budget.remaining;
      const result = await service.fetch({
        limit: plan.units,
        maxAmount: formatAmount(ceiling, plan.candidate.asset),
        // One retry, announced. The settlement path has been observed failing transiently and
        // succeeding unchanged moments later; a silent retry would hide how often that happens,
        // which is the number actually worth knowing.
        settlementRetries: 1,
        onRetry: ({ attempt, reason }) => trace({ type: "settlement:retry", attempt, reason }),
      });

      trace({
        type: "quote",
        endpoint: purchaseUrl(plan.candidate, plan.units),
        amount: `${formatAmount(result.challenge.amountBaseUnits, result.challenge.asset)} HBAR`,
        asset: result.challenge.asset,
        payTo: result.challenge.payTo,
      });

      // The budget is already charged — `service.fetch()` reserves against the same `Budget`
      // instance this loop was constructed with, so `budget.spent` below already reflects it.
      trace({
        type: "payment",
        transactionId: result.payment.transactionId,
        amount: `${formatAmount(result.payment.amountBaseUnits, result.challenge.asset)} HBAR`,
        hashscanUrl: result.payment.hashscanUrl,
      });

      received = result.data;
      trace({ type: "received", units: plan.units, bytes: result.body.length });
      emitExclusions(received, trace);
      purchases.push({
        label: plan.candidate.label,
        units: plan.units,
        transactionId: result.payment.transactionId,
      });
      bought.push(`${plan.units} ${plan.candidate.unit}(s) from ${plan.candidate.label}`);
      collected.push({ from: plan.candidate.label, data: received });
    } catch (err) {
      if (err instanceof ServiceFailedAfterPaymentError) {
        // Settled, then the service failed to serve. The budget already carries the charge if the
        // server reported a transaction — see the SDK's own note on why that must not be silent.
        trace({
          type: "error",
          message: `paid ${err.amount} (tx ${err.transactionId || "unreported"}), then the service returned ${err.status}`,
        });
        if (collected.length > 0) break;
        return decline(`Purchase failed after payment: the service returned ${err.status}.`);
      }
      if (err instanceof SettlementFailedError) {
        trace({
          type: "settlement:failed",
          attempted: `${err.attempted} of ${plan.candidate.asset}`,
          payTo: err.payTo,
          attempts: 1,
          detail: err.detail + (err.paid === undefined ? " (whether the transfer landed is unknown)" : ""),
        });
        if (collected.length > 0) break;
        return decline(
          `Could not complete payment: the settlement path did not confirm. ` +
            `This is upstream of the agent — nothing was charged.`,
        );
      }
      if (err instanceof OverQuoteError) {
        // The quote moved above what the agent was willing to pay between deciding and paying.
        trace({ type: "error", message: `refused at the till: server quoted ${err.quoted}, above the stated ceiling of ${err.ceiling}` });
        if (collected.length > 0) break;
        return decline(`server quoted ${err.quoted}, above the stated ceiling of ${err.ceiling}`);
      }
      trace({ type: "error", message: (err as Error).message });
      if (collected.length > 0) break;
      return decline(`Purchase failed: ${(err as Error).message}`);
    }

    // Decision 4 — is this good enough?
    const assessment = await reasoner.assess({
      question,
      data: collected,
      boughtSoFar: bought,
      remainingBaseUnits: budget.remaining,
    });
    trace({
      type: "decision:assess",
      verdict: assessment.verdict,
      reasoning: assessment.reasoning,
    });

    if (assessment.verdict === "sufficient") {
      trace({
        type: "answer",
        text: assessment.answer,
        spent: `${formatAmount(budget.spent, "0.0.0")} HBAR`,
      });
      return {
        answered: true,
        text: assessment.answer,
        spentBaseUnits: budget.spent,
        purchases,
      };
    }

    if (assessment.verdict === "unanswerable") {
      return decline(assessment.reasoning);
    }
    // "insufficient" — loop and consider buying more.
  }

  // Out of rounds or out of budget with data in hand: answer from what we have rather than
  // discarding data we already paid for.
  if (collected.length > 0) {
    const final = await reasoner.assess({
      question,
      data: collected,
      boughtSoFar: bought,
      remainingBaseUnits: budget.remaining,
    });
    trace({ type: "decision:assess", verdict: final.verdict, reasoning: final.reasoning });

    if (final.verdict === "sufficient") {
      trace({
        type: "answer",
        text: final.answer,
        spent: `${formatAmount(budget.spent, "0.0.0")} HBAR`,
      });
      return { answered: true, text: final.answer, spentBaseUnits: budget.spent, purchases };
    }
    return decline(final.reasoning);
  }

  return decline("Could not obtain data to answer this.");

  function decline(reason: string): AgentResult {
    trace({
      type: "declined",
      reason,
      spent: `${formatAmount(budget.spent, "0.0.0")} HBAR`,
    });
    return { answered: false, text: reason, spentBaseUnits: budget.spent, purchases };
  }
}

/**
 * Surface any rows the data source dropped from a ranking.
 *
 * Read defensively: a service is free to return no provenance at all, and a missing field must not
 * take down a purchase that has already been paid for.
 */
function emitExclusions(payload: unknown, trace: TraceSink): void {
  const provenance = (payload as { data?: { provenance?: unknown } })?.data as
    | { provenance?: { excluded?: unknown[]; dataQuality?: string } }
    | undefined;
  const excluded = provenance?.provenance?.excluded;
  if (!Array.isArray(excluded) || excluded.length === 0) return;

  trace({
    type: "data:excluded",
    rule: provenance?.provenance?.dataQuality ?? "excluded by the data source",
    rows: excluded.slice(0, 6).map((row) => {
      const r = row as { tokens?: string[]; name?: string; totalValueLockedUSD?: string; reason?: string };
      return {
        label: r.tokens?.join("/") ?? r.name ?? "(unnamed)",
        reported: `TVL $${Number(r.totalValueLockedUSD ?? 0).toExponential(2)}`,
        reason: r.reason ?? "no reason given",
      };
    }),
  });
}

/** Same construction the SDK's `ServiceHandle` uses internally — kept here only for the trace. */
function purchaseUrl(candidate: Plan["candidate"], units: number): string {
  const url = new URL(candidate.endpoint);
  url.searchParams.set("limit", String(units));
  return url.toString();
}

function toPlanView(plan: Plan): PlanView {
  return {
    label: plan.candidate.label,
    units: plan.units,
    unit: plan.candidate.unit,
    cost: `${formatAmount(plan.costBaseUnits, plan.candidate.asset)} HBAR`,
    unitPrice: `${plan.candidate.unitPrice} HBAR`,
    context: plan.candidate.context,
  };
}

export { Budget };
