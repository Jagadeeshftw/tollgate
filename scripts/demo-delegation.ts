/**
 * The ENS claim, demonstrated on chain rather than described.
 *
 *   pnpm ens:demo-delegation
 *
 * A service operator owns their listing and may reprice it or move its endpoint. They may **not**
 * change the account that gets paid. That is not enforced by our code — it is ENS Enhanced Access
 * Control refusing a transaction, and this script shows it refusing one.
 *
 * The operator here is a genuinely separate party (`OPERATOR_ADDRESS`), holding only the two keys
 * the registrar delegated at listing time. Run with the deployer instead and the demonstration is
 * worthless: the deployer holds root roles on the resolver and can edit anything.
 */
import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, http, namehash, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RESOLVER_ABI = parseAbi([
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
]);

const LABEL = process.env.DEMO_SERVICE ?? "curve-pools";

async function main() {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key) throw new Error("OPERATOR_PRIVATE_KEY must be set — see scripts/list-service.ts");

  const deployment = JSON.parse(readFileSync("deployments/ens-sepolia.json", "utf8")) as {
    parentName: string;
    resolver: Address;
  };
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const operator = privateKeyToAccount(key as `0x${string}`);
  const pub = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account: operator, chain: sepolia, transport: http(rpcUrl) });

  const name = `${LABEL}.${deployment.parentName}`;
  const node = namehash(name);
  const read = (k: string) =>
    pub.readContract({ address: deployment.resolver, abi: RESOLVER_ABI, functionName: "text", args: [node, k] });

  console.log(`\n${name}`);
  console.log(`operator ${operator.address}  (not the deployer — holds only delegated keys)\n`);

  // ── 1. repricing and re-pointing: delegated, so this must succeed ──────────
  const endpointBefore = await read("agent-endpoint[web]");
  const moved = `${endpointBefore.replace(/\/s\/.*$/, "")}/s/${LABEL}?v=2`;

  console.log("1. operator changes agent-endpoint[web]");
  console.log(`   from ${endpointBefore}`);
  const hash = await wallet.writeContract({
    address: deployment.resolver,
    abi: RESOLVER_ABI,
    functionName: "setText",
    args: [node, "agent-endpoint[web]", moved],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`   to   ${await read("agent-endpoint[web]")}`);
  console.log(`   ${receipt.status.toUpperCase()}  ${hash}\n`);

  // ── 2. redirecting payment: never delegated, so this must fail ─────────────
  const settlementBefore = await read("x402:settlement");
  console.log("2. same operator attempts x402:settlement");
  console.log(`   current ${settlementBefore}, attempting 0.0.999999`);

  let refused = false;
  try {
    // Simulated rather than sent: the revert is the result, and paying gas to have a node tell us
    // what it already told us adds nothing. This is the same call path the transaction takes.
    await pub.simulateContract({
      account: operator,
      address: deployment.resolver,
      abi: RESOLVER_ABI,
      functionName: "setText",
      args: [node, "x402:settlement", "0.0.999999"],
    });
  } catch (err) {
    refused = true;
    const message = (err as Error).message;
    const selector = /0x4b27a133/.test(message) ? "EACUnauthorizedAccountRoles" : "reverted";
    console.log(`   REFUSED by ENS Enhanced Access Control (${selector})`);
  }

  const settlementAfter = await read("x402:settlement");
  console.log(`   settlement still ${settlementAfter}\n`);

  if (!refused) throw new Error("the operator was NOT refused — the delegation is not doing its job");
  if (settlementAfter !== settlementBefore) throw new Error("settlement changed — this should be impossible");

  console.log("The operator can move their endpoint. They cannot move the money.");
  console.log("Enforced by ENS, not by us.\n");
}

void main().catch((err) => {
  console.error(`\ndemonstration failed: ${(err as Error)?.message ?? err}\n`);
  process.exitCode = 1;
});
