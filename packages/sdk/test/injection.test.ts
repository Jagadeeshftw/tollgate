import { describe, expect, it } from "vitest";

import { Budget, type Candidate } from "@tollgate/discovery";
import type { PaidResponse } from "@tollgate/x402-client";
import { ServiceHandle, Tollgate } from "../src/index.js";

/**
 * The seams the agent refactor asked for: a caller must be able to supply its own catalogue, its
 * own budget, and its own purchase function, and get back enough of the wire response (challenge
 * and status) to trace what actually happened — without a real network call.
 */

const candidate: Candidate = {
  label: "uniswap-pools",
  name: "uniswap-pools.tollgatehq.eth",
  context: "Top Uniswap v3 pools by TVL",
  endpoint: "http://127.0.0.1:1/s/uniswap-pools",
  unitPrice: "0.001",
  unit: "pool",
  asset: "0.0.0",
  schema: "{pools:[]}",
};

function fakePurchase(amountTinybar: string, body: unknown = { pools: [{ id: "p1" }] }) {
  const calls: { url: string }[] = [];
  const fn = async (url: string): Promise<PaidResponse> => {
    calls.push({ url });
    return {
      challenge: { asset: "0.0.0", amount: amountTinybar, payTo: "0.0.999", network: "hedera:testnet" },
      status: 200,
      body: JSON.stringify(body),
      transactionId: "0.0.1@1.2",
      hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.1@1.2",
    };
  };
  return { fn: fn as never, calls };
}

describe("injected directory", () => {
  it("lists from the supplied directory instead of reading the chain", async () => {
    const tollgate = new Tollgate({ directory: { list: async () => [candidate] } });
    const services = await tollgate.list();
    expect(services.map((s) => s.label)).toEqual(["uniswap-pools"]);
    // No scan happened — an injected directory carries no log-recovery provenance.
    expect(tollgate.lastDiscovery).toEqual({ total: 1, fromLogs: 1, recovered: [], selfListed: [] });
  });
});

describe("injected budget", () => {
  it("shares one Budget instance across calls instead of building its own", async () => {
    const budget = new Budget(2_000_000n);
    const tollgate = new Tollgate({
      directory: { list: async () => [candidate] },
      budget,
      hedera: { accountId: "0.0.1", privateKey: "0x00" },
      purchase: fakePurchase("1000000").fn,
    });
    const svc = await tollgate.get("uniswap-pools");
    await svc.fetch({ limit: 1 });
    expect(budget.spent).toBe(1_000_000n); // the instance passed in, not a copy
    expect(tollgate.budget.spent).toBe(1_000_000n);
  });

  /**
   * This package bundles its own copy of `@tollgate/discovery` (see tsup.config.ts) — so a `Budget`
   * built against a *separately loaded* copy of that package, exactly what our own agent does, is a
   * different class reference despite identical shape. `instanceof Budget` would silently fail across
   * that boundary and try to parse the object as a decimal string instead — this regressed once
   * already, caught only once the agent actually resolved this package through its built `dist`
   * rather than its TypeScript source. A budget-shaped object, not a nominal type, must be accepted.
   */
  it("accepts a budget-shaped object that is not an instance of this package's own Budget class", async () => {
    const reserved: bigint[] = [];
    const foreignBudget = {
      limitBaseUnits: 2_000_000n,
      spent: 0n,
      get remaining() {
        return this.limitBaseUnits - this.spent;
      },
      asset: "0.0.0",
      canAfford(amount: bigint) {
        return amount <= this.remaining;
      },
      reserve(amount: bigint) {
        reserved.push(amount);
        this.spent += amount;
      },
    };
    const tollgate = new Tollgate({
      directory: { list: async () => [candidate] },
      budget: foreignBudget,
      hedera: { accountId: "0.0.1", privateKey: "0x00" },
      purchase: fakePurchase("1000000").fn,
    });
    const svc = await tollgate.get("uniswap-pools");
    await svc.fetch({ limit: 1 });
    expect(reserved).toEqual([1_000_000n]); // the foreign object's own reserve() ran, not a parse failure
    expect(foreignBudget.spent).toBe(1_000_000n);
  });
});

describe("injected purchase", () => {
  it("routes fetch() through the supplied function instead of a real x402 payment", async () => {
    const fake = fakePurchase("1000000");
    const svc = new ServiceHandle(candidate, new Budget(2_000_000n), { accountId: "0.0.1", privateKey: "0x00" }, fake.fn);

    const result = await svc.fetch({ limit: 1 });

    expect(fake.calls).toHaveLength(1);
    expect(result.status).toBe(200);
    expect(result.challenge).toEqual({ amountBaseUnits: 1_000_000n, asset: "0.0.0", payTo: "0.0.999" });
    expect(result.payment.transactionId).toBe("0.0.1@1.2");
    expect(result.data).toEqual({ pools: [{ id: "p1" }] });
    expect(result.body).toBe(JSON.stringify({ pools: [{ id: "p1" }] }));
  });
});
