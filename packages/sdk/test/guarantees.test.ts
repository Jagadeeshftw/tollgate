import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { Budget, type Candidate } from "@tollgate/agent";
import { BudgetExceededError, OverQuoteError, ServiceHandle } from "../src/index.js";

/**
 * These cover the two refusals the package actually promises. Everything else is convenience; if
 * either of these stops holding, the SDK is lying about what it enforces.
 */

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  label: "uniswap-pools",
  name: "uniswap-pools.tollgatehq.eth",
  context: "Top Uniswap v3 pools by TVL",
  endpoint: "http://127.0.0.1:1/s/uniswap-pools", // port 1: any request here fails loudly
  unitPrice: "0.001",
  unit: "pool",
  asset: "0.0.0",
  schema: "{pools:[]}",
  ...over,
});

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

/** A resource server that always demands `amount` tinybars. */
async function challengeServer(amount: string): Promise<string> {
  server = createServer((_req, res) => {
    const header = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        error: "Payment required",
        accepts: [
          {
            scheme: "exact",
            network: "hedera:testnet",
            asset: "0.0.0",
            amount,
            payTo: "0.0.99999",
            resource: "/s/uniswap-pools",
          },
        ],
      }),
    ).toString("base64");
    res.writeHead(402, { "content-type": "application/json", "payment-required": header });
    res.end(JSON.stringify({ error: "payment required" }));
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/s/uniswap-pools`;
}

describe("budget", () => {
  it("refuses a purchase that would exceed it, without contacting the service", async () => {
    // Endpoint is port 1: if the budget check did not come first, this fails with a connection
    // error instead of the assertion below — which is exactly what we want to catch.
    const budget = new Budget(1_000n); // 0.00001 HBAR
    const svc = new ServiceHandle(candidate(), budget, { accountId: "0.0.1", privateKey: "0x00" });

    await expect(svc.fetch({ limit: 10 })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(budget.spent).toBe(0n);
  });

  it("is not moved by quoting", () => {
    const budget = new Budget(10_000_000n);
    const svc = new ServiceHandle(candidate(), budget);
    const q = svc.quote({ limit: 10 });

    expect(q.costBaseUnits).toBe(1_000_000n); // 10 × 0.001 HBAR
    expect(q.affordable).toBe(true);
    expect(budget.spent).toBe(0n);
  });

  it("reports unaffordable without throwing, so a caller can choose", () => {
    const budget = new Budget(500_000n);
    const svc = new ServiceHandle(candidate(), budget);

    expect(svc.quote({ limit: 10 }).affordable).toBe(false);
    expect(svc.quote({ limit: 1 }).affordable).toBe(true);
  });
});

describe("over-quote", () => {
  it("refuses when the server asks for more than maxAmount, before signing", async () => {
    const url = await challengeServer("5000000"); // server wants 0.05 HBAR
    const budget = new Budget(10_000_000n); // budget would allow it
    const svc = new ServiceHandle(candidate({ endpoint: url }), budget, {
      accountId: "0.0.1",
      privateKey: "0x00", // never used: the refusal must happen before any signing
    });

    await expect(svc.fetch({ limit: 1, maxAmount: "0.015" })).rejects.toBeInstanceOf(OverQuoteError);
    expect(budget.spent).toBe(0n);
  });

  it("carries the numbers a caller needs to retry sensibly", async () => {
    const url = await challengeServer("5000000");
    const svc = new ServiceHandle(candidate({ endpoint: url }), new Budget(10_000_000n), {
      accountId: "0.0.1",
      privateKey: "0x00",
    });

    await expect(svc.fetch({ limit: 1, maxAmount: "0.015" })).rejects.toMatchObject({
      code: "over_quote",
      quoted: 5_000_000n,
      ceiling: 1_500_000n,
    });
  });
});
