import { createPublicClient, http, namehash, parseAbi, type Address, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

import type { Candidate } from "./types.js";

const REGISTRAR_ABI = parseAbi([
  "event ServiceListed(uint256 indexed tokenId, bytes32 indexed node, string label, address indexed operator, string endpoint, string price, string settlement, uint64 expiry)",
  "event ServiceRevoked(uint256 indexed tokenId, bytes32 indexed node, string label)",
]);

const RESOLVER_ABI = parseAbi(["function text(bytes32 node, string key) view returns (string)"]);

const KEYS = {
  context: "agent-context",
  endpoint: "agent-endpoint[web]",
  unitPrice: "x402:price",
  unit: "x402:unit",
  asset: "x402:asset",
  schema: "x402:schema",
} as const;

/** Where the agent finds services it could buy from. */
export interface Directory {
  list(): Promise<Candidate[]>;
}

export interface EnsDirectoryConfig {
  readonly rpcUrl: string;
  readonly registrarAddress: Address;
  readonly resolverAddress: Address;
  readonly parentName: string;
  readonly fromBlock?: bigint;
  /**
   * Additional endpoints to corroborate discovery against.
   *
   * Defaults to a small set of public Sepolia RPCs. Pass `[]` to disable — a forked devnet has one
   * node and corroboration there is meaningless.
   */
  readonly corroborateWith?: readonly string[];
  /**
   * Labels to check even if the event scan did not surface them.
   *
   * A hint about *where to look*, never a source of terms. Every hinted label is resolved through
   * the public ENS path exactly like a discovered one, and is dropped unless the resolver actually
   * holds a complete listing — so a stale entry here cannot conjure a service that is not on chain,
   * and a revoked one stays revoked. This exists only because `eth_getLogs` on public Sepolia
   * endpoints under-reports; `eth_call` against the resolver does not.
   */
  readonly knownLabels?: readonly string[];
}

/**
 * Public Sepolia endpoints used to cross-check the event scan.
 *
 * These are not fallbacks in the usual sense. A provider that answers `getLogs` from an
 * incompletely indexed node returns *fewer* events with no error at all, which is far more
 * dangerous than an outright failure: the catalogue silently shrinks and the agent reasons over a
 * marketplace that looks smaller than it is. Observed on 3 September — `publicnode` returned one
 * of three listings, repeatably, while the resolver held live records for all three.
 */
const CORROBORATING_RPCS: readonly string[] = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://1rpc.io/sepolia",
  "https://sepolia.gateway.tenderly.co",
];

/**
 * Discovers services from the registrar's own event log, then reads each one's terms off its ENS
 * name.
 *
 * @remarks
 * The agent is given no list of endpoints — it learns what exists by reading the chain, which is
 * the difference between a marketplace and a hardcoded integration. `ServiceListed` and
 * `ServiceRevoked` are replayed in order so a revoked listing disappears rather than lingering.
 *
 * Terms come from the resolver rather than from the event, deliberately: the event records what
 * was true at listing time, while the resolver records what is true now. An operator who has since
 * repriced should be quoted at their current price, and the event would quietly serve a stale one.
 */
export class EnsDirectory implements Directory {
  private readonly client: PublicClient;
  private readonly corroborators: readonly PublicClient[];

  constructor(private readonly config: EnsDirectoryConfig) {
    this.client = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl),
    });
    const extra = (config.corroborateWith ?? CORROBORATING_RPCS).filter((u) => u !== config.rpcUrl);
    this.corroborators = extra.map((url) =>
      createPublicClient({ chain: sepolia, transport: http(url, { timeout: 6_000 }) }),
    );
  }

  async list(): Promise<Candidate[]> {
    const fromBlock = this.config.fromBlock ?? 0n;
    this.scanFailure = undefined;

    const [listed, revoked] = await Promise.all([
      this.scan(REGISTRAR_ABI[0], fromBlock),
      this.scan(REGISTRAR_ABI[1], fromBlock),
    ]);

    const live = new Map<string, bigint>();
    for (const log of listed) {
      const label = log.args.label;
      const expiry = log.args.expiry;
      if (label) live.set(label, expiry ?? 0n);
    }
    for (const log of revoked) {
      if (log.args.label) live.delete(log.args.label);
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    const discovered = [...live.entries()]
      .filter(([, expiry]) => expiry > now)
      .map(([label]) => label);

    // Revocation is a fact about the chain and outranks any hint.
    const revokedLabels = new Set(revoked.map((l) => l.args.label).filter(Boolean) as string[]);
    const hinted = (this.config.knownLabels ?? []).filter(
      (l) => !discovered.includes(l) && !revokedLabels.has(l),
    );

    const labels = [...discovered, ...hinted];
    const candidates = await Promise.all(labels.map((label) => this.read(label)));
    const found = candidates.filter((c): c is Candidate => c !== null);

    // Surfaced rather than swallowed: if the log scan under-reported, the operator needs to know
    // the RPC is lying, and the UI needs to be able to say so instead of showing a smaller market.
    const recovered = found.filter((c) => hinted.includes(c.label)).map((c) => c.label);
    this.lastScan = {
      fromLogs: discovered.length,
      recovered,
      ...(this.scanFailure ? { scanFailed: this.scanFailure } : {}),
    };
    if (this.scanFailure) {
      console.warn(
        `[directory] every endpoint failed the log query (${this.scanFailure}); the catalogue was ` +
          `rebuilt from resolver records alone`,
      );
    }
    if (recovered.length) {
      console.warn(
        `[directory] ${recovered.length} listing(s) missing from the event scan and recovered by ` +
          `resolver read: ${recovered.join(", ")} — this RPC is returning incomplete logs`,
      );
    }

    return found;
  }

  /** How the most recent `list()` was assembled. Read by the UI to report incomplete discovery. */
  lastScan: { fromLogs: number; recovered: string[]; scanFailed?: string } = {
    fromLogs: 0,
    recovered: [],
  };

  /** Set when every endpoint failed the log query; cleared at the start of each `list()`. */
  private scanFailure: string | undefined;

  /**
   * Read one event type from every endpoint and union the results.
   *
   * Union is the correct merge and not a hopeful one: these logs are append-only facts, so an
   * endpoint can only ever be missing events, never inventing them — and a label that somehow
   * arrived spuriously still has to survive `read()`, which requires live resolver records. One
   * endpoint answering is enough; all of them failing is a real error and is raised as one, because
   * an empty catalogue rendered as "no services" would be indistinguishable from a marketplace
   * nobody has listed on.
   */
  private async scan<E extends (typeof REGISTRAR_ABI)[number]>(
    event: E,
    fromBlock: bigint,
  ): Promise<{ args: { label?: string; expiry?: bigint } }[]> {
    const query = (client: PublicClient) =>
      client.getLogs({
        address: this.config.registrarAddress,
        event,
        fromBlock,
        toBlock: "latest",
      });

    // The primary must answer. Corroborators are opportunistic and race a hard deadline: they
    // exist to catch an under-reporting primary, and an endpoint that has not replied in three
    // seconds is not worth making a judge wait for. Without this the rail took 25s to paint.
    const CORROBORATION_BUDGET_MS = 3_000;
    const opportunistic = this.corroborators.map((c) =>
      Promise.race([
        query(c),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("corroboration deadline")), CORROBORATION_BUDGET_MS),
        ),
      ]),
    );

    const settled = await Promise.allSettled([query(this.client), ...opportunistic]);

    const ok = settled.filter((r) => r.status === "fulfilled");
    if (ok.length === 0) {
      // Zero events, not a fatal error.
      //
      // A total log-scan failure used to abort discovery outright, which threw away a catalogue the
      // resolver could still have rebuilt: `eth_getLogs` and `eth_call` fail independently, and an
      // endpoint that errors on the former while serving the latter is exactly the case worth
      // surviving. If the resolver is genuinely unreachable too, `read()` below still throws and the
      // caller still learns the catalogue is unavailable — so this widens availability without
      // hiding an outage.
      this.scanFailure =
        settled
          .map((r) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : ""))
          .find(Boolean) ?? "every endpoint failed the log query";
      return [];
    }

    // Keyed by transaction hash and log index so the same event from two providers merges to one.
    const merged = new Map<string, { args: { label?: string; expiry?: bigint } }>();
    for (const r of ok) {
      for (const log of r.value) {
        merged.set(`${log.transactionHash}:${log.logIndex}`, log as never);
      }
    }
    return [...merged.values()];
  }

  private async read(label: string): Promise<Candidate | null> {
    const name = `${label}.${this.config.parentName}`;
    const node = namehash(name);
    const keys = Object.values(KEYS);

    const results = await this.client.multicall({
      contracts: keys.map((key) => ({
        address: this.config.resolverAddress,
        abi: RESOLVER_ABI,
        functionName: "text" as const,
        args: [node, key] as const,
      })),
      allowFailure: true,
    });

    const record: Record<string, string> = {};
    Object.keys(KEYS).forEach((field, i) => {
      const r = results[i];
      record[field] = r?.status === "success" ? (r.result as string) : "";
    });

    // A listing missing what an agent needs to transact is not a candidate. Dropping it here means
    // one broken listing costs the agent an option, not the whole question.
    if (!record.endpoint || !record.unitPrice || !record.unit) return null;

    return {
      label,
      name,
      context: record.context ?? "",
      endpoint: record.endpoint,
      unitPrice: record.unitPrice,
      unit: record.unit,
      asset: record.asset || "0.0.0",
      schema: record.schema ?? "",
    };
  }
}
