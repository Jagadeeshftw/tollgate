import { createPublicClient, http, namehash, parseAbi, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

import {
  IncompleteListingError,
  type Listing,
  type Listings,
  UnknownServiceError,
} from "./listing.js";

/** The subset of `PermissionedResolver` we read. */
const RESOLVER_ABI = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
]);

/** Record keys, mirroring `TollgateRecordsLib`. Keep the two in step. */
const KEY = {
  context: "agent-context",
  endpoint: "agent-endpoint[web]",
  unitPrice: "x402:price",
  unit: "x402:unit",
  settlement: "x402:settlement",
  network: "x402:network",
  asset: "x402:asset",
  schema: "x402:schema",
} as const;

/** Fields without which an agent cannot transact. `schema` and `context` are informational. */
const REQUIRED = ["endpoint", "unitPrice", "unit", "settlement", "network"] as const;

export interface OnChainListingsConfig {
  readonly rpcUrl: string;
  readonly resolverAddress: `0x${string}`;
  /** Parent name the services live under, e.g. "tollgate.eth". */
  readonly parentName: string;
  /** How long a resolved listing may be reused. */
  readonly cacheTtlMs?: number;
}

interface CacheEntry {
  readonly listing: Listing | null;
  readonly expiresAt: number;
}

/**
 * Reads listings from the ENS resolver on Sepolia.
 *
 * @remarks
 * Records are read straight from the service's own `PermissionedResolver` by namehash. Once the
 * parent name is attached to our registry this should move to `UniversalResolverV2`, so that
 * discovery goes through the same public resolution path any other ENS client would use rather
 * than through an address we happen to know. That switch is blocked on acquiring the parent name
 * — see spec/PHASE-0-GATES.md — and is deliberately isolated to this class.
 */
export class OnChainListings implements Listings {
  private readonly client: PublicClient;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttl: number;

  constructor(private readonly config: OnChainListingsConfig) {
    this.client = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl),
    });
    // Short by design. A price is a live record the operator may change at any moment, so caching
    // it for long enough to be convenient is caching it for long enough to quote a stale price and
    // then charge a different one.
    this.ttl = config.cacheTtlMs ?? 15_000;
  }

  async resolve(label: string): Promise<Listing | null> {
    const cached = this.cache.get(label);
    if (cached && cached.expiresAt > Date.now()) return cached.listing;

    const listing = await this.read(label);
    this.cache.set(label, { listing, expiresAt: Date.now() + this.ttl });
    return listing;
  }

  private async read(label: string): Promise<Listing | null> {
    const node = namehash(`${label}.${this.config.parentName}`);

    const keys = Object.values(KEY);
    const values = await this.client.multicall({
      contracts: keys.map((key) => ({
        address: this.config.resolverAddress,
        abi: RESOLVER_ABI,
        functionName: "text" as const,
        args: [node, key] as const,
      })),
      allowFailure: true,
    });

    const record: Record<string, string> = {};
    Object.keys(KEY).forEach((field, i) => {
      const result = values[i];
      record[field] = result?.status === "success" ? (result.result as string) : "";
    });

    // An unregistered name and a registered-but-empty one are indistinguishable at the resolver,
    // since ENS returns "" for both. Treating a wholly empty record as "not found" is the honest
    // reading; a partially filled one is a real listing that is broken, which is a different
    // failure and deserves a different error.
    if (Object.values(record).every((v) => v === "")) return null;

    const missing = REQUIRED.filter((field) => !record[field]);
    if (missing.length > 0) throw new IncompleteListingError(label, missing);

    return {
      context: record.context ?? "",
      endpoint: record.endpoint ?? "",
      unitPrice: record.unitPrice ?? "",
      unit: record.unit ?? "",
      settlement: record.settlement ?? "",
      network: record.network ?? "",
      asset: record.asset ?? "",
      schema: record.schema ?? "",
    };
  }
}

/** Resolve or throw — most call sites want a listing, not a null. */
export async function requireListing(listings: Listings, label: string): Promise<Listing> {
  const listing = await listings.resolve(label);
  if (!listing) throw new UnknownServiceError(label);
  return listing;
}
