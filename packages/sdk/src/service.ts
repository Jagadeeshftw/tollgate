import { Budget, priceOf, toBaseUnits, type Candidate } from "@tollgate/discovery";
import {
  PriceRejectedError,
  SettlementFailedError as ClientSettlementFailedError,
  payAndFetch,
  quote as readChallenge,
} from "@tollgate/x402-client";

import { HBAR } from "./defaults.js";
import {
  BudgetExceededError,
  NoPayerError,
  ServiceFailedAfterPaymentError,
  OverQuoteError,
  SettlementFailedError,
  UnpriceableServiceError,
} from "./errors.js";
import type { HederaPayer } from "./tollgate.js";

export interface Quote {
  readonly label: string;
  readonly units: number;
  readonly unit: string;
  readonly unitPrice: string;
  readonly asset: string;
  /** Total cost in the asset's smallest denomination — tinybars for HBAR. */
  readonly costBaseUnits: bigint;
  /** Whether the remaining budget covers it. Arithmetic, not advice. */
  readonly affordable: boolean;
  readonly endpoint: string;
}

export interface PaidResult<T = unknown> {
  readonly data: T;
  readonly units: number;
  readonly payment: {
    readonly amountBaseUnits: bigint;
    readonly transactionId: string;
    readonly hashscanUrl: string;
    readonly payTo: string;
  };
  readonly budget: { readonly spent: bigint; readonly remaining: bigint };
}

/** One listed service, with its terms as the chain currently states them. */
export class ServiceHandle {
  constructor(
    readonly candidate: Candidate,
    private readonly budget: Budget,
    private readonly payer?: HederaPayer,
  ) {}

  get label(): string {
    return this.candidate.label;
  }
  /** ENSIP-26 `agent-context` — what this service sells, written to be read by an agent. */
  get context(): string {
    return this.candidate.context;
  }
  get name(): string {
    return this.candidate.name;
  }
  get endpoint(): string {
    return this.candidate.endpoint;
  }
  get unit(): string {
    return this.candidate.unit;
  }
  get unitPrice(): string {
    return this.candidate.unitPrice;
  }
  get asset(): string {
    return this.candidate.asset;
  }
  get schema(): string {
    return this.candidate.schema;
  }

  /**
   * Price a request without making one.
   *
   * Computed from the ENS records alone — **no network call to the service, and nothing spent.**
   * A caller must be able to decide whether something is worth buying before it buys it.
   */
  quote({ limit = 1 }: { limit?: number } = {}): Quote {
    let costBaseUnits: bigint;
    try {
      costBaseUnits = priceOf(this.candidate, limit).costBaseUnits;
    } catch (err) {
      throw new UnpriceableServiceError(this.label, (err as Error)?.message ?? String(err));
    }
    return {
      label: this.label,
      units: limit,
      unit: this.candidate.unit,
      unitPrice: this.candidate.unitPrice,
      asset: this.candidate.asset,
      costBaseUnits,
      affordable: this.budget.canAfford(costBaseUnits),
      endpoint: this.candidate.endpoint,
    };
  }

  /**
   * Read the server's live 402 challenge without paying it.
   *
   * `quote()` is the ENS price; this is what the server is actually asking right now. They should
   * agree — a divergence means the operator repriced between the record and the request, and the
   * server's number is the one that will be charged.
   */
  async challenge({ limit = 1 }: { limit?: number } = {}): Promise<{ amountBaseUnits: bigint; payTo: string; asset: string }> {
    const { requirements } = await readChallenge(this.url(limit));
    return {
      amountBaseUnits: BigInt(requirements?.amount ?? "0"),
      payTo: requirements?.payTo ?? "",
      asset: requirements?.asset ?? this.candidate.asset,
    };
  }

  /**
   * Buy the data.
   *
   * Two ceilings apply and they are different things. `maxAmount` is what *this call* is willing to
   * pay and is checked against the server's quote before anything is signed. The instance budget is
   * what *every call together* may spend, and it is checked first — a purchase that would breach it
   * is refused without contacting the service at all.
   */
  async fetch<T = unknown>({
    limit = 1,
    maxAmount,
    settlementRetries,
    onRetry,
  }: {
    limit?: number;
    /** Decimal string in the asset's display units, e.g. "0.015" HBAR. */
    maxAmount?: string;
    settlementRetries?: number;
    onRetry?: (info: { attempt: number; status: number; reason: string }) => void;
  } = {}): Promise<PaidResult<T>> {
    // Budget before payer, deliberately. The budget is arithmetic over records already read, so it
    // gives the same answer whether or not a wallet is configured — a refusal that changes shape
    // depending on your credentials is harder to reason about than one that does not. Both are
    // checked before any request reaches the service.
    const priced = this.quote({ limit });
    if (!this.budget.canAfford(priced.costBaseUnits)) {
      throw new BudgetExceededError(priced.costBaseUnits, this.budget.remaining, priced.asset);
    }
    if (!this.payer) throw new NoPayerError(this.label);

    // The same converter discovery prices with. A second implementation here once truncated past the
    // asset's precision where this one refuses, and accepted input this one rejects.
    const ceiling = maxAmount === undefined ? undefined : toBaseUnits(maxAmount, priced.asset);

    let response;
    try {
      response = await payAndFetch(
        this.url(limit),
        { accountId: this.payer.accountId, privateKey: this.payer.privateKey, ...(this.payer.network ? { network: this.payer.network } : {}) },
        {
          ...(ceiling !== undefined ? { maxAmount: ceiling } : {}),
          ...(settlementRetries !== undefined ? { settlementRetries } : {}),
          ...(onRetry ? { onRetry } : {}),
        },
      );
    } catch (err) {
      // Re-map the client's errors into this package's taxonomy so a caller has one vocabulary.
      if (err instanceof PriceRejectedError) {
        throw new OverQuoteError(BigInt(err.quoted), ceiling ?? 0n, priced.asset);
      }
      if (err instanceof ClientSettlementFailedError) {
        throw new SettlementFailedError(
          BigInt(err.attempt.amount || "0"),
          err.attempt.payTo,
          err.message,
          // The client cannot prove either way; neither can we. Say so rather than guess.
          undefined,
        );
      }
      throw err;
    }

    const paid = BigInt(response.challenge.amount);
    if (response.status < 200 || response.status >= 300) {
      // Settled, then failed. The money moved if the server reported a transaction, so the budget
      // carries it; the failure body is surfaced as an error, never handed back as data.
      if (response.transactionId && this.budget.canAfford(paid)) this.budget.reserve(paid);
      throw new ServiceFailedAfterPaymentError(response.status, paid, response.transactionId, response.body);
    }
    // Reserve what was actually charged, not what was quoted — an operator may have repriced.
    this.budget.reserve(paid);

    let data: T;
    try {
      data = JSON.parse(response.body) as T;
    } catch {
      data = response.body as unknown as T;
    }

    return {
      data,
      units: limit,
      payment: {
        amountBaseUnits: paid,
        transactionId: response.transactionId,
        hashscanUrl: response.hashscanUrl,
        payTo: response.challenge.payTo,
      },
      budget: { spent: this.budget.spent, remaining: this.budget.remaining },
    };
  }

  /** Same construction as the agent's: `limit` is set, so an endpoint that already carries one is not doubled. */
  private url(limit: number): string {
    const url = new URL(this.candidate.endpoint);
    url.searchParams.set("limit", String(limit));
    return url.toString();
  }
}
