import type { Listing, Listings } from "../src/listing.js";

/**
 * An in-memory listing source for tests.
 *
 * @remarks
 * This substitutes for the *ENS round trip*, not for the data. It exists so that assertions about
 * the paywall's arithmetic and error handling do not depend on Sepolia being reachable or on a
 * particular name being registered. The service's real path is always `OnChainListings`; nothing
 * in `src/` can reach this class.
 */
export class InMemoryListings implements Listings {
  constructor(private readonly entries: Record<string, Listing>) {}

  async resolve(label: string): Promise<Listing | null> {
    return this.entries[label] ?? null;
  }
}

export const UNISWAP_POOLS: Listing = {
  context: "Top Uniswap v3 pools by TVL, sourced live from The Graph.",
  endpoint: "https://tollgate.example/s/uniswap-pools",
  unitPrice: "0.001",
  unit: "pool",
  settlement: "0.0.7326075",
  network: "hedera:testnet",
  asset: "0.0.0",
  schema: "{pools:[{id,token0,token1,tvlUSD}]}",
};
