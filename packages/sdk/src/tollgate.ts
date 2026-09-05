import { Budget, EnsDirectory, priceOf, toBaseUnits, type Candidate } from "@tollgate/agent";

import { HBAR, SEPOLIA_DEPLOYMENT, TINYBARS_PER_HBAR } from "./defaults.js";
import { CatalogueUnavailableError, ServiceNotFoundError, UnpriceableServiceError } from "./errors.js";
import { ServiceHandle } from "./service.js";

export interface HederaPayer {
  readonly accountId: string;
  /** ECDSA (secp256k1). An ED25519 key parses and then signs for no account. */
  readonly privateKey: string;
  readonly network?: string;
}

export interface TollgateOptions {
  /** Hedera account the SDK pays from. Omit to run discovery and quoting without a wallet. */
  readonly hedera?: HederaPayer;
  /** Total spend allowed across the lifetime of this instance, in HBAR. */
  readonly budget?: string;
  readonly parent?: string;
  readonly registrar?: string;
  readonly resolver?: string;
  readonly deployBlock?: number;
  readonly sepoliaRpc?: string;
  /** Extra endpoints to cross-check discovery against. Pass `[]` to disable. */
  readonly corroborateWith?: readonly string[];
  /**
   * Labels to resolve even when the event log does not surface them.
   *
   * Defaults to this deployment's own listings. Set it when running your own registrar; set `[]` to
   * rely on the event log alone, accepting that public endpoints under-report it without erroring.
   */
  readonly knownLabels?: readonly string[];
}

/** How the last `list()` was assembled — reported, because a shrinking catalogue must not be silent. */
export interface DiscoveryReport {
  readonly total: number;
  /** Listings the event log surfaced. */
  readonly fromLogs: number;
  /**
   * Listings the log scan missed that were recovered by reading their ENS records directly.
   *
   * Non-empty means the RPC returned an incomplete log result **without erroring**. The catalogue is
   * still correct; the endpoint is not. Public Sepolia endpoints do this routinely.
   */
  readonly recovered: readonly string[];
  /** Set when every endpoint failed the log query outright. */
  readonly scanFailed?: string;
}

/** A read-only view of what has been spent. */
export interface BudgetView {
  readonly limit: bigint;
  readonly spent: bigint;
  readonly remaining: bigint;
  readonly asset: string;
}

/**
 * Discover data services by ENS name and pay for them per call.
 *
 * @remarks
 * The division of labour is deliberate and is the whole point of the package: **the SDK owns
 * arithmetic, the caller owns judgment.** Pricing, affordability and budget enforcement live here
 * and are deterministic. *Which* service to buy from, and whether an answer is worth paying for,
 * stay with the caller.
 *
 * Consequently this package never calls a model and takes no model credentials. An agent that
 * reasons nothing like ours can still use it, which is the test of whether the split is real.
 *
 * @example
 * ```ts
 * const tollgate = new Tollgate({ hedera: { accountId, privateKey }, budget: "0.02" });
 * const svc = await tollgate.get("uniswap-pools");
 * const { costBaseUnits } = await svc.quote({ limit: 10 });   // never spends
 * const res = await svc.fetch({ limit: 10, maxAmount: "0.015" });
 * ```
 */
export class Tollgate {
  private readonly directory: EnsDirectory;
  private readonly budgetState: Budget;
  private discovery: DiscoveryReport = { total: 0, fromLogs: 0, recovered: [] };
  private cached?: ServiceHandle[];

  constructor(private readonly options: TollgateOptions = {}) {
    const parent = options.parent ?? SEPOLIA_DEPLOYMENT.parent;
    this.directory = new EnsDirectory({
      rpcUrl: options.sepoliaRpc ?? "https://ethereum-sepolia-rpc.publicnode.com",
      registrarAddress: (options.registrar ?? SEPOLIA_DEPLOYMENT.registrar) as `0x${string}`,
      resolverAddress: (options.resolver ?? SEPOLIA_DEPLOYMENT.resolver) as `0x${string}`,
      parentName: parent,
      fromBlock: BigInt(options.deployBlock ?? SEPOLIA_DEPLOYMENT.deployBlock),
      knownLabels: options.knownLabels ?? SEPOLIA_DEPLOYMENT.services,
      ...(options.corroborateWith ? { corroborateWith: options.corroborateWith } : {}),
    });
    this.budgetState = new Budget(
      options.budget ? toBaseUnits(options.budget, HBAR) : 0n,
      HBAR,
    );
  }

  /** What the SDK is allowed to spend, and what it has spent. */
  get budget(): BudgetView {
    return {
      limit: this.budgetState.limitBaseUnits,
      spent: this.budgetState.spent,
      remaining: this.budgetState.remaining,
      asset: this.budgetState.asset,
    };
  }

  /** How the most recent `list()` was assembled. */
  get lastDiscovery(): DiscoveryReport {
    return this.discovery;
  }

  /**
   * Every service currently listed under the parent name.
   *
   * Read from the chain — no endpoint list is supplied or cached. Listings whose ENS records the
   * resolver does not back are dropped, so a revoked or expired name cannot appear.
   */
  async list({ refresh = false }: { refresh?: boolean } = {}): Promise<ServiceHandle[]> {
    // Cached per instance. Discovery is several network calls and, on a flaky endpoint, is not
    // guaranteed to return the same set twice — `get()` disagreeing with the `list()` a caller just
    // read would be a worse bug than a stale catalogue.
    if (this.cached && !refresh) return this.cached;

    let candidates: Candidate[];
    try {
      candidates = await this.directory.list();
    } catch (err) {
      throw new CatalogueUnavailableError((err as Error)?.message ?? String(err));
    }
    const scan = this.directory.lastScan;
    this.discovery = {
      total: candidates.length,
      fromLogs: scan.fromLogs,
      recovered: scan.recovered,
      ...(scan.scanFailed ? { scanFailed: scan.scanFailed } : {}),
    };
    this.cached = candidates.map((c) => new ServiceHandle(c, this.budgetState, this.options.hedera));
    return this.cached;
  }

  /** One service by ENS label. Throws {@link ServiceNotFoundError} if the chain does not back it. */
  async get(label: string): Promise<ServiceHandle> {
    const services = await this.list();
    const found = services.find((s) => s.label === label);
    if (!found) throw new ServiceNotFoundError(label, services.map((s) => s.label));
    return found;
  }

  /**
   * Price every listed service at a given size, cheapest first, without contacting any of them.
   *
   * Pure arithmetic over the ENS records already read — it spends nothing and makes no request to a
   * service. This is the input a caller's own judgment layer should reason over.
   */
  async priceAll(units: number): Promise<{ service: ServiceHandle; costBaseUnits: bigint; affordable: boolean }[]> {
    const services = await this.list();
    const priced = services.map((service) => {
      let costBaseUnits: bigint;
      try {
        costBaseUnits = priceOf(service.candidate, units).costBaseUnits;
      } catch (err) {
        throw new UnpriceableServiceError(service.label, (err as Error)?.message ?? String(err));
      }
      return { service, costBaseUnits, affordable: this.budgetState.canAfford(costBaseUnits) };
    });
    return priced.sort((a, b) => (a.costBaseUnits < b.costBaseUnits ? -1 : 1));
  }
}

/** Convert a decimal HBAR string to tinybars. */
export function hbarToTinybars(amount: string): bigint {
  return toBaseUnits(amount, HBAR);
}

/** Render tinybars as a decimal HBAR string. */
export function tinybarsToHbar(tinybars: bigint): string {
  const whole = tinybars / TINYBARS_PER_HBAR;
  const frac = (tinybars % TINYBARS_PER_HBAR).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
