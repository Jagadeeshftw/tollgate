/**
 * The demo: one question, end to end.
 *
 *   pnpm --filter @tollgate/agent demo "what are the top uniswap pools right now?"
 *
 * Spins up everything the flow needs — a forked Sepolia with two competing services listed
 * through the real registrar, and the x402-gated service reading their prices off ENS — then hands
 * the agent a budget and a question and gets out of the way.
 *
 * Two services, not one, because "which service?" is only a decision when there is something to
 * decide between. One is cheap and narrow, the other broader and three times the price; which is
 * correct depends entirely on what is asked.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";

import { freePort, listenOrFail, startDevnet } from "@tollgate/devnet";
import { GraphDataSource } from "@tollgate/graph";
import { createApp, HcsAuditLog } from "@tollgate/service";

import { ask } from "./agent.js";
import { Budget } from "./budget.js";
import { EnsDirectory } from "./directory.js";
import { MissingModelCredentialsError } from "./model.js";
import { ModelReasoner } from "./reasoner.js";
import { collectTrace, consoleTrace, type TraceEvent } from "./trace.js";

const PARENT = "tollgate.eth";
const QUESTION = process.argv.slice(2).join(" ") || "what are the top uniswap pools right now?";
/** 0.05 HBAR. Small enough that the agent must actually choose. */
const BUDGET = 5_000_000n;

function settlementAccount(): string {
  const raw = readFileSync(new URL("../../deployments/hedera-testnet.json", import.meta.url), "utf8");
  return (JSON.parse(raw) as { settlementAccount: string }).settlementAccount;
}


async function main() {
  const forkUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) throw new Error("HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY unset");

  const payee = settlementAccount();
  const base = {
    settlement: payee,
    network: "hedera:testnet",
    asset: "0.0.0",
    unit: "pool",
  };

  // Port chosen before the listings are written, since each listing publishes its own endpoint URL.
  const servicePort = await freePort();
  console.log("starting forked Sepolia and listing services…");
  const devnet = await startDevnet({
    forkUrl,
    parentName: PARENT,
    listings: [
      {
        label: "uniswap-pools",
        listing: {
          ...base,
          context: "Top Uniswap v3 pools by TVL. Uniswap only, nothing else indexed.",
          endpoint: `http://127.0.0.1:${servicePort}/s/uniswap-pools`,
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
          endpoint: `http://127.0.0.1:${servicePort}/s/dex-pools`,
          price: "0.003",
          schema: "{pools:[{id,protocol,tvlUSD}]}",
        },
      },
    ],
  });

  const auditTopic = process.env.HCS_AUDIT_TOPIC_ID;
  const reasoner = new ModelReasoner();
  console.log(`reasoning with ${reasoner.provider}`);

  const servers: Server[] = [];
  try {
    const app = createApp({
      listings: new (await import("@tollgate/service")).OnChainListings({
        rpcUrl: devnet.rpcUrl,
        resolverAddress: devnet.resolverAddress,
        parentName: PARENT,
      }),
      facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
      dataSource: new GraphDataSource(),
      // The agent's purchases belong on the audit trail like any other settled payment.
      ...(auditTopic ? { auditLog: new HcsAuditLog(auditTopic, operatorId, operatorKey) } : {}),
    });
    servers.push(await listenOrFail(app, servicePort, "the tollgate service"));

    // Set TOLLGATE_TRACE_OUT to archive a run. Traces are evidence: some runs — a refusal on
    // non-authoritative data, say — depend on conditions that will not exist later, and there is
    // no honest way to stage one after the fact.
    const archive = process.env.TOLLGATE_TRACE_OUT;
    const collected = collectTrace();
    const show = consoleTrace();
    const trace = (e: TraceEvent) => {
      collected.sink(e);
      show(e);
    };

    const result = await ask(QUESTION, {
      directory: new EnsDirectory({
        rpcUrl: devnet.rpcUrl,
        registrarAddress: devnet.registrarAddress,
        resolverAddress: devnet.resolverAddress,
        parentName: PARENT,
        fromBlock: devnet.deployBlock,
      }),
      reasoner: reasoner,
      payer: { accountId: operatorId, privateKey: operatorKey },
      budget: new Budget(BUDGET),
      trace,
    });

    if (archive) {
      writeFileSync(
        archive,
        `${JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            question: QUESTION,
            provider: reasoner.provider,
            note:
              "Real run against live infrastructure: forked Sepolia, real ENS records, real HBAR " +
              "settled on Hedera testnet, live data from The Graph.",
            answered: result.answered,
            spentTinybar: result.spentBaseUnits.toString(),
            purchases: result.purchases,
            events: collected.events,
          },
          null,
          2,
        )}\n`,
      );
      console.log(`\ntrace archived to ${archive}`);
    }

    process.exitCode = result.answered ? 0 : 0; // declining is a valid outcome, not a failure
  } finally {
    for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
    await devnet.stop();
  }
}

void main().catch((err) => {
  if (err instanceof MissingModelCredentialsError) {
    console.error(`\n${err.message}\n`);
  } else {
    console.error(`demo failed: ${(err as Error)?.message ?? err}`);
  }
  process.exitCode = 1;
});
