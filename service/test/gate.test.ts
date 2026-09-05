import type { Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { Listing } from "../src/listing.js";
import { InMemoryListings, UNISWAP_POOLS } from "./inMemoryListings.js";

/** A listing whose operator has left the settlement account unset. */
const BROKEN: Listing = { ...UNISWAP_POOLS, settlement: "" };

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createApp({
    listings: new InMemoryListings({ "uniswap-pools": UNISWAP_POOLS, broken: BROKEN }),
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
  });

  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("the 402 gate", () => {
  it("refuses an unpaid request", async () => {
    const res = await fetch(`${base}/s/uniswap-pools`);
    expect(res.status).toBe(402);
  });

  it("quotes the price from the ENS record, not from config", async () => {
    const res = await fetch(`${base}/s/uniswap-pools`);
    const body = (await res.json()) as { quote: { unitPrice: string; total: string } };

    // 0.001 per pool is what the listing publishes; nothing in the service knows this number.
    expect(body.quote.unitPrice).toBe("0.001");
    expect(body.quote.total).toBe("0.001");
  });

  it("names the settlement account from the record", async () => {
    const res = await fetch(`${base}/s/uniswap-pools`);
    const body = (await res.json()) as { settlement: { account: string; network: string } };

    expect(body.settlement.account).toBe("0.0.7326075");
    expect(body.settlement.network).toBe("hedera:testnet");
  });

  /** The distinction Hedera draws between metered and flat-rate pricing. */
  it("meters: fifty pools cost fifty times one pool", async () => {
    const one = await (await fetch(`${base}/s/uniswap-pools?limit=1`)).json();
    const fifty = await (await fetch(`${base}/s/uniswap-pools?limit=50`)).json();

    expect((one as { quote: { total: string } }).quote.total).toBe("0.001");
    expect((fifty as { quote: { total: string } }).quote.total).toBe("0.05");
    expect((fifty as { quote: { units: number } }).quote.units).toBe(50);
  });

  /**
   * The header is the part a paying agent actually reads, so assert against it rather than
   * against our own advisory JSON body.
   */
  it("emits an x402 challenge in the asset the listing names", async () => {
    const res = await fetch(`${base}/s/uniswap-pools?limit=50`);
    expect(res.status).toBe(402);

    const header = res.headers.get("payment-required");
    expect(header).toBeTruthy();

    const challenge = JSON.parse(Buffer.from(header!, "base64").toString()) as {
      x402Version: number;
      accepts: {
        scheme: string;
        network: string;
        asset: string;
        amount: string;
        payTo: string;
        extra?: { feePayer?: string };
      }[];
    };

    expect(challenge.x402Version).toBe(2);
    const [accept] = challenge.accepts;
    expect(accept!.scheme).toBe("exact");
    expect(accept!.network).toBe("hedera:testnet");

    // HBAR, because that is what the ENS record publishes. Before the asset fix this silently
    // came back as 0.0.429274 (USDC), which is a different asset at a different scale.
    expect(accept!.asset).toBe("0.0.0");

    // 50 pools x 0.001 HBAR = 0.05 HBAR = 5,000,000 tinybars.
    expect(accept!.amount).toBe("5000000");

    expect(accept!.payTo).toBe("0.0.7326075");
    expect(accept!.extra?.feePayer).toBeTruthy(); // injected by the facilitator
  });

  it("returns 404 for a name that resolves to nothing", async () => {
    const res = await fetch(`${base}/s/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("unknown_service");
  });

  it("rejects a nonsense meter before quoting a price", async () => {
    const res = await fetch(`${base}/s/uniswap-pools?limit=-3`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_units");
  });
});

describe("the free quote endpoint", () => {
  it("lets an agent read the terms without paying", async () => {
    const res = await fetch(`${base}/s/uniswap-pools/quote?limit=10`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      quote: { total: string; unit: string };
      settlement: { account: string };
    };
    expect(body.quote.total).toBe("0.01");
    expect(body.quote.unit).toBe("pool");
    expect(body.settlement.account).toBe("0.0.7326075");
  });
});
