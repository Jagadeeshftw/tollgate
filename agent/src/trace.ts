import { formatAmount } from "./policy.js";
import type { Candidate, Plan, Verdict } from "./types.js";

/**
 * Who made a given move.
 *
 * @remarks
 * The design's central claim is that the model decides what something is *worth* while
 * deterministic policy decides what is *permitted*. That claim is only checkable if you can see
 * which is which, so every event is attributed. `policy` lines are arithmetic and could not have
 * come out differently; `judgment` lines are the model's call and could have.
 */
export type Actor = "policy" | "judgment" | "network";

/** One option, as offered to the model or as excluded before it ever saw it. */
export interface PlanView {
  readonly label: string;
  readonly units: number;
  readonly unit: string;
  readonly cost: string;
  readonly unitPrice: string;
  readonly context: string;
}

/**
 * Everything the agent did, and why.
 *
 * @remarks
 * The reasoning is emitted as structured events rather than logged as prose because it is the
 * product, not diagnostics: a judge watching the demo decides whether the agent is reasoning or
 * routing based on what is visible here. Each `decision:*` event is a point where the agent could
 * reasonably have chosen otherwise, and carries the justification for what it chose.
 */
export type TraceEvent =
  | { type: "question"; question: string; budget: string; asset: string }
  | { type: "resolving"; name: string }
  | { type: "discovered"; candidates: readonly Candidate[] }
  /**
   * The decision space, computed before the model is consulted.
   *
   * `excluded` is the important half: those options were removed by arithmetic, so they were never
   * on the menu to be talked into. This is what makes the budget a limit rather than a suggestion.
   */
  | {
      type: "policy:plans";
      affordable: readonly PlanView[];
      excluded: readonly (PlanView & { because: string })[];
      remaining: string;
    }
  | {
      type: "decision:select";
      chose: string;
      rejected: readonly { label: string; because: string }[];
      reasoning: string;
    }
  | { type: "decision:size"; units: number; unit: string; reasoning: string }
  | {
      type: "decision:authorize";
      approved: boolean;
      cost: string;
      ceiling: string;
      remaining: string;
      reasoning: string;
    }
  | { type: "quote"; endpoint: string; amount: string; asset: string; payTo: string }
  | { type: "payment"; transactionId: string; amount: string; hashscanUrl: string }
  | { type: "received"; units: number; bytes: number }
  /**
   * Rows the data source removed from a ranking, with their figures and the reason.
   *
   * Surfaced at the same weight as the excluded plan set, and for the same reason: a filter the
   * viewer cannot see reads as massaging results, while one shown with its arithmetic reads as
   * diligence. Never summarised down to a count — the numbers are the argument.
   */
  | {
      type: "data:excluded";
      rule: string;
      rows: readonly { label: string; reported: string; reason: string }[];
    }
  /**
   * The settlement leg failed upstream — the payment was signed and submitted, and the resource
   * server still would not serve. Rendered as its own state so it reads as "the payment rail is
   * having a moment", not "this product is broken".
   */
  | {
      type: "settlement:failed";
      attempted: string;
      payTo: string;
      attempts: number;
      detail: string;
    }
  /** A settlement retry was needed. Emitted so the frequency is visible rather than hidden. */
  | { type: "settlement:retry"; attempt: number; reason: string }
  | { type: "decision:assess"; verdict: Verdict; reasoning: string }
  | { type: "answer"; text: string; spent: string }
  | { type: "declined"; reason: string; spent: string }
  | { type: "error"; message: string };

export type TraceSink = (event: TraceEvent) => void;

/** Which events are arithmetic and which are the model's judgement. */
export const ACTOR: Record<TraceEvent["type"], Actor> = {
  question: "policy",
  resolving: "network",
  discovered: "network",
  "policy:plans": "policy",
  "decision:select": "judgment",
  "decision:size": "judgment",
  "decision:authorize": "judgment",
  quote: "network",
  payment: "network",
  received: "network",
  "data:excluded": "policy",
  "settlement:failed": "network",
  "settlement:retry": "network",
  "decision:assess": "judgment",
  answer: "judgment",
  declined: "judgment",
  error: "network",
};

export function collectTrace(): { sink: TraceSink; events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  return { sink: (e) => events.push(e), events };
}

/** Renders the trace the way the demo shows it. */
export function consoleTrace(write: (line: string) => void = console.log): TraceSink {
  return (event) => {
    switch (event.type) {
      case "question":
        write(`\n? ${event.question}`);
        write(`  budget ${event.budget} ${event.asset === "0.0.0" ? "HBAR" : event.asset}\n`);
        break;
      case "resolving":
        write(`→ resolving ${event.name} on ENS (Sepolia)`);
        break;
      case "discovered":
        write(`→ found ${event.candidates.length} service(s):`);
        for (const c of event.candidates) {
          write(`    ${c.label.padEnd(16)} ${c.unitPrice} per ${c.unit} — ${c.context}`);
        }
        break;
      case "policy:plans":
        write(`\n· policy — what is affordable? (arithmetic, before the model is asked)`);
        for (const p of event.affordable) {
          write(`    offer  ${p.label.padEnd(14)} ${String(p.units).padStart(3)} ${p.unit}(s)  ${p.cost}`);
        }
        for (const p of event.excluded) {
          write(`    skip   ${p.label.padEnd(14)} ${String(p.units).padStart(3)} ${p.unit}(s)  ${p.cost}  — ${p.because}`);
        }
        write(`    budget remaining ${event.remaining}`);
        break;
      case "decision:select":
        write(`\n· decision — which service?`);
        write(`    chose ${event.chose}`);
        for (const r of event.rejected) write(`    not ${r.label}: ${r.because}`);
        write(`    ${event.reasoning}`);
        break;
      case "decision:size":
        write(`\n· decision — how much to buy?`);
        write(`    ${event.units} ${event.unit}(s)`);
        write(`    ${event.reasoning}`);
        break;
      case "decision:authorize":
        write(`\n· decision — is it worth paying?`);
        write(
          `    cost ${event.cost}, self-imposed ceiling ${event.ceiling}, budget left ${event.remaining}`,
        );
        write(`    ${event.approved ? "approved" : "DECLINED"} — ${event.reasoning}`);
        break;
      case "quote":
        write(`\n→ ${event.endpoint} … HTTP 402 Payment Required`);
        write(`    ${event.amount} to ${event.payTo}`);
        break;
      case "payment":
        write(`→ paid — tx ${event.transactionId}`);
        write(`    ${event.hashscanUrl}`);
        break;
      case "received":
        write(`→ payment verified, ${event.units} unit(s) returned (${event.bytes} bytes)`);
        break;
      case "data:excluded":
        write(`\n· policy — rows excluded from the ranking (arithmetic, from the data's own figures)`);
        write(`    rule: ${event.rule}`);
        for (const r of event.rows) write(`    ✘ ${r.label.padEnd(20)} ${r.reported}  — ${r.reason}`);
        break;
      case "settlement:retry":
        write(`  ! settlement attempt ${event.attempt} did not complete — retrying (${event.reason})`);
        break;
      case "settlement:failed":
        write(`\n! settlement failed upstream after ${event.attempts} attempt(s)`);
        write(`    attempted ${event.attempted} to ${event.payTo}`);
        write(`    ${event.detail}`);
        break;
      case "decision:assess":
        write(`\n· decision — is this answer good enough?`);
        write(`    ${event.verdict} — ${event.reasoning}`);
        break;
      case "answer":
        write(`\n= ${event.text}`);
        write(`  spent ${event.spent}\n`);
        break;
      case "declined":
        write(`\n= declined: ${event.reason}`);
        write(`  spent ${event.spent}\n`);
        break;
      case "error":
        write(`! ${event.message}`);
        break;
    }
  };
}

export function planLabel(plan: Plan): string {
  return `${plan.units} ${plan.candidate.unit}(s) from ${plan.candidate.label} for ${formatAmount(
    plan.costBaseUnits,
    plan.candidate.asset,
  )}`;
}
