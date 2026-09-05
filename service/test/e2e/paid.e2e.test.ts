import { readFileSync } from "node:fs";
import type { Server } from "node:http";

import { payAndFetch, quote } from "@tollgate/x402-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { HcsAuditLog } from "../../src/audit.js";
import type { DataSource } from "../../src/data.js";
import { OnChainListings } from "../../src/ens.js";
import { startDevnet, type Devnet } from "@tollgate/devnet";

/**
 * The full path, end to end: a price written into an ENS record by our registrar, read back off
 * chain by the service, metered, quoted as a 402, paid with real HBAR on Hedera testnet, settled
 * through Blocky402, and answered with data.
 *
 * This is Hedera Track A's stated core requirement — a platform consuming an x402-gated service
 * and completing a real paid request — and it is the only test that exercises the seams *between*
 * Phase 2 and Phase 3 rather than either side of them.
 *
 * Requires SEPOLIA_RPC_URL and Hedera credentials; skips without them rather than failing, so the
 * suite stays runnable by anyone who has cloned the repo but not provisioned accounts.
 */

const PARENT = "tollgate.eth";
const LABEL = "uniswap-pools";
/** 0.001 HBAR per pool. Written on chain by the registrar; the service never sees this constant. */
const UNIT_PRICE = "0.001";

function deployments(): { settlementAccount: string; auditTopic?: string } {
  const raw = readFileSync(new URL("../../../deployments/hedera-testnet.json", import.meta.url), "utf8");
  return JSON.parse(raw) as { settlementAccount: string; auditTopic?: string };
}

/**
 * Stands in for the Phase 4 Graph layer so the paid path has something to release.
 *
 * Test-only, and reachable only from this file — `src/` has no fallback data source, so the
 * service cannot be *run* in a state where it charges for invented data. What this proves is that
 * a settled payment releases the goods; what the goods are is Phase 4's problem.
 */
const testDataSource: DataSource = {
  name: "test-fixture",
  async fetch({ units }) {
    return { pools: Array.from({ length: Math.min(units, 3) }, (_, i) => ({ id: `pool-${i}` })) };
  },
};

const forkUrl = process.env.SEPOLIA_RPC_URL;
const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY;
const ready = Boolean(forkUrl && operatorId && operatorKey);

let devnet: Devnet;
let server: Server;
let base: string;
let payee: string;
let auditTopic: string | undefined;
let auditLog: HcsAuditLog | undefined;

describe.skipIf(!ready)("ENS-priced paid request, end to end", () => {
  beforeAll(async () => {
    const deployed = deployments();
    payee = deployed.settlementAccount;
    auditTopic = deployed.auditTopic;

    auditLog = auditTopic
      ? new HcsAuditLog(auditTopic, operatorId!, operatorKey!)
      : undefined;

    devnet = await startDevnet({
      forkUrl: forkUrl!,
      parentName: PARENT,
      listings: [
        {
          label: LABEL,
          listing: {
            context: "Top Uniswap v3 pools by TVL.",
            endpoint: "https://tollgate.example/s/uniswap-pools",
            price: UNIT_PRICE,
            unit: "pool",
            settlement: payee,
            network: "hedera:testnet",
            asset: "0.0.0",
            schema: "{pools:[{id}]}",
          },
        },
      ],
    });

    const app = createApp({
      listings: new OnChainListings({
        rpcUrl: devnet.rpcUrl,
        resolverAddress: devnet.resolverAddress,
        parentName: PARENT,
      }),
      facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
      dataSource: testDataSource,
      ...(auditLog ? { auditLog } : {}),
    });

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (devnet) await devnet.stop();
    auditLog?.close();
  });

  it("quotes a price it read from the on-chain ENS record", async () => {
    const { requirements } = await quote(`${base}/s/${LABEL}?limit=3`);

    // 3 pools x 0.001 HBAR = 0.003 HBAR = 300,000 tinybar. The service was never told this number;
    // it multiplied a string the registrar wrote into a resolver on a forked chain.
    expect(requirements.asset).toBe("0.0.0");
    expect(requirements.amount).toBe("300000");
    expect(requirements.payTo).toBe(payee);
    expect(requirements.network).toBe("hedera:testnet");
  });

  it("meters against the on-chain price", async () => {
    const one = await quote(`${base}/s/${LABEL}?limit=1`);
    const ten = await quote(`${base}/s/${LABEL}?limit=10`);

    expect(one.requirements.amount).toBe("100000");
    expect(ten.requirements.amount).toBe("1000000");
  });

  it("pays that price and receives the data", async () => {
    const result = await payAndFetch(
      `${base}/s/${LABEL}?limit=3`,
      { accountId: operatorId!, privateKey: operatorKey! },
      { maxAmount: 1_000_000n }, // 0.01 HBAR ceiling
    );

    expect(result.challenge.amount).toBe("300000");
    expect(result.challenge.payTo).toBe(payee);
    expect(result.status).toBe(200);
    expect(result.transactionId).toBeTruthy();

    const body = JSON.parse(result.body) as {
      service: string;
      units: number;
      unit: string;
      data: { pools: unknown[] };
    };
    expect(body.service).toBe(LABEL);
    expect(body.units).toBe(3);
    expect(body.unit).toBe("pool");
    expect(body.data.pools.length).toBeGreaterThan(0);

    console.log(`    settled ${result.challenge.amount} tinybar -> ${payee}`);
    console.log(`    ${result.hashscanUrl}`);
  });

  /**
   * The audit trail is written to HCS, which is a public, consensus-ordered log we cannot edit
   * after the fact. Asserted by reading the topic back from the mirror node rather than by
   * trusting that our own write succeeded.
   */
  it("records the settled payment on HCS", async () => {
    if (!auditTopic) {
      console.log("    no audit topic configured — run `pnpm hcs:topic`");
      return;
    }

    const result = await payAndFetch(
      `${base}/s/${LABEL}?limit=2`,
      { accountId: operatorId!, privateKey: operatorKey! },
      { maxAmount: 1_000_000n },
    );
    expect(result.status).toBe(200);

    // HCS submission is fire-and-forget and the mirror node lags consensus, so poll.
    const deadline = Date.now() + 45_000;
    let entry: Record<string, unknown> | undefined;
    while (Date.now() < deadline && !entry) {
      await new Promise((r) => setTimeout(r, 2_000));
      const res = await fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/topics/${auditTopic}/messages?limit=25&order=desc`,
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { messages?: { message: string }[] };
      for (const m of body.messages ?? []) {
        const decoded = JSON.parse(Buffer.from(m.message, "base64").toString()) as Record<string, unknown>;
        if (decoded.transactionId === result.transactionId) entry = decoded;
      }
    }

    expect(entry, `no HCS entry for ${result.transactionId}`).toBeDefined();
    expect(entry!.service).toBe(LABEL);
    expect(entry!.units).toBe(2);
    expect(entry!.unit).toBe("pool");
    expect(entry!.amount).toBe("200000");
    expect(entry!.asset).toBe("0.0.0");
    expect(entry!.payTo).toBe(payee);

    console.log(`    audit entry on topic ${auditTopic}: ${JSON.stringify(entry)}`);
  });

  /** A payment client that pays whatever it is asked is a liability. */
  it("refuses a quote above the caller's ceiling without signing anything", async () => {
    await expect(
      payAndFetch(
        `${base}/s/${LABEL}?limit=1000`,
        { accountId: operatorId!, privateKey: operatorKey! },
        { maxAmount: 1_000n },
      ),
    ).rejects.toThrow(/above the .* limit/);
  });
});
