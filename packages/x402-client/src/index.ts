/**
 * The paying half of x402 on Hedera.
 *
 * Used by the Gate 1c probe, the service's end-to-end tests, and (in Phase 5) the consumer agent.
 * It is deliberately a plain `fetch` wrapper rather than anything agent-shaped: deciding *whether*
 * to pay is the agent's judgement and belongs there, while executing a payment correctly is
 * mechanical and belongs here exactly once.
 */
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

export interface PayerConfig {
  readonly accountId: string;
  /** ECDSA (secp256k1). An ED25519 key parses here and then signs for no account — see gates 1b. */
  readonly privateKey: string;
  readonly network?: string;
}

export interface PaidResponse {
  /** The 402 the server issued before payment. */
  readonly challenge: {
    readonly asset: string;
    readonly amount: string;
    readonly payTo: string;
    readonly network: string;
  };
  readonly status: number;
  readonly body: string;
  /** Hedera transaction id of the settled payment, if the server reported one. */
  readonly transactionId: string;
  readonly hashscanUrl: string;
}

export class NotPaymentRequiredError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`expected 402 Payment Required, got ${status}`);
    this.name = "NotPaymentRequiredError";
  }
}

/**
 * The payment was signed and submitted, and the resource server still would not serve.
 *
 * @remarks
 * Distinct from every other failure on purpose. A second 402 in response to a request that
 * carried a valid signature means the *settlement* leg failed — the facilitator could not verify
 * or submit — and that is upstream of us. Observed in the wild: a request that failed this way
 * succeeded unchanged moments later, same account, same amount.
 *
 * Reporting it as a generic error would make our payment layer look broken to anyone running the
 * demo, which is both misleading and the wrong place to start debugging.
 */
export class SettlementFailedError extends Error {
  constructor(
    readonly attempt: { asset: string; amount: string; payTo: string; network: string },
    readonly status: number,
    readonly body: string,
    readonly attempts: number,
  ) {
    super(
      `settlement did not complete after ${attempts} attempt(s): the facilitator accepted the ` +
        `request but the resource server still returned ${status}. ` +
        `Attempted ${attempt.amount} of ${attempt.asset} to ${attempt.payTo} on ${attempt.network}. ` +
        `This is the settlement path upstream of the client, not a pricing or signing failure.`,
    );
    this.name = "SettlementFailedError";
  }
}

export class PriceRejectedError extends Error {
  constructor(readonly quoted: string, readonly limit: string, readonly asset: string) {
    super(`quoted ${quoted} of ${asset}, above the ${limit} limit`);
    this.name = "PriceRejectedError";
  }
}

/** Read the 402 challenge for a resource without paying it. */
export async function quote(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (res.status !== 402) throw new NotPaymentRequiredError(res.status, await res.text());

  const header = res.headers.get("payment-required");
  if (!header) throw new Error("402 carried no PAYMENT-REQUIRED header");

  const decoded = decodePaymentRequiredHeader(header);
  const requirements = decoded.accepts?.[0] as PaymentRequirements | undefined;
  if (!requirements) throw new Error("challenge offered no payment requirements");

  return { x402Version: decoded.x402Version, requirements, advisory: await res.json().catch(() => null) };
}

/**
 * Fetch a resource, paying its 402 challenge.
 *
 * @param maxAmount - Optional ceiling in the asset's base units. A payment client that will pay
 *   whatever it is asked is a liability; the caller states what it is willing to spend and an
 *   over-quote is refused before anything is signed.
 */
export async function payAndFetch(
  url: string,
  payer: PayerConfig,
  options: {
    init?: RequestInit;
    maxAmount?: bigint;
    /**
     * Retries of the *settlement* leg only — never of pricing or signing.
     *
     * Defaults to 0. A retry that happens silently hides how often the settlement path fails,
     * which is exactly the number worth knowing, so callers opt in and are told when one was
     * used via `onRetry`.
     */
    settlementRetries?: number;
    onRetry?: (info: { attempt: number; status: number; reason: string }) => void;
  } = {},
): Promise<PaidResponse> {
  const network = payer.network ?? "hedera:testnet";
  const { x402Version, requirements } = await quote(url, options.init);

  const amount = BigInt(requirements.amount ?? "0");
  if (options.maxAmount !== undefined && amount > options.maxAmount) {
    throw new PriceRejectedError(amount.toString(), options.maxAmount.toString(), requirements.asset ?? "");
  }

  const signer = createClientHederaSigner(payer.accountId, PrivateKey.fromStringECDSA(payer.privateKey), {
    network,
  });
  const scheme = new ExactHederaScheme(signer);

  const attemptDetails = {
    asset: requirements.asset ?? "",
    amount: amount.toString(),
    payTo: requirements.payTo ?? "",
    network: requirements.network ?? network,
  };

  const maxAttempts = 1 + Math.max(0, options.settlementRetries ?? 0);
  let res!: Response;
  let body = "";
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    // Re-signed each attempt: a Hedera transaction carries its own id and validity window, so
    // replaying the previous payload would be rejected as a duplicate rather than retried.
    const signed = await scheme.createPaymentPayload(x402Version, requirements);
    const payload: PaymentPayload = { x402Version, accepted: requirements, payload: signed.payload };

    res = await fetch(url, {
      ...options.init,
      headers: { ...(options.init?.headers ?? {}), "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
    });
    body = await res.text();

    // A second 402 means the payment did not settle. Anything else is the server's own answer.
    if (res.status !== 402) break;

    if (attempt < maxAttempts) {
      options.onRetry?.({
        attempt,
        status: res.status,
        reason: "settlement did not complete; the facilitator did not confirm the payment",
      });
    }
  }

  if (res.status === 402) {
    throw new SettlementFailedError(attemptDetails, res.status, body, attempt);
  }

  const responseHeader = res.headers.get("payment-response");
  const transactionId = responseHeader ? (decodePaymentResponseHeader(responseHeader).transaction ?? "") : "";

  return {
    challenge: {
      asset: requirements.asset ?? "",
      amount: amount.toString(),
      payTo: requirements.payTo ?? "",
      network: requirements.network ?? network,
    },
    status: res.status,
    body,
    transactionId,
    hashscanUrl: transactionId ? `https://hashscan.io/testnet/transaction/${transactionId}` : "",
  };
}
