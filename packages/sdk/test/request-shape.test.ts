import { describe, expect, it, vi } from "vitest";

import { Budget, type Candidate } from "@tollgate/discovery";

const paid = vi.fn(async (url: string, _p: unknown, _o: { maxAmount?: bigint } = {}) => ({
  challenge: { asset: "0.0.0", amount: "3000", payTo: "0.0.999", network: "hedera:testnet" },
  status: 200, body: JSON.stringify({ ok: true, url }), transactionId: "0.0.1@1.2",
  hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.1@1.2",
}));
vi.mock("@tollgate/x402-client", async (orig) => ({ ...(await orig<typeof import("@tollgate/x402-client")>()), payAndFetch: paid }));
const { ServiceHandle } = await import("../src/index.js");

const cand = (endpoint: string): Candidate => ({
  label: "svc", name: "svc.tollgatehq.eth", context: "c", endpoint, unitPrice: "0.001", unit: "pool", asset: "0.0.0", schema: "{}",
});
const payer = { accountId: "0.0.1", privateKey: "0x00" };

describe("the request the SDK sends", () => {
  it("sets limit rather than appending a second one", async () => {
    await new ServiceHandle(cand("https://svc.example/s/x?limit=5"), new Budget(2_000_000n), payer).fetch({ limit: 3 });
    const sent = new URL(paid.mock.calls.at(-1)![0]);
    expect(sent.searchParams.getAll("limit")).toEqual(["3"]);
  });

  it("refuses a maxAmount finer than the asset's precision rather than silently truncating it", async () => {
    const svc = new ServiceHandle(cand("https://svc.example/s/x"), new Budget(2_000_000n), payer);
    await expect(svc.fetch({ limit: 1, maxAmount: "0.123456789" })).rejects.toThrow(/decimals/);
  });

  it("refuses a malformed maxAmount with a reason, not a bare SyntaxError", async () => {
    const svc = new ServiceHandle(cand("https://svc.example/s/x"), new Budget(2_000_000n), payer);
    await expect(svc.fetch({ limit: 1, maxAmount: "abc" })).rejects.toThrow(/malformed/);
  });
});
