export type Verdict = "sufficient" | "insufficient" | "unanswerable";

/** What the agent decided and why — the `why` is the part Track D is actually asking for. */
export interface Judgment<T> {
  readonly choice: T;
  readonly reasoning: string;
}
