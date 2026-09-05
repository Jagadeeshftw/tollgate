/**
 * The trace contract, mirrored client-side.
 *
 * These types are declared here rather than imported from `@tollgate/agent` so the static bundle
 * stays free of the agent's dependency graph (the Hedera SDK, viem) for types it only ever reads.
 * The mirror is checked against the real union at typecheck time by `web/src/trace-contract.ts`,
 * which imports both — so adding an event to the agent without handling it here fails the build
 * rather than silently rendering nothing.
 *
 * Source of truth: `agent/src/trace.ts`.
 */
export type Actor = "policy" | "judgment" | "network";

/** Mirrors `Verdict` in `agent/src/types.ts`. */
export type Verdict = "sufficient" | "insufficient" | "unanswerable";

export interface PlanView {
  readonly label: string;
  readonly units: number;
  readonly unit: string;
  readonly cost: string;
  readonly unitPrice: string;
  readonly context: string;
}

export type UiTraceEvent =
  | { type: "question"; question: string; budget: string; asset: string }
  | { type: "resolving"; name: string }
  | { type: "discovered"; candidates: readonly Candidate[] }
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
  | {
      type: "data:excluded";
      rule: string;
      rows: readonly { label: string; reported: string; reason: string }[];
    }
  | {
      type: "settlement:failed";
      attempted: string;
      payTo: string;
      attempts: number;
      detail: string;
    }
  | { type: "settlement:retry"; attempt: number; reason: string }
  | { type: "decision:assess"; verdict: Verdict; reasoning: string }
  | { type: "answer"; text: string; spent: string }
  | { type: "declined"; reason: string; spent: string }
  | { type: "error"; message: string };

export interface Candidate {
  readonly label: string;
  readonly name?: string;
  readonly unitPrice: string;
  readonly unit: string;
  readonly context: string;
  readonly endpoint?: string;
}

/** Events the UI adds locally; never produced by the agent. */
export type UiEvent =
  | UiTraceEvent
  | { type: "fatal"; message: string }
  | { type: "replay"; recordedAt?: string; note?: string };

/**
 * Who made a given move.
 *
 * The central claim of the design is that deterministic policy decides what is *permitted* and the
 * model decides what is *worth it*. That claim is only checkable if the viewer can tell which is
 * which, so nothing renders without an attribution.
 */
export const ACTOR: Record<UiTraceEvent["type"], Actor> = {
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

export const ACTOR_LABEL: Record<Actor, string> = {
  policy: "arithmetic",
  judgment: "model decided",
  network: "network",
};

/** The six states a run passes through, derived from events rather than from a timer. */
export const STAGES = ["discovered", "priced", "chose", "paying", "reading", "answering"] as const;
export type Stage = (typeof STAGES)[number];

export function stageOf(events: readonly UiEvent[]): { reached: number; done: boolean } {
  let reached = -1;
  let done = false;
  for (const e of events) {
    switch (e.type) {
      case "discovered": reached = Math.max(reached, 0); break;
      case "policy:plans": reached = Math.max(reached, 1); break;
      case "decision:select":
      case "decision:size":
      case "decision:authorize": reached = Math.max(reached, 2); break;
      case "quote":
      case "payment":
      case "settlement:retry": reached = Math.max(reached, 3); break;
      case "received":
      case "data:excluded": reached = Math.max(reached, 4); break;
      case "decision:assess": reached = Math.max(reached, 5); break;
      case "answer":
      case "declined": reached = Math.max(reached, 5); done = true; break;
      case "settlement:failed":
      case "error":
      case "fatal": done = true; break;
    }
  }
  return { reached, done };
}

/**
 * Pull the ratio out of an exclusion reason so it can carry its own column.
 *
 * The reason text is the argument and stays visible in full; the ratio is lifted out because at
 * 720p nobody divides 9.45e+10 by 5.13e+5 while reading. Returns null rather than guessing if the
 * sentence is not in the shape this expects.
 */
export function ratioFrom(reason: string): string | null {
  const m = reason.match(/([\d,.]+)\s*x\s+its\s+lifetime/i);
  return m?.[1] ? `${m[1]}×` : null;
}

/** Whether a run ended without buying anything. */
export function isDecline(events: readonly UiEvent[]): boolean {
  return events.some((e) => e.type === "declined");
}
