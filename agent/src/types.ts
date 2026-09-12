// Candidate and Plan moved to @tollgate/discovery with the modules that produce them. Re-exported
// here so every existing `./types.js` import in the agent resolves exactly as before.
export type { Candidate, Plan } from "@tollgate/discovery";

export type Verdict = "sufficient" | "insufficient" | "unanswerable";

/** What the agent decided and why — the `why` is the part Track D is actually asking for. */
export interface Judgment<T> {
  readonly choice: T;
  readonly reasoning: string;
}
