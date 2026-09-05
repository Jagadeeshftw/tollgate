/**
 * Demo surface: the agent's reasoning, streamed.
 *
 *   pnpm --filter @tollgate/web dev      then open http://127.0.0.1:8500
 *
 * Three modes, set by `TOLLGATE_MODE`.
 *
 * **`live`** (the hosted deployment). Drives the agent against the *real* Sepolia registry and the
 * *real* deployed service — no fork, nothing local. A visitor's question resolves the same
 * listings they can check on Etherscan and pays the same endpoint they can curl. Capped hard, so
 * one visitor cannot drain the day: see `limits.ts`.
 *
 * **`devnet`** (local development). Forks Sepolia, lists services through the real registrar, and
 * runs its own service instance against the fork. Unbounded, because it is your own machine.
 *
 * **`replay`**. Archived runs only. No payments, no model.
 */
import { readdirSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ask,
  Budget,
  EnsDirectory,
  MissingModelCredentialsError,
  ModelReasoner,
  type TraceEvent,
} from "@tollgate/agent";
import { freePort, listenOrFail, startDevnet, type Devnet } from "@tollgate/devnet";
import { health } from "./health.js";
import { DEFAULT_LIMITS, explain, Limiter } from "./limits.js";
import { GraphDataSource } from "@tollgate/graph";
import { createApp, HcsAuditLog, OnChainListings } from "@tollgate/service";
import express from "express";

type Mode = "live" | "devnet" | "replay";
const MODE: Mode = (() => {
  const raw = (process.env.TOLLGATE_MODE ?? "").toLowerCase();
  if (raw === "live" || raw === "devnet" || raw === "replay") return raw;
  // Back-compat with the flag this replaced.
  if (process.env.REPLAY_ONLY === "1" || process.env.REPLAY_ONLY === "true") return "replay";
  return "devnet";
})();
const REPLAY_ONLY = MODE === "replay";

/** Where a live run buys from. In `live` this is the deployed service, reached over the internet. */
const SERVICE_BASE_URL =
  process.env.SERVICE_BASE_URL ?? "https://tollgate-service-production.up.railway.app";
const WEB_PORT = Number(process.env.PORT ?? 8500);
const here = fileURLToPath(new URL(".", import.meta.url));
const SEPOLIA = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

interface LiveDeployment {
  parentName: string;
  registrar: `0x${string}`;
  resolver: `0x${string}`;
  services?: string[];
  /** Lower bound for event scans — real Sepolia rejects `getLogs` from block 0. */
  deployBlock?: number;
}

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8")) as T;
}

/** The real Sepolia deployment — what the hosted UI shows and what anyone can verify. */
const live = readJson<LiveDeployment>("../../deployments/ens-sepolia.json");

let devnet: Devnet | undefined;
let serviceServer: Server | undefined;

/** Where the catalogue comes from: the live registry when replaying, the fork when running live. */
function directory(): EnsDirectory {
  if (MODE !== "devnet") {
    return new EnsDirectory({
      rpcUrl: SEPOLIA,
      registrarAddress: live.registrar,
      resolverAddress: live.resolver,
      parentName: live.parentName,
      // Without this the scan starts at genesis and the RPC refuses the range — the same trap the
      // fork hit, and the reason the deploy block is recorded alongside the addresses.
      fromBlock: BigInt(live.deployBlock ?? 0),
      // The services this deployment listed. Used only to decide which names to resolve — every
      // one is still read from ENS and dropped if the chain does not back it.
      knownLabels: live.services ?? [],
    });
  }
  if (!devnet) throw new Error("devnet has not booted");
  return new EnsDirectory({
    rpcUrl: devnet.rpcUrl,
    registrarAddress: devnet.registrarAddress,
    resolverAddress: devnet.resolverAddress,
    parentName: devnet.parentName,
    fromBlock: devnet.deployBlock,
    // A fork is a single node; cross-checking it against public Sepolia would query a registrar
    // address that only exists locally.
    corroborateWith: [],
  });
}

async function bootDevnet() {
  const servicePort = await freePort();
  const settlement = readJson<{ settlementAccount: string }>(
    "../../deployments/hedera-testnet.json",
  ).settlementAccount;
  const base = { settlement, network: "hedera:testnet", asset: "0.0.0", unit: "pool" };

  console.log("booting forked Sepolia and listing services…");
  devnet = await startDevnet({
    forkUrl: SEPOLIA,
    parentName: live.parentName,
    listings: [
      {
        label: "uniswap-pools",
        listing: {
          ...base,
          context: "Top Uniswap v3 pools by TVL, live from The Graph. Uniswap only.",
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
            "Pools across every indexed DEX under one standardized schema. Use when the question " +
            "spans protocols rather than naming one.",
          endpoint: `http://127.0.0.1:${servicePort}/s/dex-pools`,
          price: "0.003",
          schema: "{pools:[{id,protocol,tvlUSD}]}",
        },
      },
    ],
  });

  const auditTopic = process.env.HCS_AUDIT_TOPIC_ID;
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  const service = createApp({
    listings: new OnChainListings({
      rpcUrl: devnet.rpcUrl,
      resolverAddress: devnet.resolverAddress,
      parentName: live.parentName,
    }),
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
    dataSource: new GraphDataSource(),
    ...(auditTopic && operatorId && operatorKey
      ? { auditLog: new HcsAuditLog(auditTopic, operatorId, operatorKey) }
      : {}),
  });
  serviceServer = await listenOrFail(service, servicePort, "the tollgate service");
  console.log(`service listening on :${servicePort}`);

  try {
    console.log(`reasoning with ${new ModelReasoner().provider}`);
  } catch {
    console.log("no model credentials — live asking will fail until one is set");
  }
}

const app = express();

/**
 * The built front end, and the one it replaces.
 *
 * `web/ui` is a Next.js static export; Express serves it and keeps every API route below exactly
 * where it was. The previous single-file page is still mounted at `/classic` rather than deleted —
 * it is the fallback that gets filmed if anything about the new surface misbehaves, and it costs
 * one line to keep.
 */
const EXPORT_DIR = resolve(here, "../ui/out");
const CLASSIC_DIR = resolve(here, "../public");
app.use(express.static(EXPORT_DIR));
app.use("/classic", express.static(CLASSIC_DIR, { index: "index.html" }));

const limiter = new Limiter();

app.get("/api/mode", (_req, res) =>
  res.json({
    mode: MODE,
    replayOnly: REPLAY_ONLY,
    liveRuns: MODE !== "replay",
    maxBudgetTinybar: DEFAULT_LIMITS.maxBudgetTinybar.toString(),
    capacity: limiter.status,
  }),
);

/**
 * Everything that has to be true for a judge's live run to work.
 *
 * Exposed rather than kept as a script so it can be checked from anywhere, daily, through
 * judging — and so a failure is visible before someone reports the demo is broken.
 */
app.get("/api/health", async (_req, res) => {
  const report = await health({
    ...(process.env.HEDERA_OPERATOR_ID ? { payerAccountId: process.env.HEDERA_OPERATOR_ID } : {}),
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
    serviceBaseUrl: SERVICE_BASE_URL,
    serviceLabel: live.services?.[0] ?? "uniswap-pools",
    capacity: limiter.status,
  });
  res.status(report.ok ? 200 : 503).json(report);
});

app.get("/api/listings", async (_req, res) => {
  try {
    const dir = directory();
    const services = await dir.list();
    const scan = dir.lastScan;
    res.json({
      parent: live.parentName,
      registrar: live.registrar,
      resolver: live.resolver,
      services,
      // Reported rather than hidden. If the event scan under-reported, the page says so — a
      // catalogue that quietly shrinks is worse than one that admits its source is unreliable.
      ...(scan.recovered.length
        ? {
            incompleteScan: {
              fromLogs: scan.fromLogs,
              recovered: scan.recovered,
              detail:
                "This RPC returned an incomplete event log. The missing listings were recovered " +
                "by reading their ENS records directly.",
            },
          }
        : {}),
    });
  } catch (err) {
    res.status(503).json({ error: (err as Error)?.message ?? "catalogue unavailable" });
  }
});

app.get("/api/traces", (_req, res) => {
  try {
    const dir = fileURLToPath(new URL("../../docs/traces/", import.meta.url));
    res.json({ traces: readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) });
  } catch {
    res.json({ traces: [] });
  }
});

/**
 * Replay an archived trace.
 *
 * Streams a recording of a run that actually happened, so evidence of a run whose conditions no
 * longer exist can still be watched. The page banners it unmistakably — a replay must never be
 * mistakable for a live run.
 */
app.get("/api/replay/:name", async (req, res) => {
  const name = String(req.params.name).replace(/[^a-z0-9._-]/gi, "");
  let archive: { events: unknown[]; recordedAt?: string; note?: string };
  try {
    archive = readJson(`../../docs/traces/${name}.json`);
  } catch {
    return res.status(404).json({ error: `no archived trace named "${name}"` });
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const write = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  write({ type: "replay", recordedAt: archive.recordedAt, note: archive.note });

  // Paced so it reads at human speed rather than arriving as a wall of text.
  for (const event of archive.events) {
    write(event);
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  res.end();
});

app.get("/api/ask", async (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const send = (event: TraceEvent | { type: "fatal"; message: string }) =>
    res.write(`data: ${JSON.stringify(event)}\n\n`);

  if (REPLAY_ONLY) {
    send({
      type: "fatal",
      message:
        "This deployment replays recorded runs only. Watch a recorded run below — they are real " +
        "runs against live infrastructure, not simulations.",
    });
    return res.end();
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    send({
      type: "fatal",
      message:
        "This deployment has no Hedera payer configured, so it cannot run live. The recorded " +
        "runs below are unaffected.",
    });
    return res.end();
  }

  // Caps are checked before anything is spent, and refusals say what happened and what is still
  // possible. A control that fails without explaining itself is worse than one that is absent.
  const budget = BigInt(String(req.query.budget ?? "2000000"));
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown")
    .split(",")[0]!
    .trim();
  const refusal = limiter.take(ip, budget);
  if (refusal) {
    send({ type: "fatal", message: explain(refusal) });
    return res.end();
  }

  try {
    await ask(String(req.query.q ?? "what are the top uniswap pools right now?"), {
      directory: directory(),
      reasoner: new ModelReasoner(),
      payer: { accountId: operatorId, privateKey: operatorKey },
      budget: new Budget(budget),
      trace: send,
    });
  } catch (err: unknown) {
    send({
      type: "fatal",
      message:
        err instanceof MissingModelCredentialsError
          ? err.message
          : ((err as Error)?.message ?? "unknown error"),
    });
  }
  res.end();
});

// Only `devnet` needs a fork and a local service; `live` uses the deployed ones.
if (MODE === "devnet") await bootDevnet();

app.listen(WEB_PORT, () => {
  console.log(`\n  trace view → http://127.0.0.1:${WEB_PORT}`);
  console.log(`  mode        ${MODE}`);
  console.log(`  catalogue   ${live.parentName} via ${MODE === "devnet" ? "the fork" : "Sepolia"}`);
  if (MODE === "live") {
    console.log(`  buying from ${SERVICE_BASE_URL}`);
    console.log(
      `  caps        ${DEFAULT_LIMITS.runsPerDay}/day · ` +
        `${DEFAULT_LIMITS.runsPerHourPerIp}/hour/ip · ` +
        `max ${Number(DEFAULT_LIMITS.maxBudgetTinybar) / 1e8} HBAR per run`,
    );
  }
  console.log("");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    serviceServer?.close();
    if (devnet) void devnet.stop().then(() => process.exit(0));
    else process.exit(0);
  });
}
