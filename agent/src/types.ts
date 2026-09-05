/** A service the agent could buy from, as advertised on its ENS name. */
export interface Candidate {
  /** ENS label, e.g. "uniswap-pools". */
  readonly label: string;
  /** Fully qualified ENS name the listing was resolved from. */
  readonly name: string;
  /** ENSIP-26 `agent-context` — what the service sells, written for an agent to read. */
  readonly context: string;
  /** Base URL of the x402-gated endpoint. */
  readonly endpoint: string;
  /** Price per unit, decimal string in the asset's display units. */
  readonly unitPrice: string;
  /** What one unit is, e.g. "pool". */
  readonly unit: string;
  /** Asset id; "0.0.0" is native HBAR. */
  readonly asset: string;
  /** Shape of the response body. */
  readonly schema: string;
}

/** A concrete thing the agent could do, with a price attached. */
export interface Plan {
  readonly candidate: Candidate;
  readonly units: number;
  /** Cost in the asset's smallest denomination (tinybars for HBAR). */
  readonly costBaseUnits: bigint;
}

export type Verdict = "sufficient" | "insufficient" | "unanswerable";

/** What the agent decided and why — the `why` is the part Track D is actually asking for. */
export interface Judgment<T> {
  readonly choice: T;
  readonly reasoning: string;
}
