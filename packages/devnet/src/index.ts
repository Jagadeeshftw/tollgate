/**
 * A disposable ENSv2 environment for end-to-end tests.
 *
 * Forks Sepolia with anvil, then deploys our resolver, our subname registry and our registrar
 * onto the fork and lists a service through them. The ENSv2 contracts are the real deployed
 * bytecode — the fork copies it from Sepolia — and the records are written by the real
 * `TollgateRegistrar`, so the read path the service exercises is a genuine on-chain resolution.
 *
 * **What this is not.** It is not the production deploy, and it never touches live Sepolia. The
 * parent name `tollgate.eth` is not owned by us, so this environment cannot attach the registry to
 * a real parent and public wildcard resolution is out of scope here. Acquiring that name is on
 * hold pending confirmation of which ENSv2 Sepolia deployment the ENS App beta uses — see
 * spec/PHASE-0-GATES.md. What is proven here is every seam between the registrar writing a price
 * and the service charging it; what is not is public discoverability of the name.
 */
import { spawn, type ChildProcess } from "node:child_process";
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

import { ENSV2_SEPOLIA as ENSV2 } from "@tollgate/ens-config";

export { ENSV2_SEPOLIA } from "@tollgate/ens-config";

/** anvil's first well-known dev account. Test-only; funded by the fork, not by us. */
const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/**
 * The account that owns the listed name, kept separate from the deployer.
 *
 * @remarks
 * It cannot be one of anvil's dev accounts. Their private keys are public, so on a real chain
 * people use them — and on Sepolia today both of the first two carry an EIP-7702 delegation
 * designator (`0xef0100…`). A forked chain inherits that code, `to.code.length > 0` becomes true,
 * and the registry's ERC1155 mint fails the receiver-acceptance check with
 * `ERC1155InvalidReceiver` — a revert with nothing obviously to do with tokens or ENS.
 *
 * Derived from a seed nobody else is using, and asserted code-free at startup.
 */
const OPERATOR_KEY = keccak256(toHex("tollgate.e2e.operator.v1"));

const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;

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

function artifact(name: string) {
  // this file lives at packages/devnet/src/, artifacts at <repo>/contracts/out/
  const path = `../../../contracts/out/${name}.sol/${name}.json`;
  const json = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode.object as `0x${string}` };
}

export interface Devnet {
  readonly rpcUrl: string;
  readonly resolverAddress: Address;
  readonly registrarAddress: Address;
  readonly parentName: string;
  /**
   * Block the registrar was deployed in.
   *
   * Event queries must start here, not at 0: a fork serves pre-fork blocks by proxying the
   * upstream RPC, and asking for the full range trips its block-range cap (anvil surfaces this as
   * "exceed maximum block range: 50000"). The registrar cannot have events before it existed, so
   * this is both the correct and the only workable lower bound. The same applies on a real chain,
   * where scanning from genesis is merely slow rather than rejected.
   */
  readonly deployBlock: bigint;
  stop(): Promise<void>;
}

export interface ServiceListing {
  context: string;
  endpoint: string;
  price: string;
  unit: string;
  settlement: string;
  network: string;
  asset: string;
  schema: string;
}

async function waitForRpc(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`anvil did not become ready at ${url}`);
}

export interface DevnetListing {
  readonly label: string;
  readonly listing: ServiceListing;
}

export async function startDevnet(options: {
  forkUrl: string;
  parentName: string;
  /** Every service to list. More than one is what makes "which service?" a real choice. */
  listings: readonly DevnetListing[];
  port?: number;
}): Promise<Devnet> {
  const port = options.port ?? 8545 + Math.floor(Math.random() * 1000);
  const rpcUrl = `http://127.0.0.1:${port}`;

  const anvil: ChildProcess = spawn(
    "anvil",
    ["--fork-url", options.forkUrl, "--port", String(port), "--silent"],
    { stdio: "ignore" },
  );
  const stop = async () => {
    anvil.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 150));
  };

  try {
    await waitForRpc(rpcUrl);

    const account = privateKeyToAccount(DEV_KEY);
    const operator = privateKeyToAccount(OPERATOR_KEY);
    const chain = { ...sepolia, rpcUrls: { default: { http: [rpcUrl] } } };
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

    // Fail loudly and specifically if the token recipient has code — see OPERATOR_KEY.
    const operatorCode = await publicClient.getCode({ address: operator.address });
    if (operatorCode && operatorCode !== "0x") {
      throw new Error(
        `e2e operator ${operator.address} has code on the forked chain (${operatorCode.slice(0, 12)}…), ` +
          `so the registry's ERC1155 mint will fail its receiver check. Change OPERATOR_KEY.`,
      );
    }

    const send = async (hash: `0x${string}`) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
      return receipt;
    };

    /** deployProxy returns an address; simulate to read it, then execute. */
    const deployProxy = async (impl: Address, salt: bigint, initData: `0x${string}`) => {
      const { result, request } = await publicClient.simulateContract({
        account,
        address: ENSV2.verifiableFactory,
        abi: FACTORY_ABI,
        functionName: "deployProxy",
        args: [impl, salt, initData],
      });
      await send(await wallet.writeContract(request));
      return result as Address;
    };

    const resolverAddress = await deployProxy(
      ENSV2.permissionedResolverImpl,
      1n,
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: "initialize",
        args: [account.address, ALL_ROLES, []],
      }),
    );

    const registryAddress = await deployProxy(
      ENSV2.userRegistryImpl,
      2n,
      encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "initialize",
        args: [account.address, ALL_ROLES],
      }),
    );

    // Our registrar, deployed from the same artifact the Foundry suite tests.
    const registrar = artifact("TollgateRegistrar");
    const parentDns = dnsEncode(options.parentName);
    const deployHash = await wallet.deployContract({
      abi: registrar.abi,
      bytecode: registrar.bytecode,
      args: [registryAddress, resolverAddress, parentDns, account.address],
    });
    const deployReceipt = await send(deployHash);
    const registrarAddress = deployReceipt.contractAddress as Address;
    const deployBlock = deployReceipt.blockNumber;

    // Exactly the roles the registrar declares it needs — read from the contract, not hardcoded.
    const required = async (fn: "REQUIRED_REGISTRY_ROLES" | "REQUIRED_RESOLVER_ROLES") =>
      (await publicClient.readContract({
        address: registrarAddress,
        abi: registrar.abi,
        functionName: fn,
      })) as bigint;

    await send(
      await wallet.writeContract({
        address: registryAddress,
        abi: REGISTRY_ABI,
        functionName: "grantRootRoles",
        args: [await required("REQUIRED_REGISTRY_ROLES"), registrarAddress],
      }),
    );
    await send(
      await wallet.writeContract({
        address: resolverAddress,
        abi: RESOLVER_ABI,
        functionName: "grantRootRoles",
        args: [await required("REQUIRED_RESOLVER_ROLES"), registrarAddress],
      }),
    );

    // List each service through the real registrar — this is what writes the price records.
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
    for (const { label, listing } of options.listings) {
      await send(
        await wallet.writeContract({
          address: registrarAddress,
          abi: registrar.abi,
          functionName: "list",
          args: [label, operator.address, listing, expiry],
        }),
      );

      // Sanity: the record really is on chain and readable by an outside caller.
      const price = await publicClient.readContract({
        address: resolverAddress,
        abi: RESOLVER_ABI,
        functionName: "text",
        args: [namehash(`${label}.${options.parentName}`), "x402:price"],
      });
      if (price !== listing.price) {
        throw new Error(`registrar wrote "${price}" for ${label}, expected "${listing.price}"`);
      }
    }

    return {
      rpcUrl,
      resolverAddress,
      registrarAddress,
      parentName: options.parentName,
      deployBlock,
      stop,
    };
  } catch (err) {
    await stop();
    throw err;
  }
}

/** DNS wire format: each label length-prefixed, terminated by a root byte. */
export function dnsEncode(name: string): `0x${string}` {
  const bytes: number[] = [];
  for (const label of name.split(".")) {
    bytes.push(label.length, ...Buffer.from(label, "utf8"));
  }
  bytes.push(0);
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

/**
 * Reserve a free TCP port.
 *
 * @remarks
 * Demos and e2e runs used to hardcode a service port. When a previous run had not shut down
 * cleanly, the new run's `listen` failed on a socket nobody was checking, and the agent
 * cheerfully talked to the *old* service — which pointed at a dead fork, so every request 404'd
 * and the failure looked like a bug in the agent. Choosing a free port removes the collision, and
 * `listenOrFail` below makes any remaining conflict loud instead of silent.
 */
export async function freePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("could not determine a free port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

/** Listen, or reject with a message that names the actual problem. */
export async function listenOrFail<T extends { listen: (...args: never[]) => unknown }>(
  app: T,
  port: number,
  what: string,
): Promise<import("node:http").Server> {
  return new Promise((resolve, reject) => {
    const server = (app as unknown as { listen: (p: number, cb: () => void) => import("node:http").Server }).listen(
      port,
      () => resolve(server),
    );
    server.once("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "EADDRINUSE"
          ? new Error(
              `${what} could not bind port ${port} — something else is already listening. ` +
                `A previous run may not have shut down; check with: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
            )
          : err,
      );
    });
  });
}
