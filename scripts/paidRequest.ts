/**
 * Gate 1c — prove that money actually moves.
 *
 * Stands up a trivially gated endpoint, pays it once from the operator account through the
 * Blocky402 facilitator, and returns the settled Hedera transaction id.
 *
 * Deliberately minimal, and deliberately separate from `service/`: this answers one question —
 * *does an x402 payment on Hedera settle for us at all* — and nothing about ENS, pricing, metering
 * or The Graph is allowed to participate. If this fails, it is the payment rail that is broken,
 * with no other suspect in the frame.
 */
import { readFileSync } from "node:fs";
import type { Server } from "node:http";

import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { paymentMiddleware } from "@x402/express";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme as ExactHederaClient } from "@x402/hedera/exact/client";
import { ExactHederaScheme as ExactHederaServer } from "@x402/hedera/exact/server";
import express from "express";

const NETWORK = "hedera:testnet";
/** 0.001 HBAR, in tinybars. Small enough to run repeatedly, large enough to be a real transfer. */
const PRICE_TINYBAR = "100000";
const PAID_BODY = "gate-1c-paid-ok";

export interface PaidRequestResult {
  readonly unpaidStatus: number;
  readonly paidStatus: number;
  readonly body: string;
  readonly transactionId: string;
  readonly payer: string;
  readonly payee: string;
  readonly amountTinybar: string;
  readonly hashscanUrl: string;
}

export function settlementAccount(): string {
  const raw = readFileSync("deployments/hedera-testnet.json", "utf8");
  const { settlementAccount: account } = JSON.parse(raw) as { settlementAccount?: string };
  if (!account) throw new Error("deployments/hedera-testnet.json has no settlementAccount");
  return account;
}

/** The gated endpoint. One route, flat price, hardcoded body. */
function gatedServer(facilitatorUrl: string, payTo: string) {
  const app = express();
  const server = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: facilitatorUrl }),
  ).register(NETWORK, new ExactHederaServer());

  app.use(
    paymentMiddleware(
      {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            payTo,
            // An explicit AssetAmount, not a money string — a money string would be converted into
            // the network's default asset (USDC) rather than the HBAR we intend. See FEEDBACK/HEDERA.md.
            price: { asset: "0.0.0", amount: PRICE_TINYBAR },
            maxTimeoutSeconds: 300,
          },
        ],
      },
      server,
    ),
  );
  app.get("/paid", (_req, res) => res.type("text/plain").send(PAID_BODY));
  return app;
}

export async function runPaidRequest(options: {
  operatorId: string;
  operatorKey: string;
  facilitatorUrl: string;
  payTo: string;
}): Promise<PaidRequestResult> {
  const app = gatedServer(options.facilitatorUrl, options.payTo);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind a port");
    const url = `http://127.0.0.1:${address.port}/paid`;

    // 1. Unpaid — expect the challenge.
    const unpaid = await fetch(url);
    if (unpaid.status !== 402) {
      throw new Error(`expected 402 without payment, got ${unpaid.status}`);
    }
    const challengeHeader = unpaid.headers.get("payment-required");
    if (!challengeHeader) throw new Error("402 carried no PAYMENT-REQUIRED header");

    const challenge = decodePaymentRequiredHeader(challengeHeader);
    const requirements = challenge.accepts?.[0] as PaymentRequirements | undefined;
    if (!requirements) throw new Error("challenge offered no payment requirements");

    // 2. Sign a payment against those requirements.
    const signer = createClientHederaSigner(
      options.operatorId,
      PrivateKey.fromStringECDSA(options.operatorKey),
      { network: NETWORK },
    );
    const signed = await new ExactHederaClient(signer).createPaymentPayload(
      challenge.x402Version,
      requirements,
    );

    // `accepted` echoes back the exact requirements this payment answers, so the resource server
    // can confirm the client paid against the challenge it actually issued rather than a stale one.
    // Scheme and network live inside `accepted`, not alongside it — the Blocky402 quickstart
    // shows them as sibling fields, which the v2 `PaymentPayload` type does not have.
    const payload: PaymentPayload = {
      x402Version: challenge.x402Version,
      accepted: requirements,
      payload: signed.payload,
    };

    // 3. Retry with the payment attached.
    const paid = await fetch(url, {
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
    });
    const body = await paid.text();
    if (paid.status !== 200) {
      throw new Error(`paid request returned ${paid.status}: ${body.slice(0, 200)}`);
    }

    // 4. The settlement receipt comes back on the response.
    const responseHeader = paid.headers.get("payment-response");
    let transactionId = "";
    if (responseHeader) {
      const { decodePaymentResponseHeader } = await import("@x402/core/http");
      transactionId = decodePaymentResponseHeader(responseHeader).transaction ?? "";
    }
    if (!transactionId) throw new Error("settled response carried no transaction id");

    return {
      unpaidStatus: unpaid.status,
      paidStatus: paid.status,
      body,
      transactionId,
      payer: options.operatorId,
      payee: options.payTo,
      amountTinybar: String(requirements.amount ?? PRICE_TINYBAR),
      hashscanUrl: `https://hashscan.io/testnet/transaction/${transactionId}`,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
