/**
 * The failure taxonomy.
 *
 * @remarks
 * A caller has to be able to tell these apart to respond sensibly: an over-quote is worth retrying
 * with a higher ceiling, a budget breach is not; a settlement failure may have moved money, a
 * catalogue outage certainly has not. Collapsing them into one `Error` pushes that discrimination
 * onto string matching, which breaks the first time a message is reworded.
 */
export abstract class TollgateError extends Error {
  /** Stable, machine-readable. Message text may change; this may not. */
  abstract readonly code: string;
}

/** The catalogue could not be read. Nothing was spent. */
export class CatalogueUnavailableError extends TollgateError {
  readonly code = "catalogue_unavailable";
  constructor(override readonly cause: string) {
    super(`could not read the catalogue from ENS: ${cause}`);
    this.name = "CatalogueUnavailableError";
  }
}

/**
 * No live listing under that name.
 *
 * Covers "never listed", "revoked" and "expired" alike: all three mean the chain does not currently
 * back a service by that name, and the SDK deliberately does not guess which.
 */
export class ServiceNotFoundError extends TollgateError {
  readonly code = "service_not_found";
  constructor(
    readonly label: string,
    readonly available: readonly string[],
  ) {
    super(
      `no live listing for "${label}"` +
        (available.length ? ` — currently listed: ${available.join(", ")}` : " — the catalogue is empty"),
    );
    this.name = "ServiceNotFoundError";
  }
}

/** The purchase would exceed the budget. Arithmetic, and not arguable. Nothing was spent. */
export class BudgetExceededError extends TollgateError {
  readonly code = "budget_exceeded";
  constructor(
    readonly requested: bigint,
    readonly remaining: bigint,
    readonly asset: string,
  ) {
    super(`purchase of ${requested} exceeds the remaining budget of ${remaining}`);
    this.name = "BudgetExceededError";
  }
}

/** The server asked for more than `maxAmount`. Refused before anything was signed. */
export class OverQuoteError extends TollgateError {
  readonly code = "over_quote";
  constructor(
    readonly quoted: bigint,
    readonly ceiling: bigint,
    readonly asset: string,
  ) {
    super(`server quoted ${quoted}, above the stated ceiling of ${ceiling}`);
    this.name = "OverQuoteError";
  }
}

/** `fetch()` was called on an instance constructed without a Hedera payer. Nothing was spent. */
export class NoPayerError extends TollgateError {
  readonly code = "no_payer";
  constructor(readonly label: string) {
    super(
      `cannot buy from "${label}": no Hedera payer configured — construct Tollgate with ` +
        `{ hedera: { accountId, privateKey } }`,
    );
    this.name = "NoPayerError";
  }
}

/** A listing whose records cannot be turned into a price — malformed, or missing a unit price. */
export class UnpriceableServiceError extends TollgateError {
  readonly code = "unpriceable_service";
  constructor(
    readonly label: string,
    readonly reason: string,
  ) {
    super(`cannot price "${label}": ${reason}`);
    this.name = "UnpriceableServiceError";
  }
}

/**
 * The payment was signed and submitted, and the resource server still would not serve.
 *
 * **Whether money moved is a heuristic, not a protocol guarantee.** x402 has no settlement receipt
 * a client can rely on: the transaction may have reached consensus while the response was lost, and
 * the client cannot tell that apart from a payment that never landed. `paid` is this SDK's best
 * inference from what the server returned — treat it as a strong hint and reconcile against the
 * chain (or the HCS audit topic) before assuming either way. We filed this gap upstream; until the
 * spec closes it, no client can do better honestly.
 */
export class SettlementFailedError extends TollgateError {
  readonly code = "settlement_failed";
  constructor(
    readonly attempted: bigint,
    readonly payTo: string,
    readonly detail: string,
    /** Best inference, not proof. `undefined` means genuinely unknown. */
    readonly paid: boolean | undefined,
  ) {
    super(
      `settlement failed upstream after attempting ${attempted} to ${payTo}: ${detail}` +
        (paid === undefined ? " (whether the transfer landed is unknown)" : ""),
    );
    this.name = "SettlementFailedError";
  }
}
