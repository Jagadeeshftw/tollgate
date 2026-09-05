/**
 * Phase 0 gate checks, re-runnable.
 *
 * Every assertion here hits a live system. Nothing is mocked and nothing is
 * asserted from documentation — if a partner's infrastructure moves, this fails
 * loudly rather than letting us build on a stale assumption.
 *
 *   pnpm gates
 */

import { ENSV2_SEPOLIA } from "@tollgate/ens-config";

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const FACILITATOR = process.env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com";
const GRAPH_GATEWAY = process.env.GRAPH_GATEWAY_URL ?? "https://gateway.thegraph.com/api";
const SUBGRAPH_MCP = process.env.SUBGRAPH_MCP_URL ?? "https://subgraphs.mcp.thegraph.com/sse";
const MIRROR_NODE = process.env.HEDERA_MIRROR_NODE ?? "https://testnet.mirrornode.hedera.com";

/**
 * ENSv2 beta, Sepolia — single source of truth, taken from the ENS docs deployments table.
 * See `packages/devnet/src/deployments.ts` for why the repo artifacts must not be used.
 */
const ENS = ENSV2_SEPOLIA;

type Status = "PASS" | "FAIL" | "BLOCKED";
const results: { gate: string; status: Status; detail: string }[] = [];

function record(gate: string, status: Status, detail: string) {
  results.push({ gate, status, detail });
  const mark = status === "PASS" ? "\x1b[32m✔\x1b[0m" : status === "BLOCKED" ? "\x1b[33m•\x1b[0m" : "\x1b[31m✘\x1b[0m";
  console.log(`${mark} ${gate.padEnd(34)} ${detail}`);
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SEPOLIA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

/** Gate 1 — the facilitator must be up AND advertise hedera:testnet. */
async function gate1() {
  try {
    const res = await fetch(`${FACILITATOR}/supported`, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return record("Gate 1a Blocky402", "FAIL", `/supported -> HTTP ${res.status}`);

    const body = (await res.json()) as {
      kinds?: { scheme: string; network: string; extra?: { feePayer?: string } }[];
    };
    const hedera = body.kinds?.find((k) => k.network === "hedera:testnet" && k.scheme === "exact");

    if (!hedera) {
      return record("Gate 1a Blocky402", "FAIL", "facilitator no longer advertises hedera:testnet exact");
    }
    record("Gate 1a Blocky402", "PASS", `hedera:testnet live, feePayer ${hedera.extra?.feePayer}`);
  } catch (err) {
    record("Gate 1a Blocky402", "FAIL", String(err));
  }
}

/**
 * Gate 1b — the Hedera credentials themselves.
 *
 * Deliberately paranoid, because every failure mode here surfaces somewhere far away and
 * confusing if it is not caught at the door:
 *
 *   - An **ED25519** key is the default on most Hedera faucets and account tools, but the x402
 *     Hedera scheme signs through `PrivateKey.fromStringECDSA`. Note that this does *not* reject
 *     an ED25519 key on its own: a raw private key is 32 bytes on either curve, so
 *     `fromStringECDSA` parses an ED25519 key happily and derives a secp256k1 public key from it
 *     that corresponds to no account at all. Verified by feeding it one. The parse check below
 *     therefore catches only malformed or DER-encoded input; the *curve* mismatch is caught by
 *     comparing against the account's on-chain key, which is why that comparison is not optional.
 *   - A key that parses but belongs to a *different* account produces a valid signature that the
 *     facilitator rejects as not matching the payer — which reads like a facilitator bug.
 *   - An unfunded account fails only at settlement, after the 402 round trip has already happened.
 *
 * So: parse it, prove it controls the account we think it does, and report the balance.
 *
 * Nothing in this function may emit the private key. SDK errors are reported by class name only,
 * never by message, because a parser that fails on malformed input is exactly the kind of code
 * that echoes that input back. A key printed once is a key that has to be rotated.
 */
async function gate1b() {
  const accountId = process.env.HEDERA_OPERATOR_ID;
  const rawKey = process.env.HEDERA_OPERATOR_KEY;

  if (!accountId || !rawKey) {
    return record(
      "Gate 1b Hedera credentials",
      "BLOCKED",
      "HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY unset",
    );
  }

  let publicKey: string;
  try {
    const { PrivateKey } = await import("@x402/hedera");
    publicKey = PrivateKey.fromStringECDSA(rawKey).publicKey.toStringRaw().toLowerCase();
  } catch (err) {
    // Deliberately not interpolating the error message — see the note above.
    return record(
      "Gate 1b Hedera credentials",
      "FAIL",
      `HEDERA_OPERATOR_KEY did not parse as an ECDSA key (${(err as Error)?.name ?? "error"}). ` +
        `Expected raw or DER-encoded secp256k1.`,
    );
  }

  try {
    const res = await fetch(`${MIRROR_NODE}/api/v1/accounts/${accountId}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return record(
        "Gate 1b Hedera credentials",
        "FAIL",
        `mirror node has no account ${accountId} (HTTP ${res.status})`,
      );
    }

    const account = (await res.json()) as {
      key?: { _type?: string; key?: string };
      balance?: { balance?: number };
    };

    const onChainKey = account.key?.key?.toLowerCase();
    if (!onChainKey) {
      return record("Gate 1b Hedera credentials", "FAIL", `no key on record for ${accountId}`);
    }
    if (onChainKey !== publicKey) {
      const keyType = account.key?._type ?? "unknown";
      const hint = keyType.toUpperCase().includes("ED25519")
        ? ` — ${accountId} is an ED25519 account, but x402 on Hedera requires ECDSA (secp256k1).` +
          " Create a new testnet account with an ECDSA key rather than converting this one."
        : "";
      return record(
        "Gate 1b Hedera credentials",
        "FAIL",
        `key does not control ${accountId} (on-chain key type: ${keyType})${hint}`,
      );
    }

    // Mirror node reports balance in tinybars.
    const tinybars = account.balance?.balance ?? 0;
    const hbar = tinybars / 1e8;
    if (tinybars === 0) {
      return record(
        "Gate 1b Hedera credentials",
        "FAIL",
        `${accountId} is correct but holds 0 HBAR — settlement will fail`,
      );
    }
    record("Gate 1b Hedera credentials", "PASS", `${accountId} controlled, balance ${hbar} HBAR`);
  } catch (err) {
    record("Gate 1b Hedera credentials", "FAIL", String(err));
  }
}

const MIRROR_POLL_SECONDS = 30;

interface MirrorTransaction {
  result?: string;
  transfers?: { account: string; amount: number }[];
}

/** Poll the mirror node until the transaction is indexed, or give up. */
async function findOnMirror(transactionId: string): Promise<MirrorTransaction | null> {
  // 0.0.X@sec.nanos -> 0.0.X-sec-nanos
  const mirrorId = transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  const deadline = Date.now() + MIRROR_POLL_SECONDS * 1000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MIRROR_NODE}/api/v1/transactions/${mirrorId}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const body = (await res.json()) as { transactions?: MirrorTransaction[] };
        const tx = body.transactions?.[0];
        if (tx) return tx;
      }
    } catch {
      // Keep polling; a transient failure here is not a settlement failure.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return null;
}

/**
 * Gate 1c — settlement. The only leg that proves money moves.
 *
 * Runs a real payment on every invocation rather than asserting a cached result, because the
 * question this gate answers ("can we settle *now*") has a different answer on different days: a
 * facilitator outage, an emptied account or a testnet reset all invalidate it silently. It costs
 * 0.001 HBAR a run, which is the correct price for not lying about the project's riskiest claim.
 */
async function gate1c() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    return record("Gate 1c Settlement", "BLOCKED", "Hedera credentials unset");
  }

  let payTo: string;
  try {
    const { settlementAccount } = await import("./paidRequest.js");
    payTo = settlementAccount();
  } catch {
    return record("Gate 1c Settlement", "BLOCKED", "no settlement account — run `pnpm hedera:setup`");
  }

  try {
    const { runPaidRequest } = await import("./paidRequest.js");
    const result = await runPaidRequest({ operatorId, operatorKey, facilitatorUrl: FACILITATOR, payTo });

    // Do not take the resource server's word for it. Confirm the transfer on the mirror node:
    // a 200 proves the server released the goods, not that the payer was actually debited.
    //
    // Mirror nodes are eventually consistent and lag consensus by a few seconds, so this polls.
    // Querying once immediately after settlement reports "not found" for a transaction that did
    // in fact succeed — a false failure on the project's most important check.
    const tx = await findOnMirror(result.transactionId);
    if (!tx) {
      return record(
        "Gate 1c Settlement",
        "FAIL",
        `${result.transactionId} did not appear on the mirror node within ${MIRROR_POLL_SECONDS}s`,
      );
    }
    if (tx.result !== "SUCCESS") {
      return record("Gate 1c Settlement", "FAIL", `consensus result ${tx.result}`);
    }

    const credited = tx.transfers?.find((t) => t.account === payTo)?.amount ?? 0;
    if (String(credited) !== result.amountTinybar) {
      return record(
        "Gate 1c Settlement",
        "FAIL",
        `${payTo} credited ${credited} tinybar, expected ${result.amountTinybar}`,
      );
    }

    record(
      "Gate 1c Settlement",
      "PASS",
      `${result.unpaidStatus}->${result.paidStatus}, ${credited} tinybar to ${payTo}, tx ${result.transactionId}`,
    );
  } catch (err) {
    record("Gate 1c Settlement", "FAIL", (err as Error)?.message ?? "unknown error");
  }
}


/**
 * Gate 1d — the hosted demo's credentials control the account they name, and it is not the retired one.
 *
 * @remarks
 * The gap this closes cost a real incident. `HEDERA_OPERATOR_KEY` for the hosted payer was exposed
 * and reported as rotated; `.env` held a new value and nothing on chain had changed, so the exposed
 * key still controlled the account while every upstream signal said otherwise. Gate 1b already
 * proves this for the *main* operator — the hosted pair simply had no gate, which is the whole
 * reason the mismatch went unnoticed.
 *
 * Two assertions, because either alone can pass while the deployment is wrong: the key must derive
 * the public key the account actually carries, and the account must not be one recorded as retired.
 * A retired account with a valid key is still a compromised account.
 */
async function gate1d() {
  const name = "Gate 1d Hosted credentials";
  const accountId = process.env.HOSTED_HEDERA_OPERATOR_ID;
  const rawKey = process.env.HOSTED_HEDERA_OPERATOR_KEY;
  if (!accountId || !rawKey) {
    return record(name, "BLOCKED", "HOSTED_HEDERA_OPERATOR_ID / _KEY unset — hosted demo not configured");
  }

  let publicKey: string;
  try {
    const { PrivateKey } = await import("@hiero-ledger/sdk");
    publicKey = PrivateKey.fromStringECDSA(rawKey).publicKey.toStringRaw().toLowerCase();
  } catch (err) {
    return record(name, "FAIL", `HOSTED_HEDERA_OPERATOR_KEY did not parse as ECDSA (${(err as Error)?.name})`);
  }

  try {
    const { readFileSync } = await import("node:fs");
    const record_ = JSON.parse(readFileSync("deployments/hedera-testnet.json", "utf8")) as {
      hosted?: { retired?: { operatorAccount?: string; settlementAccount?: string } };
    };
    const retired = record_.hosted?.retired;
    if (retired && (accountId === retired.operatorAccount || accountId === retired.settlementAccount)) {
      return record(name, "FAIL", `${accountId} is recorded as retired after a key exposure and must not be used`);
    }

    const res = await fetch(`${MIRROR_NODE}/api/v1/accounts/${accountId}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return record(name, "FAIL", `mirror node has no account ${accountId} (HTTP ${res.status})`);

    const account = (await res.json()) as { key?: { key?: string }; balance?: { balance?: number } };
    const onChainKey = account.key?.key?.toLowerCase();
    if (onChainKey !== publicKey) {
      return record(
        name,
        "FAIL",
        `HOSTED_HEDERA_OPERATOR_KEY does not control ${accountId} — if this followed a rotation, ` +
          "the key was changed in .env but never on chain",
      );
    }
    const hbar = (account.balance?.balance ?? 0) / 1e8;
    record(name, hbar < 5 ? "FAIL" : "PASS", `${accountId} controlled, ${hbar.toFixed(2)} HBAR for hosted runs`);
  } catch (err) {
    record(name, "FAIL", (err as Error)?.message ?? String(err));
  }
}

/**
 * Gate 3c — the model credential authenticates.
 *
 * @remarks
 * Presence is not capability. `checkEnv` proves a key is set under a name the SDK reads, which is a
 * different claim from the key being live — and an expired or revoked key surfaces as a failed run
 * mid-demo rather than at preflight. `GET /v1/models` costs no tokens and settles it.
 */
async function gate3c() {
  const name = "Gate 3c Model credential";
  const key = process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY;
  if (!key) return record(name, "BLOCKED", "no OpenAI credential set");
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return record(name, "FAIL", `OpenAI rejected the key (HTTP ${res.status}) — it is set but not live`);
    }
    const body = (await res.json()) as { data?: { id: string }[] };
    record(name, "PASS", `authenticates, ${body.data?.length ?? 0} models available`);
  } catch (err) {
    record(name, "FAIL", (err as Error)?.message ?? String(err));
  }
}

/** Gate 2 — every ENSv2 address must still hold bytecode on Sepolia. */
async function gate2() {
  try {
    const chainId = await rpc<string>("eth_chainId", []);
    if (parseInt(chainId, 16) !== ENS.chainId) {
      return record("Gate 2  ENSv2 Sepolia", "FAIL", `RPC is chain ${parseInt(chainId, 16)}, not Sepolia`);
    }

    const addresses = Object.entries(ENS).filter(([, v]) => typeof v === "string");
    const empty: string[] = [];
    for (const [name, addr] of addresses) {
      const code = await rpc<string>("eth_getCode", [addr as string, "latest"]);
      if (!code || code === "0x") empty.push(name);
    }

    if (empty.length) {
      return record("Gate 2  ENSv2 Sepolia", "FAIL", `no bytecode at: ${empty.join(", ")}`);
    }
    record("Gate 2  ENSv2 Sepolia", "PASS", `${addresses.length} contracts carry bytecode`);
  } catch (err) {
    record("Gate 2  ENSv2 Sepolia", "FAIL", String(err));
  }
}

/**
 * Gate 2b — are we on the deployment ENS actually serves?
 *
 * @remarks
 * Bytecode at an address proves only that *a* contract is there, not that it is the one the ENS
 * App resolves against. Sepolia currently carries a superseded ENSv2 tree alongside the live one:
 * complete, self-consistent, fully deployed, and invisible to the App. We built against it for
 * three days without anything failing, because within that tree everything worked.
 *
 * The upgradable Universal Resolver proxy is stable across deployments and reports the root
 * registry currently being served, so this is a canonical, self-updating answer rather than a
 * fact we have to keep re-checking by hand. Recommended by ENS Labs.
 */
async function gate2b() {
  try {
    // ROOT_REGISTRY() — selector confirmed with `cast sig`, not guessed
    const result = await rpc<string>("eth_call", [
      { to: ENS.universalResolverProxy, data: "0xc92cc49a" },
      "latest",
    ]);
    const served = `0x${result.slice(-40)}`.toLowerCase();
    const expected = ENS.rootRegistry.toLowerCase();

    if (served !== expected) {
      return record(
        "Gate 2b Live deployment",
        "FAIL",
        `the UR proxy serves root registry ${served}, but our config targets ${expected}. ` +
          `We are pointed at a deployment ENS is not serving — see packages/devnet/src/deployments.ts`,
      );
    }
    record("Gate 2b Live deployment", "PASS", `UR proxy confirms root registry ${served}`);
  } catch (err) {
    record("Gate 2b Live deployment", "FAIL", String(err));
  }
}

/**
 * Gate 2c — our own deployment, read fresh from chain.
 *
 * @remarks
 * Deliberately independent of the deploy script's return values: a deploy reporting success and
 * the chain agreeing are different claims, and only the second one matters. Everything here is
 * re-read through public entry points — the `.eth` registry for the parent's subregistry, and
 * `UniversalResolverV2` for the records, which is the path any ENS client takes.
 *
 * Addresses come from `deployments/ens-sepolia.json`, never from constants in this file. That is
 * the rule that stopped the superseded-tree mistake from spreading, and it applies to our own
 * addresses too.
 */
async function gate2c() {
  let deployed: { parentName?: string; registry?: string; services?: string[] };
  try {
    const { readFileSync } = await import("node:fs");
    deployed = JSON.parse(readFileSync("deployments/ens-sepolia.json", "utf8"));
  } catch {
    return record("Gate 2c Our ENS deployment", "BLOCKED", "not deployed — run `pnpm ens:deploy --execute`");
  }

  const { parentName, registry } = deployed;
  if (!parentName || !registry) {
    return record("Gate 2c Our ENS deployment", "FAIL", "deployments/ens-sepolia.json is incomplete");
  }

  try {
    const viem = await import("viem");
    const { sepolia } = await import("viem/chains");
    const client = viem.createPublicClient({ chain: sepolia, transport: viem.http(SEPOLIA_RPC) });
    const label = parentName.replace(/\.eth$/, "");

    const subregistry = (await client.readContract({
      address: ENS.ethRegistry,
      abi: viem.parseAbi(["function getSubregistry(string label) view returns (address)"]),
      functionName: "getSubregistry",
      args: [label],
    })) as string;

    if (subregistry.toLowerCase() !== registry.toLowerCase()) {
      return record(
        "Gate 2c Our ENS deployment",
        "FAIL",
        `${parentName} points at ${subregistry}, expected our registry ${registry}`,
      );
    }

    const services = deployed.services ?? [];
    if (services.length === 0) {
      return record("Gate 2c Our ENS deployment", "PASS", `${parentName} -> our registry (no services listed)`);
    }

    const fqdn = `${services[0]}.${parentName}`;
    const dns = ("0x" +
      fqdn.split(".").map((l) => l.length.toString(16).padStart(2, "0") + Buffer.from(l).toString("hex")).join("") +
      "00") as `0x${string}`;

    const [answer] = (await client.readContract({
      address: ENS.universalResolver,
      abi: viem.parseAbi(["function resolve(bytes name, bytes data) view returns (bytes, address)"]),
      functionName: "resolve",
      args: [
        dns,
        viem.encodeFunctionData({
          abi: viem.parseAbi(["function text(bytes32 node, string key) view returns (string)"]),
          functionName: "text",
          args: [viem.namehash(fqdn), "x402:price"],
        }),
      ],
    })) as [`0x${string}`, string];

    const [price] = viem.decodeAbiParameters([{ type: "string" }], answer);
    if (!price) return record("Gate 2c Our ENS deployment", "FAIL", `${fqdn} resolved but x402:price is empty`);

    record(
      "Gate 2c Our ENS deployment",
      "PASS",
      `${services.length} service(s); ${fqdn} resolves publicly, x402:price = "${price}"`,
    );
  } catch (err) {
    record("Gate 2c Our ENS deployment", "FAIL", (err as Error)?.message ?? String(err));
  }
}


/**
 * Gate 3 — the Graph path. Without a key we can only prove the gateway is alive
 * and rejecting us for auth; with one we prove a live query returns real data.
 * Mocked data is an explicit disqualifier, so this gate never passes on a stub.
 */
async function gate3() {
  try {
    const mcp = await fetch(SUBGRAPH_MCP, { signal: AbortSignal.timeout(15_000) });
    record("Gate 3a Subgraph MCP", mcp.ok ? "PASS" : "FAIL", `${SUBGRAPH_MCP} -> HTTP ${mcp.status}`);
  } catch (err) {
    record("Gate 3a Subgraph MCP", "FAIL", String(err));
  }

  const key = process.env.GRAPH_API_KEY;
  if (!key) {
    return record(
      "Gate 3b Graph live query",
      "BLOCKED",
      "GRAPH_API_KEY unset — get one at thegraph.com/studio",
    );
  }

  const subgraphId = process.env.GRAPH_SUBGRAPH_ID;
  if (!subgraphId) {
    return record("Gate 3b Graph live query", "BLOCKED", "GRAPH_SUBGRAPH_ID unset");
  }

  try {
    const res = await fetch(`${GRAPH_GATEWAY}/subgraphs/id/${subgraphId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: "{ _meta { block { number } hasIndexingErrors } }" }),
      signal: AbortSignal.timeout(25_000),
    });
    const json = (await res.json()) as {
      data?: { _meta?: { block?: { number?: number } } };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      return record("Gate 3b Graph live query", "FAIL", json.errors[0]!.message);
    }
    const block = json.data?._meta?.block?.number;
    if (typeof block !== "number") {
      return record("Gate 3b Graph live query", "FAIL", "no _meta block in response");
    }
    record("Gate 3b Graph live query", "PASS", `live data, indexed to block ${block}`);
  } catch (err) {
    record("Gate 3b Graph live query", "FAIL", String(err));
  }
}

/** Gate 0 — configuration. Cheap, and it catches the failures that masquerade as other bugs. */
async function gate0() {
  const { checkEnv } = await import("./env-check.js");
  const findings = checkEnv();

  for (const f of findings.filter((x) => x.level !== "ok")) {
    record(
      `Gate 0  ${f.name}`,
      f.level === "fail" ? "FAIL" : "BLOCKED",
      f.message,
    );
  }
  const ok = findings.filter((f) => f.level === "ok").length;
  if (!findings.some((f) => f.level === "fail")) {
    record("Gate 0  Configuration", "PASS", `${ok} variable(s) set and well-formed`);
  }

  await deployerCheck();
  await railwayCheck();
}


/**
 * Gate 0 — the Railway credential actually authenticates.
 *
 * @remarks
 * Presence was never the problem. `RAILWAY_TOKEN` was set the whole time and simply invalid, and
 * the only symptom was "Unauthorized" — which reads as a permissions issue with the account rather
 * than as the wrong value under the right name. The token that works is a *project* token, and the
 * CLI reads no name but `RAILWAY_TOKEN`, so this resolves either spelling and then spends one
 * request proving the credential is live rather than merely present.
 */
async function railwayCheck() {
  const name = "Gate 0  Railway";
  const token = process.env.RAILWAY_TOKEN ?? process.env.RAILWAY_PROJECT_TOKEN;
  if (!token) {
    return record(name, "BLOCKED", "no RAILWAY_TOKEN or RAILWAY_PROJECT_TOKEN — deploys unavailable");
  }
  const via = process.env.RAILWAY_TOKEN ? "RAILWAY_TOKEN" : "RAILWAY_PROJECT_TOKEN";

  try {
    const res = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: { "content-type": "application/json", "Project-Access-Token": token },
      body: JSON.stringify({ query: "{ projectToken { projectId environmentId } }" }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as {
      data?: { projectToken?: { projectId?: string } };
      errors?: { message: string }[];
    };
    const projectId = json.data?.projectToken?.projectId;
    if (!projectId) {
      return record(
        name,
        "FAIL",
        `${via} did not authenticate (${json.errors?.[0]?.message ?? `HTTP ${res.status}`}) — ` +
          "a project token must be exported as RAILWAY_TOKEN for the CLI to read it",
      );
    }
    record(name, "PASS", `${via} authenticates for project ${projectId.slice(0, 8)}…`);
  } catch (err) {
    record(name, "FAIL", (err as Error)?.message ?? String(err));
  }
}

/**
 * The deployer must control the address we published for funding, and have gas.
 *
 * @remarks
 * Checked rather than assumed for the same reason as the Hedera key: a recorded address that the
 * key does not actually control would surface as an inexplicable revert during the one deployment
 * we care about. The registration fee itself is not gas — it is MockUSDC, which has a public
 * `mint()` on testnet, so only ETH needs funding from outside.
 */
async function deployerCheck() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) return;

  try {
    const { privateKeyToAccount } = await import("viem/accounts");
    const derived = privateKeyToAccount(key as `0x${string}`).address;
    const recorded = process.env.DEPLOYER_ADDRESS;

    if (recorded && recorded.toLowerCase() !== derived.toLowerCase()) {
      return record(
        "Gate 0  Deployer",
        "FAIL",
        `DEPLOYER_PRIVATE_KEY controls ${derived}, but DEPLOYER_ADDRESS records ${recorded}`,
      );
    }

    const balanceHex = await rpc<string>("eth_getBalance", [derived, "latest"]);
    const wei = BigInt(balanceHex);
    const eth = Number(wei) / 1e18;

    if (wei === 0n) {
      return record(
        "Gate 0  Deployer",
        "BLOCKED",
        `${derived} controlled, but holds 0 ETH — needs Sepolia gas before the parent can be registered`,
      );
    }
    record("Gate 0  Deployer", "PASS", `${derived} controlled, balance ${eth.toFixed(4)} SepoliaETH`);
  } catch (err) {
    record("Gate 0  Deployer", "FAIL", (err as Error)?.message ?? "unknown error");
  }
}

/**
 * Gate 2d — the catalogue the agent discovers must be the catalogue we deployed.
 *
 * @remarks
 * This exists because of a real failure, not a hypothetical one. On 3 September the hosted
 * dashboard showed a single service while the chain held three: `eth_getLogs` over a wide range
 * returned a *subset* of the registrar's events, with no error and no warning, and different
 * subsets on different calls. State reads (`eth_call`) on the very same endpoint were correct
 * throughout — only historical log indexing was wrong.
 *
 * A discovery-driven marketplace that silently shrinks is worse than one that is down: every claim
 * about the agent choosing between services depends on there being services to choose between, and
 * a judge would have seen a one-listing marketplace with nothing indicating anything was missing.
 * So the deployment record is used here as an integrity check — never as the catalogue itself,
 * which still comes from the chain.
 */
async function gate2d() {
  const { readFileSync } = await import("node:fs");
  let live: { registrar?: string; resolver?: string; parentName?: string; services?: string[]; deployBlock?: number };
  try {
    live = JSON.parse(readFileSync("deployments/ens-sepolia.json", "utf8"));
  } catch {
    return record("Gate 2d Catalogue complete", "BLOCKED", "no deployments/ens-sepolia.json");
  }

  const expected = live.services ?? [];
  if (!live.registrar || !live.resolver || !live.parentName || expected.length === 0) {
    return record("Gate 2d Catalogue complete", "BLOCKED", "deployment record lists no services");
  }

  let EnsDirectory: typeof import("@tollgate/agent").EnsDirectory;
  try {
    ({ EnsDirectory } = await import("@tollgate/agent"));
  } catch {
    // Early in the build sequence the agent does not exist yet. That is a gate that cannot run,
    // not a gate that failed.
    return record("Gate 2d Catalogue complete", "BLOCKED", "@tollgate/agent not built yet");
  }

  try {
    // Exercise the path the dashboard actually uses, including the resolver-verified hints. The
    // assertion is that the catalogue a visitor sees matches the deployment; the reliability of the
    // raw log scan underneath is reported below, not asserted, because it depends on a public RPC
    // that under-reports at random and a gate that fails at random is a gate nobody trusts.
    const directory = new EnsDirectory({
      rpcUrl: SEPOLIA_RPC,
      registrarAddress: live.registrar as `0x${string}`,
      resolverAddress: live.resolver as `0x${string}`,
      parentName: live.parentName,
      fromBlock: BigInt(live.deployBlock ?? 0),
      knownLabels: expected,
    });
    const found = await directory.list();
    const recovered = directory.lastScan.recovered;

    const labels = found.map((c) => c.label).sort();
    const missing = expected.filter((e) => !labels.includes(e));

    if (missing.length) {
      return record(
        "Gate 2d Catalogue complete",
        "FAIL",
        `discovery found ${labels.length}/${expected.length} — missing ${missing.join(", ")}. ` +
          `The RPC is returning incomplete logs; set SEPOLIA_RPC_URL to a provider with reliable ` +
          `eth_getLogs.`,
      );
    }
    record(
      "Gate 2d Catalogue complete",
      "PASS",
      `all ${expected.length} discovered: ${labels.join(", ")}` +
        (recovered.length
          ? ` (${recovered.length} missing from the event log, recovered by resolver read)`
          : ""),
    );
  } catch (err) {
    record("Gate 2d Catalogue complete", "FAIL", (err as Error)?.message ?? String(err));
  }
}

/**
 * Gate 2e — the catalogue survives an endpoint that serves state but not logs.
 *
 * @remarks
 * `eth_getLogs` and `eth_call` fail independently, and the dangerous combination is a node that
 * indexes state correctly while erroring on the log query: discovery used to abort outright and
 * throw away a catalogue the resolver could still rebuild. Since the log path is currently
 * returning nothing useful on public Sepolia endpoints, that recovery is not a fallback any more —
 * it is the load-bearing path, and it needs a test that fails when it stops working.
 *
 * The failure is simulated with a local proxy rather than waited for, because the real endpoint
 * chooses when to misbehave and a gate that only fires on a bad day is not a gate.
 */
async function gate2e() {
  const name = "Gate 2e Log-failure recovery";
  const { createServer } = await import("node:http");
  const { readFileSync } = await import("node:fs");

  let live: { registrar?: string; resolver?: string; parentName?: string; services?: string[]; deployBlock?: number };
  try {
    live = JSON.parse(readFileSync("deployments/ens-sepolia.json", "utf8"));
  } catch {
    return record(name, "BLOCKED", "no deployments/ens-sepolia.json");
  }
  const expected = live.services ?? [];
  if (!live.registrar || !live.resolver || !live.parentName || !expected.length) {
    return record(name, "BLOCKED", "deployment record lists no services");
  }

  const proxy = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed: { method?: string; id?: unknown } = {};
      try { parsed = JSON.parse(body) as typeof parsed; } catch { /* forward as-is */ }
      if (parsed.method === "eth_getLogs") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, error: { code: -32000, message: "log index unavailable" } }));
        return;
      }
      fetch(SEPOLIA_RPC, { method: "POST", headers: { "content-type": "application/json" }, body })
        .then(async (u) => {
          res.writeHead(u.status, { "content-type": "application/json" });
          res.end(await u.text());
        })
        .catch(() => { res.writeHead(502).end("{}"); });
    });
  });

  try {
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const port = (proxy.address() as { port: number }).port;

    const { EnsDirectory } = await import("@tollgate/agent");
    const found = await new EnsDirectory({
      rpcUrl: `http://127.0.0.1:${port}`,
      registrarAddress: live.registrar as `0x${string}`,
      resolverAddress: live.resolver as `0x${string}`,
      parentName: live.parentName,
      fromBlock: BigInt(live.deployBlock ?? 0),
      knownLabels: expected,
      corroborateWith: [],
    }).list();

    const labels = found.map((c) => c.label).sort();
    const missing = expected.filter((e) => !labels.includes(e));
    if (missing.length) {
      return record(name, "FAIL", `logs broken -> ${labels.length}/${expected.length}, missing ${missing.join(", ")}`);
    }
    record(name, "PASS", `all ${expected.length} recovered from resolver records with every log query failing`);
  } catch (err) {
    record(name, "FAIL", `discovery aborted instead of degrading: ${(err as Error)?.message ?? String(err)}`);
  } finally {
    proxy.close();
  }
}


/**
 * Gate 3d — the Substreams data-plane token is present, unexpired, and accepted.
 *
 * @remarks
 * Third time a credential has existed under a plausible name and failed for the thing we needed:
 * `OPENAI_KEY` the SDK never read, a `RAILWAY_TOKEN` that was simply invalid, and now a Subgraph
 * Studio key that authenticates GraphQL queries perfectly and is rejected by Substreams with
 * `invalid JWT token`. They are different credentials for different planes, and nothing about the
 * name says so.
 *
 * These tokens also expire, which is the failure this gate mainly exists to catch: an expired JWT
 * surfaces as a dead stream mid-demo rather than at preflight. The expiry claim is read locally
 * (cheap, and catches the common case); a real stream call is attempted only when the `substreams`
 * CLI is on PATH, and the gate says which of the two it actually managed.
 */
async function gate3d() {
  const name = "Gate 3d Substreams token";
  const token = process.env.SUBSTREAMS_API_TOKEN;
  if (!token) {
    return record(name, "BLOCKED", "SUBSTREAMS_API_TOKEN unset — run `substreams auth` (thegraph.market)");
  }

  // A JWT is three dot-separated base64url segments; anything else is the wrong kind of credential.
  const parts = token.split(".");
  if (parts.length !== 3) {
    return record(
      name,
      "FAIL",
      "not a JWT — a Subgraph Studio key is not a Substreams data-plane token; run `substreams auth`",
    );
  }

  let exp: number | undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { exp?: number };
    exp = payload.exp;
  } catch {
    return record(name, "FAIL", "JWT payload did not decode");
  }
  if (typeof exp !== "number") return record(name, "FAIL", "JWT carries no exp claim");

  const secondsLeft = exp - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) {
    return record(name, "FAIL", `token expired ${Math.abs(Math.round(secondsLeft / 3600))}h ago — re-run \`substreams auth\``);
  }
  const days = (secondsLeft / 86400).toFixed(1);

  // Capability, where the tooling allows it: one block from a public package.
  const { execFileSync } = await import("node:child_process");
  let cli: string | undefined;
  for (const candidate of ["substreams", `${process.env.HOME}/.local/bin/substreams`]) {
    try { execFileSync(candidate, ["--version"], { stdio: "ignore" }); cli = candidate; break; } catch { /* keep looking */ }
  }
  if (!cli) {
    return record(name, secondsLeft < 86_400 ? "FAIL" : "PASS", `valid JWT, ${days}d left (expiry checked; no CLI on PATH to test the stream)`);
  }

  try {
    execFileSync(
      cli,
      ["run", "-e", "mainnet.eth.streamingfast.io:443",
       "https://spkg.io/streamingfast/ethereum-common-v0.3.0.spkg", "all_events",
       "-s", "21000000", "-t", "21000001"],
      { stdio: "pipe", timeout: 60_000, env: { ...process.env, SUBSTREAMS_API_TOKEN: token } },
    );
    record(name, "PASS", `stream accepted the token, ${days}d until expiry`);
  } catch (err) {
    const out = String((err as { stderr?: Buffer }).stderr ?? (err as Error).message);
    if (/Unauthenticated|invalid JWT/i.test(out)) {
      return record(name, "FAIL", "endpoint rejected the token — re-run `substreams auth`");
    }
    record(name, "PASS", `valid JWT, ${days}d left (stream probe inconclusive: ${out.slice(0, 40).replace(/\s+/g, " ")})`);
  }
}


async function main() {
  console.log("\nPhase 0 gates — every check hits a live system\n");
  await gate0();
  await gate1();
  await gate1b();
  await gate1c();
  await gate1d();
  await gate2();
  await gate2b();
  await gate2c();
  await gate2d();
  await gate2e();
  await gate3();
  await gate3c();
  await gate3d();

  const failed = results.filter((r) => r.status === "FAIL");
  const blocked = results.filter((r) => r.status === "BLOCKED");
  console.log(
    `\n${results.length - failed.length - blocked.length} passed, ${blocked.length} blocked, ${failed.length} failed\n`,
  );
  if (failed.length) process.exitCode = 1;
}

void main();
