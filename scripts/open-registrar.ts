/**
 * Roll the open registrar out onto the live deployment — or roll it back.
 *
 *   pnpm open-registrar                 # dry run: prints the plan, sends nothing
 *   pnpm open-registrar --execute       # deploy, grant roles, verify, record
 *   pnpm open-registrar --rollback      # revoke its roles and drop it from the record
 *
 * @remarks
 * Additive by construction. The open registrar mints into the **same** registry and writes to the
 * **same** resolver as the curated one, so nothing about the existing listings changes when it is
 * deployed, and nothing about them changes when it is rolled back. What the dashboard reads is
 * governed by one field in `deployments/ens-sepolia.json`: absent, discovery behaves exactly as it
 * did before this script existed.
 *
 * Rollback is two `revokeRootRoles` calls and deleting that field. The fork suite proves the
 * sequence against the live contracts before this ever runs (`test_rollbackShutsTheDoor…`).
 *
 * The deployer key is read from the environment and never printed.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { createPublicClient, createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RECORD = "deployments/ens-sepolia.json";
const ARTIFACT = "contracts/out/OpenTollgateRegistrar.sol/OpenTollgateRegistrar.json";
const EAC = parseAbi([
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
]);
const OPEN = parseAbi([
  "function REQUIRED_REGISTRY_ROLES() view returns (uint256)",
  "function REQUIRED_RESOLVER_ROLES() view returns (uint256)",
  "function PARENT_NODE() view returns (bytes32)",
  "function labelCount() view returns (uint256)",
]);
const CURATED = parseAbi(["function PARENT_NODE() view returns (bytes32)"]);

type Record = {
  parentName: string;
  registry: Address;
  resolver: Address;
  registrar: Address;
  openRegistrar?: Address;
  openRegistrarDeployBlock?: number;
  [k: string]: unknown;
};

async function main() {
  const execute = process.argv.includes("--execute");
  const rollback = process.argv.includes("--rollback");
  const key = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY must be set");

  const rpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const wallet = createWalletClient({ chain: sepolia, transport: http(rpc), account });
  const record = JSON.parse(readFileSync(RECORD, "utf8")) as Record;

  console.log(`deployer   ${account.address}`);
  console.log(`registry   ${record.registry}`);
  console.log(`resolver   ${record.resolver}`);
  console.log(`curated    ${record.registrar}  (untouched either way)`);
  console.log(`open       ${record.openRegistrar ?? "(not deployed)"}\n`);

  if (rollback) {
    const open = record.openRegistrar;
    if (!open) return console.log("nothing to roll back — no open registrar recorded");
    const [regRoles, resRoles] = await Promise.all([
      pub.readContract({ address: open, abi: OPEN, functionName: "REQUIRED_REGISTRY_ROLES" }),
      pub.readContract({ address: open, abi: OPEN, functionName: "REQUIRED_RESOLVER_ROLES" }),
    ]);
    if (!execute) {
      console.log("dry run — would revoke:");
      console.log(`  registry.revokeRootRoles(${regRoles}, ${open})`);
      console.log(`  resolver.revokeRootRoles(${resRoles}, ${open})`);
      console.log(`  and remove openRegistrar from ${RECORD}`);
      return console.log("\nre-run with --rollback --execute to send");
    }
    for (const [target, roles] of [[record.registry, regRoles], [record.resolver, resRoles]] as const) {
      const hash = await wallet.writeContract({ address: target, abi: EAC, functionName: "revokeRootRoles", args: [roles, open] });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`revoked on ${target}  tx ${hash}`);
    }
    delete record.openRegistrar;
    delete record.openRegistrarDeployBlock;
    writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);
    return console.log(`\nrolled back. ${RECORD} no longer names an open registrar.`);
  }

  if (record.openRegistrar) return console.log("already deployed — use --rollback first to replace it");

  const art = JSON.parse(readFileSync(ARTIFACT, "utf8")) as { abi: unknown[]; bytecode: { object: `0x${string}` } };
  const parentDns = `0x${Buffer.concat(
    record.parentName.split(".").map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])).concat([Buffer.from([0])]),
  ).toString("hex")}` as `0x${string}`;

  if (!execute) {
    console.log("dry run — would:");
    console.log(`  deploy OpenTollgateRegistrar(${record.registry}, ${record.resolver}, ${parentDns}, ${account.address})`);
    console.log(`  assert its PARENT_NODE equals the curated registrar's`);
    console.log(`  grant REQUIRED_REGISTRY_ROLES on the registry and REQUIRED_RESOLVER_ROLES on the resolver`);
    console.log(`  verify both with hasRoles, then record openRegistrar in ${RECORD}`);
    return console.log("\nre-run with --execute to send");
  }

  const hash = await wallet.deployContract({
    abi: art.abi,
    bytecode: art.bytecode.object,
    args: [record.registry, record.resolver, parentDns, account.address],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const open = receipt.contractAddress as Address;
  console.log(`deployed   ${open}  block ${receipt.blockNumber}`);

  // Refuse to grant anything if it would mint under a different parent than the curated registrar.
  const [openParent, curatedParent] = await Promise.all([
    pub.readContract({ address: open, abi: OPEN, functionName: "PARENT_NODE" }),
    pub.readContract({ address: record.registrar, abi: CURATED, functionName: "PARENT_NODE" }),
  ]);
  if (openParent !== curatedParent) throw new Error(`parent mismatch: ${openParent} vs ${curatedParent} — nothing granted`);

  const [regRoles, resRoles] = await Promise.all([
    pub.readContract({ address: open, abi: OPEN, functionName: "REQUIRED_REGISTRY_ROLES" }),
    pub.readContract({ address: open, abi: OPEN, functionName: "REQUIRED_RESOLVER_ROLES" }),
  ]);
  for (const [target, roles] of [[record.registry, regRoles], [record.resolver, resRoles]] as const) {
    const tx = await wallet.writeContract({ address: target, abi: EAC, functionName: "grantRootRoles", args: [roles, open] });
    await pub.waitForTransactionReceipt({ hash: tx });
    const held = await pub.readContract({ address: target, abi: EAC, functionName: "hasRoles", args: [0n, roles, open] });
    if (!held) throw new Error(`roles not held on ${target} after grant — roll back before retrying`);
    console.log(`granted on ${target}  tx ${tx}`);
  }

  record.openRegistrar = open;
  record.openRegistrarDeployBlock = Number(receipt.blockNumber);
  writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nrecorded in ${RECORD}. Rollback: pnpm open-registrar --rollback --execute`);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
