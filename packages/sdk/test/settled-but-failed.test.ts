import { describe, expect, it, vi } from "vitest";

import { Budget, type Candidate } from "@tollgate/discovery";

/**
 * A service that takes the payment and then fails must not be reported as a successful purchase.
 *
 * x402 settles before the resource is served, so "paid" and "got data" are separate events. The
 * agent has always checked the HTTP status after paying; this pins the same obligation on the SDK.
 */
vi.mock("@tollgate/x402-client", async (orig) => ({
  ...(await orig<typeof import("@tollgate/x402-client")>()),
  payAndFetch: vi.fn(async () => ({
    challenge: { asset: "0.0.0", amount: "3000", payTo: "0.0.999", network: "hedera:testnet" },
    status: 500,
    body: JSON.stringify({ error: "data_unavailable" }),
    transactionId: "0.0.1@1.2",
    hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.1@1.2",
  })),
}));

const { ServiceHandle } = await import("../src/index.js");

const candidate: Candidate = {
  label: "uniswap-pools", name: "uniswap-pools.tollgatehq.eth", context: "c",
  endpoint: "https://svc.example/s/uniswap-pools", unitPrice: "0.001", unit: "pool", asset: "0.0.0", schema: "{}",
};

describe("paid, then the service failed", () => {
  it("does not hand back the error body as data", async () => {
    const svc = new ServiceHandle(candidate, new Budget(2_000_000n), { accountId: "0.0.1", privateKey: "0x00" });
    await expect(svc.fetch({ limit: 3 })).rejects.toThrow();
  });
});
