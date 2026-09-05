/**
 * Live Messari-standardized subgraphs on The Graph's decentralized network.
 *
 * @remarks
 * These implement the Messari **dex-amm** schema, which is the point: one query shape answers for
 * protocols whose AMM designs have nothing in common — Curve's stableswap, Uniswap V3's
 * concentrated liquidity, SushiSwap's constant product. No per-protocol adapter code exists in
 * this repo because none is needed.
 *
 * Discovery method, recorded because it is not obvious and is written up in `FEEDBACK/GRAPH.md`:
 * searching the registry by name finds nothing — no subgraph advertises "Messari" anywhere in its
 * metadata. These ids came from Messari's own `deployment/deployment.json`, then each was probed
 * for `dexAmmProtocols` (the schema's root entity, which only a standardized subgraph answers) and
 * checked for a current `_meta.block`. Ids alone prove nothing; the probe is what qualifies them.
 *
 * Verified live and at chain head on 1 September 2026.
 */
export interface StandardizedSubgraph {
  readonly key: string;
  readonly protocol: string;
  readonly chain: string;
  readonly subgraphId: string;
  /** Messari schema version. They differ across deployments — see `SCHEMA_DRIFT` below. */
  readonly schemaVersion: string;
}

export const DEX_SUBGRAPHS: readonly StandardizedSubgraph[] = [
  {
    key: "uniswap-v3",
    protocol: "Uniswap V3",
    chain: "ethereum",
    subgraphId: "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6",
    schemaVersion: "4.0.0",
  },
  {
    key: "curve",
    protocol: "Curve Finance",
    chain: "ethereum",
    subgraphId: "3fy93eAT56UJsRCEht8iFhfi6wjHWXtZ9dnnbQmvFopF",
    schemaVersion: "1.3.0",
  },
  {
    key: "sushiswap",
    protocol: "SushiSwap",
    chain: "ethereum",
    subgraphId: "77jZ9KWeyi3CJ96zkkj5s1CojKPHt6XJKjLFzsDCd8Fd",
    schemaVersion: "1.3.2",
  },
] as const;

/**
 * The honest caveat about the shared schema.
 *
 * Deployments sit on different schema versions (1.3.0 through 4.0.1), so "standardized" means the
 * core entities and field names agree — `dexAmmProtocols`, `liquidityPools`,
 * `totalValueLockedUSD`, `inputTokens` — not that every field exists everywhere. Our queries stay
 * inside the intersection deliberately. That is still a large win over three bespoke schemas, but
 * it is not the same as a single frozen contract, and claiming otherwise would overstate it.
 */
export const SCHEMA_DRIFT =
  "Messari dex-amm deployments range from schema 1.3.0 to 4.0.1; queries here use only the " +
  "entities and fields common to all of them.";

export function subgraphFor(key: string): StandardizedSubgraph | undefined {
  return DEX_SUBGRAPHS.find((s) => s.key === key);
}
