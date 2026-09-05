/**
 * A service listing, as published on its ENS name.
 *
 * This is the contract between Phase 2 and Phase 3: the registrar writes these records, the
 * paywall reads them. Nothing here is service configuration — every field arrives from the name.
 */
export interface Listing {
  /** ENSIP-26 `agent-context` — what the service sells, in prose. */
  readonly context: string;
  /** ENSIP-26 `agent-endpoint[web]`. */
  readonly endpoint: string;
  /** `x402:price` — price per unit, decimal USD string. */
  readonly unitPrice: string;
  /** `x402:unit` — what one unit is, e.g. "pool". */
  readonly unit: string;
  /** `x402:settlement` — Hedera account credited on settlement, e.g. "0.0.7326075". */
  readonly settlement: string;
  /** `x402:network` — CAIP-2 network id, e.g. "hedera:testnet". */
  readonly network: string;
  /** `x402:asset` — asset id; "0.0.0" is the x402 sentinel for native HBAR. */
  readonly asset: string;
  /** `x402:schema` — shape of the response body. */
  readonly schema: string;
}

/**
 * Where listings come from.
 *
 * An interface rather than a concrete import so that tests can drive the paywall without a
 * network round trip. The *demo* path is always {@link OnChainListings} — a listing is never
 * read from config or a fixture at runtime, because a marketplace whose prices come from a file
 * on the server is not a marketplace.
 */
export interface Listings {
  resolve(label: string): Promise<Listing | null>;
}

export class UnknownServiceError extends Error {
  constructor(readonly label: string) {
    super(`no service registered as "${label}"`);
    this.name = "UnknownServiceError";
  }
}

/** A listing missing any field an agent needs in order to pay is unusable, not merely incomplete. */
export class IncompleteListingError extends Error {
  constructor(
    readonly label: string,
    readonly missing: readonly string[],
  ) {
    super(`listing "${label}" is missing: ${missing.join(", ")}`);
    this.name = "IncompleteListingError";
  }
}
