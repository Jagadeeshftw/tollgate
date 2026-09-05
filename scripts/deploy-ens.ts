/**
 * Register the parent name and stand up the registry on **real Sepolia**.
 *
 *   pnpm ens:deploy                 # dry run — checks everything, sends nothing
 *   pnpm ens:deploy --execute       # sends transactions
 *
 * This is the live counterpart of `verify-ens-fallback.ts`, which proved the same sequence works
 * against a fork of this deployment. Everything it does has already been exercised; what is new is
 * only that the transactions are real and the results are recorded in `deployments/`.
 *
 * Defaults to a dry run because the registration is not reversible and the name is the project's
 * public identifier.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  namehash,
  parseAbi,
  toHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { ENSV2_SEPOLIA as ENS } from "@tollgate/ens-config";

const OUT = "deployments/ens-sepolia.json";
const EXECUTE = process.argv.includes("--execute");
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
const DURATION = 365n * 24n * 3600n;

const REGISTRAR_ABI = parseAbi([
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
]);
const ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const FACTORY_ABI = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes initData) returns (address)",
]);
const REGISTRY_ABI = parseAbi([
  "function initialize(address rootAccount, uint256 roleBitmap)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
]);
const RESOLVER_ABI = parseAbi([
  "function initialize(address admin, uint256 roleBitmap, bytes[] setters)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function text(bytes32 node, string key) view returns (string)",
]);
const UR_ABI = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes, address)"]);

function dnsEncode(name: string): `0x${string}` {
  const bytes: number[] = [];
  for (const label of name.split(".")) bytes.push(label.length, ...Buffer.from(label, "utf8"));
  bytes.push(0);
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function artifact(name: string) {
  const j = JSON.parse(
    readFileSync(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8"),
  );
  return { abi: j.abi, bytecode: j.bytecode.object as `0x${string}` };
}

async function main() {
  const parentName = process.env.ENS_PARENT_NAME;
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!parentName?.endsWith(".eth")) throw new Error("ENS_PARENT_NAME must be set, e.g. tollgatehq.eth");
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY must be set");

  const label = parentName.slice(0, -".eth".length);
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const account = privateKeyToAccount(pk as `0x${string}`);
  const pub = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  console.log(`${EXECUTE ? "DEPLOYING" : "DRY RUN"} — parent "${parentName}", deployer ${account.address}`);

  // ---- preflight -----------------------------------------------------------
  const balance = await pub.getBalance({ address: account.address });
  console.log(`  gas balance   ${(Number(balance) / 1e18).toFixed(4)} SepoliaETH`);
  if (balance === 0n) throw new Error(`${account.address} has no Sepolia ETH — fund it first`);

  const available = await pub.readContract({
    address: ENS.ethRegistrar,
    abi: REGISTRAR_ABI,
    functionName: "isAvailable",
    args: [label],
  });
  console.log(`  "${label}" available: ${available}`);
  if (!available) {
    throw new Error(
      `"${parentName}" is not available on the live deployment. If it was registered through the ` +
        `ENS App, do not run this — the parent already exists and only the registry deploy is needed.`,
    );
  }

  const price = await pub.readContract({
    address: ENS.ethRegistrar,
    abi: REGISTRAR_ABI,
    functionName: "getRegisterPrice",
    args: [label, DURATION, ENS.mockUSDC],
  });
  console.log(`  one year costs ${price} MockUSDC (mintable on testnet — no real funds)`);

  if (!EXECUTE) {
    console.log("\nPreflight passed. Re-run with --execute to send transactions.");
    return;
  }

  const send = async (hash: `0x${string}`) => {
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`tx reverted: ${hash}`);
    return r;
  };

  // ---- 1. our subname registry, deployed before registration so the parent is never unattached
  const registry = await (async () => {
    const { result, request } = await pub.simulateContract({
      account,
      address: ENS.verifiableFactory,
      abi: FACTORY_ABI,
      functionName: "deployProxy",
      args: [
        ENS.userRegistryImpl,
        BigInt(keccak256(toHex(`${parentName}:registry`))),
        encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: "initialize",
          args: [account.address, ALL_ROLES],
        }),
      ],
    });
    await send(await wallet.writeContract(request));
    return result as Address;
  })();
  console.log(`  registry      ${registry}`);

  // ---- 2. register the parent, with the registry already attached
  await send(
    await wallet.writeContract({
      address: ENS.mockUSDC,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [account.address, price * 2n],
    }),
  );
  await send(
    await wallet.writeContract({
      address: ENS.mockUSDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ENS.ethRegistrar, price * 2n],
    }),
  );

  const secret = keccak256(toHex(`${parentName}:${Date.now()}`));
  const zeroAddr = "0x0000000000000000000000000000000000000000" as Address;
  const zeroBytes = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  const commitment = await pub.readContract({
    address: ENS.ethRegistrar,
    abi: REGISTRAR_ABI,
    functionName: "makeCommitment",
    args: [label, account.address, secret, registry, zeroAddr, DURATION, zeroBytes],
  });
  await send(
    await wallet.writeContract({
      address: ENS.ethRegistrar,
      abi: REGISTRAR_ABI,
      functionName: "commit",
      args: [commitment],
    }),
  );

  const minAge = await pub.readContract({
    address: ENS.ethRegistrar,
    abi: REGISTRAR_ABI,
    functionName: "MIN_COMMITMENT_AGE",
  });
  const waitMs = (Number(minAge) + 10) * 1000;
  console.log(`  waiting ${waitMs / 1000}s for the commitment to age…`);
  await new Promise((r) => setTimeout(r, waitMs));

  await send(
    await wallet.writeContract({
      address: ENS.ethRegistrar,
      abi: REGISTRAR_ABI,
      functionName: "register",
      args: [label, account.address, secret, registry, zeroAddr, DURATION, ENS.mockUSDC, zeroBytes],
    }),
  );
  console.log(`  registered    ${parentName}`);

  // ---- 3. resolver + registrar
  const resolver = await (async () => {
    const { result, request } = await pub.simulateContract({
      account,
      address: ENS.verifiableFactory,
      abi: FACTORY_ABI,
      functionName: "deployProxy",
      args: [
        ENS.permissionedResolverImpl,
        BigInt(keccak256(toHex(`${parentName}:resolver`))),
        encodeFunctionData({
          abi: RESOLVER_ABI,
          functionName: "initialize",
          args: [account.address, ALL_ROLES, []],
        }),
      ],
    });
    await send(await wallet.writeContract(request));
    return result as Address;
  })();
  console.log(`  resolver      ${resolver}`);

  const art = artifact("TollgateRegistrar");
  const registrar = (
    await send(
      await wallet.deployContract({
        abi: art.abi,
        bytecode: art.bytecode,
        args: [registry, resolver, dnsEncode(parentName), account.address],
      }),
    )
  ).contractAddress as Address;
  console.log(`  registrar     ${registrar}`);

  for (const [target, abi, fn] of [
    [registry, REGISTRY_ABI, "REQUIRED_REGISTRY_ROLES"],
    [resolver, RESOLVER_ABI, "REQUIRED_RESOLVER_ROLES"],
  ] as const) {
    const roles = (await pub.readContract({
      address: registrar,
      abi: art.abi,
      functionName: fn,
    })) as bigint;
    await send(
      await wallet.writeContract({ address: target, abi, functionName: "grantRootRoles", args: [roles, registrar] }),
    );
  }
  console.log(`  roles granted`);

  const record = {
    network: "sepolia",
    chainId: ENS.chainId,
    parentName,
    deployer: account.address,
    registry,
    resolver,
    registrar,
    rootRegistry: ENS.rootRegistry,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nwritten to ${OUT}`);
  console.log(`\nNext: list a service, then confirm it resolves publicly:`);
  console.log(`  cast call ${ENS.universalResolver} "resolve(bytes,bytes)" ...`);
}

void main().catch((err) => {
  console.error(`\ndeploy failed: ${(err as Error)?.message ?? err}\n`);
  process.exitCode = 1;
});
