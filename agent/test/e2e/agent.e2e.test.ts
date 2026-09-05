import { readFileSync } from "node:fs";
import type { Server } from "node:http";

import { startDevnet, type Devnet } from "@tollgate/devnet";
import { GraphDataSource } from "@tollgate/graph";
import { createApp, OnChainListings } from "@tollgate/service";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ask } from "../../src/agent.js";
import { Budget } from "../../src/budget.js";
import { EnsDirectory } from "../../src/directory.js";
import { ModelReasoner } from "../../src/reasoner.js";
import { collectTrace, consoleTrace, type TraceEvent } from "../../src/trace.js";

/**
 * The agent, for real: two competing services discovered from chain, a live model making the
 * calls, and actual HBAR spent on whatever it decides to buy.
 *
 * The scripted-reasoner tests assert that the loop's guard rails hold. This one asserts that the
 * reasoning *happens* — that the agent picks the narrow service for a narrow question, and the
 * broad one when the question spans protocols. Those two runs must diverge, or the selection is
 * decoration.
 */

const PARENT = "tollgate.eth";
const PORT = 8412;

function settlementAccount(): string {
  const raw = readFileSync(new URL("../../../deployments/hedera-testnet.json", import.meta.url), "utf8");
  return (JSON.parse(raw) as { settlementAccount: string }).settlementAccount;
}


const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY;
const hasModel = Boolean(
  process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY,
);
const ready = Boolean(operatorId && operatorKey && hasModel);

let devnet: Devnet;
let server: Server;

describe.skipIf(!ready)("the agent, end to end", () => {
  beforeAll(async () => {
    const base = { settlement: settlementAccount(), network: "hedera:testnet", asset: "0.0.0", unit: "pool" };
    devnet = await startDevnet({
      forkUrl: process.env.SEPOLIA_RPC_URL!,
      parentName: PARENT,
      listings: [
        {
          label: "uniswap-pools",
          listing: {
            ...base,
            context: "Top Uniswap v3 pools by TVL. Uniswap only, nothing else indexed.",
            endpoint: `http://127.0.0.1:${PORT}/s/uniswap-pools`,
            price: "0.001",
            schema: "{pools:[{id,protocol,tvlUSD}]}",
          },
        },
        {
          label: "dex-pools",
          listing: {
            ...base,
            context:
              "Pools across every indexed DEX — Uniswap, Curve, Balancer and others — under one " +
              "standardized schema. Use when the question spans protocols.",
            endpoint: `http://127.0.0.1:${PORT}/s/dex-pools`,
            price: "0.003",
            schema: "{pools:[{id,protocol,tvlUSD}]}",
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
      dataSource: new GraphDataSource(),
    });
    server = await new Promise<Server>((r) => { const s = app.listen(PORT, () => r(s)); });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (devnet) await devnet.stop();
  });

  const runAgent = async (question: string, budget: bigint) => {
    const { sink, events } = collectTrace();
    const console = consoleTrace();
    const result = await ask(question, {
      directory: new EnsDirectory({
        rpcUrl: devnet.rpcUrl,
        registrarAddress: devnet.registrarAddress,
        resolverAddress: devnet.resolverAddress,
        parentName: PARENT,
        fromBlock: devnet.deployBlock,
      }),
      reasoner: new ModelReasoner(),
      payer: { accountId: operatorId!, privateKey: operatorKey! },
      budget: new Budget(budget),
      trace: (e: TraceEvent) => { sink(e); console(e); },
    });
    return { result, events };
  };

  it("picks the narrow service for a narrow question and pays for it", async () => {
    const { result, events } = await runAgent("what are the top uniswap pools right now?", 5_000_000n);

    const select = events.find((e) => e.type === "decision:select");
    expect(select).toBeDefined();
    expect(select!.type === "decision:select" && select!.chose).toBe("uniswap-pools");
    expect(select!.type === "decision:select" && select!.reasoning.length).toBeGreaterThan(20);

    expect(result.answered).toBe(true);
    expect(result.spentBaseUnits).toBeGreaterThan(0n);
    expect(result.spentBaseUnits).toBeLessThanOrEqual(5_000_000n);
  });

  it("chooses the broader, dearer service when the question spans protocols", async () => {
    const { events } = await runAgent(
      "compare pool TVL across every DEX you can — uniswap, curve, balancer, all of them",
      20_000_000n,
    );
    const select = events.find((e) => e.type === "decision:select");
    expect(select!.type === "decision:select" && select!.chose).toBe("dex-pools");
  });

  /** An agent that always buys is not deciding. */
  it("declines rather than spending a budget that cannot buy a useful answer", async () => {
    const { result, events } = await runAgent("what are the top uniswap pools right now?", 50_000n);

    expect(result.answered).toBe(false);
    expect(result.spentBaseUnits).toBe(0n);
    expect(events.some((e) => e.type === "declined")).toBe(true);
  });
});
