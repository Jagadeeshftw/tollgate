/**
 * List a service on the live deployment, through our own registrar.
 *
 *   pnpm ens:list                        # lists the two demo services
 *   pnpm ens:list --dry                  # preflight only
 *
 * Records the labels in `deployments/ens-sepolia.json` so `pnpm gates` can verify them by fresh
 * public resolution rather than by trusting this script's own output.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const OUT = "deployments/ens-sepolia.json";
const DRY = process.argv.includes("--dry");

interface Deployment {
  parentName: string;
  registrar: Address;
  registry: Address;
  resolver: Address;
  services?: string[];
}

function artifact(name: string) {
  const j = JSON.parse(
    readFileSync(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8"),
  );
  return j.abi;
}

/**
 * The demo catalogue.
 *
 * Two services, priced differently and scoped differently, because "which service?" is only a
 * decision when there is something to decide between. Endpoints are set from SERVICE_BASE_URL so
 * the same listings work against a local service or a hosted one without editing this file.
 */
function catalogue(settlement: string, base: string) {
  const common = { settlement, network: "hedera:testnet", asset: "0.0.0", unit: "pool" };
  return [
    {
      label: "uniswap-pools",
      listing: {
        ...common,
        context: "Top Uniswap v3 pools by TVL, live from The Graph. Uniswap only.",
        endpoint: `${base}/s/uniswap-pools`,
        price: "0.001",
        schema: "{pools:[{id,protocol,tvlUSD}]}",
      },
    },
    {
      label: "curve-pools",
      listing: {
        ...common,
        context: "Curve Finance pools by TVL, live from The Graph. Stableswap pools specifically.",
        endpoint: `${base}/s/curve-pools`,
        price: "0.002",
        schema: "{pools:[{id,protocol,tvlUSD}]}",
      },
    },
    {
      label: "dex-pools",
      listing: {
        ...common,
        context:
          "Pools across every indexed DEX under one standardized schema. Use when the question " +
          "spans protocols rather than naming one.",
        endpoint: `${base}/s/dex-pools`,
        price: "0.003",
        schema: "{pools:[{id,protocol,tvlUSD}]}",
      },
    },
  ];
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY must be set");

  const deployment = JSON.parse(readFileSync(OUT, "utf8")) as Deployment;
  const settlement = (
    JSON.parse(readFileSync("deployments/hedera-testnet.json", "utf8")) as { settlementAccount: string }
  ).settlementAccount;
  const base = process.env.SERVICE_BASE_URL ?? "http://127.0.0.1:8402";

  /**
   * Who owns the listed names.
   *
   * Defaults to the deployer for convenience, but the demo needs a *different* party: the
   * deployer holds root roles on the resolver, so it can edit any record and its inability to
   * change `x402:settlement` cannot be demonstrated. Set OPERATOR_ADDRESS to list on behalf of a
   * genuine third party holding only the two delegated keys.
   */
  const operator = (process.env.OPERATOR_ADDRESS ?? account.address) as `0x${string}`;

  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const account = privateKeyToAccount(pk as `0x${string}`);
  const pub = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const abi = artifact("TollgateRegistrar");

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
  const listed: string[] = [...(deployment.services ?? [])];

  for (const { label, listing } of catalogue(settlement, base)) {
    if (listed.includes(label)) {
      console.log(`already listed: ${label}.${deployment.parentName}`);
      continue;
    }
    console.log(
      `${DRY ? "would list" : "listing"} ${label}.${deployment.parentName} — ` +
        `${listing.price} HBAR / ${listing.unit}, operator ${operator}`,
    );
    if (DRY) continue;

    const { request } = await pub.simulateContract({
      account,
      address: deployment.registrar,
      abi,
      functionName: "list",
      args: [label, operator, listing, expiry],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
    if (receipt.status !== "success") throw new Error(`listing ${label} reverted`);
    if (!listed.includes(label)) listed.push(label);
    console.log(`  ✓ ${receipt.transactionHash}`);
  }

  if (!DRY) {
    writeFileSync(OUT, `${JSON.stringify({ ...deployment, services: listed }, null, 2)}\n`);
    console.log(`\nrecorded ${listed.length} service(s) in ${OUT}`);
  }
}

void main().catch((err) => {
  console.error(`\nlisting failed: ${(err as Error)?.message ?? err}\n`);
  process.exitCode = 1;
});
