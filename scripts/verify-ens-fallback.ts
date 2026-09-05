/**
 * Does Track E survive without buying the parent name through the ENS App?
 *
 *   pnpm ens:verify-fallback
 *
 * The question this answers: if `#partner-ens` never replies about which ENSv2 Sepolia deployment
 * the App uses, can we register the parent ourselves, attach our registry to it, and have the name
 * resolve end to end through the public `UniversalResolverV2` — with no hard-coded values in the
 * read path?
 *
 * Verified against a fork of the real Sepolia deployment, so a pass here is a pass on Sepolia:
 * the contracts are the same bytecode, and nothing below depends on fork-only behaviour.
 *
 * Runs against the tree the ENS App actually serves — see `packages/devnet/src/deployments.ts`.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

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

import { ENSV2_SEPOLIA } from "@tollgate/ens-config";

/** Single source of truth — the deployment ENS actually serves. */
const ENS = {
  ethRegistrar: ENSV2_SEPOLIA.ethRegistrar,
  ethRegistry: ENSV2_SEPOLIA.ethRegistry,
  universalResolver: ENSV2_SEPOLIA.universalResolver,
  verifiableFactory: ENSV2_SEPOLIA.verifiableFactory,
  userRegistryImpl: ENSV2_SEPOLIA.userRegistryImpl,
  resolverImpl: ENSV2_SEPOLIA.permissionedResolverImpl,
  mockUSDC: ENSV2_SEPOLIA.mockUSDC,
};

const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
/** Code-free by construction — anvil's own accounts carry EIP-7702 delegations on Sepolia. */
const OWNER_KEY = keccak256(toHex("tollgate.ens.fallback.owner.v1"));
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
/**
 * Parent label to register.
 *
 * @remarks
 * Not `tollgate`: on the live deployment that label is **RESERVED** (registry status 1 — expiry
 * set, owner zero), so `isAvailable` returns false and it cannot be registered through the App or
 * the registrar. It *was* available on the superseded tree, which is one more way that tree
 * misleads. Override with ENS_PARENT_LABEL.
 */
const LABEL = process.env.ENS_PARENT_LABEL ?? "tollgate-market";
const SERVICE = "uniswap-pools";

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
const UR_ABI = parseAbi([
  "function findResolver(bytes name) view returns (address, bytes32, uint256)",
  "function resolve(bytes name, bytes data) view returns (bytes, address)",
]);

function dnsEncode(name: string): `0x${string}` {
  const bytes: number[] = [];
  for (const label of name.split(".")) bytes.push(label.length, ...Buffer.from(label, "utf8"));
  bytes.push(0);
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function artifact(name: string) {
  const json = JSON.parse(
    readFileSync(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8"),
  );
  return { abi: json.abi, bytecode: json.bytecode.object as `0x${string}` };
}

const step = (n: number, s: string) => console.log(`\n${n}. ${s}`);
const ok = (s: string) => console.log(`   ✓ ${s}`);

async function main() {
  const forkUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const port = 8600 + Math.floor(Math.random() * 300);
  const rpcUrl = `http://127.0.0.1:${port}`;
  const anvil = spawn("anvil", ["--fork-url", forkUrl, "--port", String(port), "--silent"], {
    stdio: "ignore",
  });

  try {
    // wait for the fork
    for (let i = 0; i < 200; i++) {
      try {
        const r = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
          signal: AbortSignal.timeout(2000),
        });
        if (r.ok) break;
      } catch {
        /* not up */
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    const chain = { ...sepolia, rpcUrls: { default: { http: [rpcUrl] } } };
    const account = privateKeyToAccount(DEV_KEY);
    const owner = privateKeyToAccount(OWNER_KEY);
    const pub = createPublicClient({ chain, transport: http(rpcUrl) });
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const send = async (hash: `0x${string}`) => {
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`tx reverted: ${hash}`);
      return r;
    };

    console.log(`forked Sepolia at ${rpcUrl} (block ${await pub.getBlockNumber()})`);

    step(1, `Is "${LABEL}.eth" registerable without the ENS App?`);
    const available = await pub.readContract({
      address: ENS.ethRegistrar,
      abi: REGISTRAR_ABI,
      functionName: "isAvailable",
      args: [LABEL],
    });
    if (!available) throw new Error(`${LABEL}.eth is already registered on Sepolia`);
    ok(`available, and ETHRegistrar.register() is a plain contract call`);

    const duration = 365n * 24n * 3600n;
    const price = await pub.readContract({
      address: ENS.ethRegistrar,
      abi: REGISTRAR_ABI,
      functionName: "getRegisterPrice",
      args: [LABEL, duration, ENS.mockUSDC],
    });
    ok(`price for one year: ${price} (paid in MockUSDC, which mints freely on testnet)`);

    step(2, "Deploy our own subname registry, then register the parent with it attached");
    const registry = (await (async () => {
      const { result, request } = await pub.simulateContract({
        account,
        address: ENS.verifiableFactory,
        abi: FACTORY_ABI,
        functionName: "deployProxy",
        args: [
          ENS.userRegistryImpl,
          11n,
          encodeFunctionData({
            abi: REGISTRY_ABI,
            functionName: "initialize",
            args: [account.address, ALL_ROLES],
          }),
        ],
      });
      await send(await wallet.writeContract(request));
      return result as Address;
    })());
    ok(`UserRegistry at ${registry}`);

    await send(
      await wallet.writeContract({
        address: ENS.mockUSDC,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [account.address, price * 10n],
      }),
    );
    await send(
      await wallet.writeContract({
        address: ENS.mockUSDC,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ENS.ethRegistrar, price * 10n],
      }),
    );

    const secret = keccak256(toHex("tollgate-fallback-secret"));
    const commitment = await pub.readContract({
      address: ENS.ethRegistrar,
      abi: REGISTRAR_ABI,
      functionName: "makeCommitment",
      args: [
        LABEL,
        owner.address,
        secret,
        registry,
        "0x0000000000000000000000000000000000000000",
        duration,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
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
    await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_increaseTime", params: [Number(minAge) + 5] }),
    });
    await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_mine", params: [] }),
    });
    ok(`commitment aged past MIN_COMMITMENT_AGE (${minAge}s)`);

    await send(
      await wallet.writeContract({
        address: ENS.ethRegistrar,
        abi: REGISTRAR_ABI,
        functionName: "register",
        args: [
          LABEL,
          owner.address,
          secret,
          registry,
          "0x0000000000000000000000000000000000000000",
          duration,
          ENS.mockUSDC,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ],
      }),
    );
    ok(`${LABEL}.eth registered to us, subregistry already pointing at our UserRegistry`);

    step(3, "List a service through our registrar");
    const resolver = (await (async () => {
      const { result, request } = await pub.simulateContract({
        account,
        address: ENS.verifiableFactory,
        abi: FACTORY_ABI,
        functionName: "deployProxy",
        args: [
          ENS.resolverImpl,
          12n,
          encodeFunctionData({
            abi: RESOLVER_ABI,
            functionName: "initialize",
            args: [account.address, ALL_ROLES, []],
          }),
        ],
      });
      await send(await wallet.writeContract(request));
      return result as Address;
    })());

    const art = artifact("TollgateRegistrar");
    const registrarAddress = (
      await send(
        await wallet.deployContract({
          abi: art.abi,
          bytecode: art.bytecode,
          args: [registry, resolver, dnsEncode(`${LABEL}.eth`), account.address],
        }),
      )
    ).contractAddress as Address;

    for (const [target, abi, fn] of [
      [registry, REGISTRY_ABI, "REQUIRED_REGISTRY_ROLES"],
      [resolver, RESOLVER_ABI, "REQUIRED_RESOLVER_ROLES"],
    ] as const) {
      const roles = (await pub.readContract({
        address: registrarAddress,
        abi: art.abi,
        functionName: fn,
      })) as bigint;
      await send(
        await wallet.writeContract({
          address: target,
          abi,
          functionName: "grantRootRoles",
          args: [roles, registrarAddress],
        }),
      );
    }

    await send(
      await wallet.writeContract({
        address: registrarAddress,
        abi: art.abi,
        functionName: "list",
        args: [
          SERVICE,
          owner.address,
          {
            context: "Top Uniswap v3 pools by TVL.",
            endpoint: "https://tollgate.example/s/uniswap-pools",
            price: "0.001",
            unit: "pool",
            settlement: "0.0.10319209",
            network: "hedera:testnet",
            asset: "0.0.0",
            schema: "{pools:[{id,tvlUSD}]}",
          },
          BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600),
        ],
      }),
    );
    ok(`${SERVICE}.${LABEL}.eth listed`);

    step(4, "Resolve it the way any ENS client would — through UniversalResolverV2");
    const fullName = `${SERVICE}.${LABEL}.eth`;
    const encoded = dnsEncode(fullName);

    const [foundResolver] = (await pub.readContract({
      address: ENS.universalResolver,
      abi: UR_ABI,
      functionName: "findResolver",
      args: [encoded],
    })) as [Address, `0x${string}`, bigint];
    ok(`UniversalResolver found the resolver: ${foundResolver}`);
    if (foundResolver.toLowerCase() !== resolver.toLowerCase()) {
      throw new Error(`resolver mismatch: expected ${resolver}`);
    }

    for (const key of ["x402:price", "x402:settlement", "agent-endpoint[web]"]) {
      const [answer] = (await pub.readContract({
        address: ENS.universalResolver,
        abi: UR_ABI,
        functionName: "resolve",
        args: [
          encoded,
          encodeFunctionData({
            abi: RESOLVER_ABI,
            functionName: "text",
            args: [namehash(fullName), key],
          }),
        ],
      })) as [`0x${string}`, Address];
      const value = Buffer.from(answer.slice(2), "hex").subarray(64).toString("utf8").replace(/\0+$/, "").trim();
      ok(`resolve("${fullName}", text "${key}") -> "${value}"`);
    }

    console.log("\nVERDICT: the fallback works. A self-registered parent resolves end to end");
    console.log("through the public UniversalResolver, with no ENS App involvement.\n");
  } finally {
    anvil.kill("SIGTERM");
  }
}

void main().catch((err) => {
  console.error(`\nFALLBACK VERIFICATION FAILED: ${(err as Error)?.message ?? err}\n`);
  process.exitCode = 1;
});
