import { DEX_SUBGRAPHS, subgraphFor, type StandardizedSubgraph } from "./subgraphs.js";

const GATEWAY = process.env.GRAPH_GATEWAY_URL ?? "https://gateway.thegraph.com/api";

export class GraphAuthError extends Error {
  constructor() {
    super("GRAPH_API_KEY is not set — live Graph data is mandatory, there is no offline mode");
    this.name = "GraphAuthError";
  }
}

export class GraphQueryError extends Error {
  constructor(readonly subgraph: string, message: string) {
    super(`${subgraph}: ${message}`);
    this.name = "GraphQueryError";
  }
}

/** One pool, in the shape the Messari dex-amm schema defines. */
export interface Pool {
  readonly id: string;
  readonly name: string;
  readonly protocol: string;
  readonly chain: string;
  readonly tokens: readonly string[];
  readonly totalValueLockedUSD: string;
  readonly cumulativeVolumeUSD: string;
}

/** A pool whose own figures contradict each other. Reported, never silently dropped. */
export interface ExcludedPool extends Pool {
  readonly reason: string;
}

/**
 * How far a pool's reported TVL may exceed the volume that has ever traded through it.
 *
 * @remarks
 * This subgraph reports badly wrong TVL for pools holding tokens with unusual decimals, and
 * because the schema's natural ranking is `orderBy: totalValueLockedUSD`, those pools sort to the
 * top and bury the real ones. Concretely, at the time of writing:
 *
 *   WETH/YES     TVL $9.45e10   lifetime volume $5.13e5     <- ratio 184,000x, nonsense
 *   USDC/WETH    TVL $1.08e8    lifetime volume $6.05e11    <- ratio 0.0002, obviously real
 *
 * The test is **internal to the data**, not a judgement about which tokens matter: a pool cannot
 * plausibly hold far more value than has ever traded through it over its entire life. Real pools
 * sit orders of magnitude the other side of this line, so the threshold is not delicate.
 *
 * Chosen over an absolute dollar bound because that would encode an opinion about how large DeFi
 * is, and would need revisiting; this compares two fields the subgraph itself publishes.
 */
export const MAX_TVL_TO_VOLUME_RATIO = 10;

/**
 * Decide whether a pool's own figures contradict each other.
 *
 * Extracted from the query path so the rule can be exercised directly — it decides what a caller
 * sees in a ranking they paid for, which is too consequential to be reachable only through a
 * network round trip.
 *
 * @returns the reason it is not credible, or `null` when the figures are consistent.
 */
export function implausibilityOf(pool: {
  totalValueLockedUSD: string;
  cumulativeVolumeUSD: string;
}): string | null {
  const tvl = Number(pool.totalValueLockedUSD);
  const volume = Number(pool.cumulativeVolumeUSD);

  // A pool that has never traded cannot be judged this way; leave it in and let the caller see it.
  if (!Number.isFinite(tvl) || !Number.isFinite(volume) || volume <= 0) return null;
  if (tvl / volume <= MAX_TVL_TO_VOLUME_RATIO) return null;

  return (
    `reported TVL $${tvl.toExponential(2)} is ${Math.round(tvl / volume).toLocaleString("en-US")}x ` +
    `its lifetime traded volume of $${volume.toExponential(2)} — the TVL figure is not credible`
  );
}

export interface PoolQueryResult {
  readonly pools: readonly Pool[];
  /**
   * Set when fewer plausible pools were found than were paid for.
   *
   * A caller who buys ten pools and receives four is entitled to know that happened, and why.
   * Silently returning a short list would look like the protocol has fewer pools than it does.
   */
  readonly shortfall?: { asked: number; returned: number; because: string };
  /**
   * Pools removed from the ranking because their own reported figures are inconsistent.
   *
   * Kept and returned rather than dropped, for the same reason the agent's excluded plans are
   * shown: a caller is entitled to see what was taken out of a ranking they asked for, and why.
   */
  readonly excluded: readonly ExcludedPool[];
  /** Which subgraphs answered, and at what block — provenance, so an answer can be checked. */
  readonly sources: readonly { protocol: string; subgraphId: string; block: number }[];
}

/**
 * The one query, used unchanged against every protocol.
 *
 * @remarks
 * This string is the whole Track C argument in concrete form. It is not parameterised per
 * protocol, and there is no adapter layer beneath it: Curve, Uniswap V3 and SushiSwap answer the
 * same field selection because they publish the same standardized schema, despite being three
 * unrelated AMM designs.
 */
const POOLS_QUERY = `
  query Pools($first: Int!) {
    _meta { block { number } }
    dexAmmProtocols { name slug schemaVersion }
    liquidityPools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      name
      totalValueLockedUSD
      cumulativeVolumeUSD
      inputTokens { symbol }
    }
  }
`;

interface RawResponse {
  data?: {
    _meta?: { block?: { number?: number } };
    dexAmmProtocols?: { name: string; slug: string; schemaVersion: string }[];
    liquidityPools?: {
      id: string;
      name: string;
      totalValueLockedUSD: string;
      cumulativeVolumeUSD: string;
      inputTokens?: { symbol: string }[];
    }[];
  };
  errors?: { message: string }[];
}

/** The gateway is occasionally slow; one retry costs a few seconds and avoids a paid 500. */
async function post(subgraphId: string, first: number, apiKey: string): Promise<Response> {
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetch(`${GATEWAY}/subgraphs/id/${subgraphId}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: POOLS_QUERY, variables: { first } }),
        // Measured: the gateway intermittently exceeds 30s under load, which surfaced as a 500 on
        // a request the caller had already paid for. Generous, with one retry, is the cheap fix.
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

async function queryOne(
  subgraph: StandardizedSubgraph,
  first: number,
  apiKey: string,
): Promise<{ pools: Pool[]; excluded: ExcludedPool[]; block: number }> {
  const res = await post(subgraph.subgraphId, first, apiKey);

  const body = (await res.json()) as RawResponse;
  if (body.errors?.length) throw new GraphQueryError(subgraph.key, body.errors[0]!.message);

  const block = body.data?._meta?.block?.number ?? 0;
  const pools: Pool[] = [];
  const excluded: ExcludedPool[] = [];

  for (const p of body.data?.liquidityPools ?? []) {
    const pool: Pool = {
      id: p.id,
      name: p.name,
      protocol: subgraph.protocol,
      chain: subgraph.chain,
      tokens: (p.inputTokens ?? []).map((t) => t.symbol),
      totalValueLockedUSD: p.totalValueLockedUSD,
      cumulativeVolumeUSD: p.cumulativeVolumeUSD ?? "0",
    };

    const reason = implausibilityOf(pool);
    if (reason) {
      excluded.push({ ...pool, reason });
      continue;
    }
    pools.push(pool);
  }

  return { pools, excluded, block };
}

function apiKey(): string {
  const key = process.env.GRAPH_API_KEY;
  if (!key) throw new GraphAuthError();
  return key;
}

/**
 * How many rows to ask the subgraph for, given how many the caller wants.
 *
 * The subgraph caps `first` at 1000. Ten times the request with a floor of 100 comfortably absorbs
 * the exclusion rate we observe without asking for a page the gateway will be slow to build.
 */
function overFetch(limit: number): number {
  return Math.min(1000, Math.max(100, limit * 10));
}

/** Pools from a single protocol. */
export async function poolsFor(key: string, limit: number): Promise<PoolQueryResult> {
  const subgraph = subgraphFor(key);
  if (!subgraph) throw new GraphQueryError(key, "no standardized subgraph configured");

  // Over-fetch hard. Exclusions routinely remove most of a page — ten of twelve on Uniswap at the
  // time of writing — so a small multiplier leaves the caller short of what they paid for.
  const { pools, excluded, block } = await queryOne(subgraph, overFetch(limit), apiKey());
  const taken = pools.slice(0, limit);
  return {
    pools: taken,
    ...(taken.length < limit
      ? {
          shortfall: {
            asked: limit,
            returned: taken.length,
            because:
              `${excluded.length} of ${excluded.length + pools.length} pools returned by the ` +
              `subgraph had figures that contradict themselves and were excluded`,
          },
        }
      : {}),
    excluded,
    sources: [{ protocol: subgraph.protocol, subgraphId: subgraph.subgraphId, block }],
  };
}

/**
 * Pools across every configured protocol, ranked together.
 *
 * @remarks
 * The same `POOLS_QUERY` goes to each subgraph and the results merge without translation, because
 * the shared schema already agrees on the field names and units. Cross-protocol ranking is then
 * just a sort — which is the thing that would otherwise require writing and maintaining one
 * adapter per protocol.
 *
 * A protocol that fails is dropped rather than failing the whole query, and its absence is visible
 * in `sources`: a partial answer whose provenance is stated is more useful than no answer, and far
 * more useful than a complete-looking answer that quietly lost a protocol.
 */
export async function poolsAcrossProtocols(limit: number): Promise<PoolQueryResult> {
  const key = apiKey();
  const settled = await Promise.allSettled(
    DEX_SUBGRAPHS.map(async (s) => ({ subgraph: s, ...(await queryOne(s, overFetch(limit), key)) })),
  );

  const pools: Pool[] = [];
  const excluded: ExcludedPool[] = [];
  const sources: { protocol: string; subgraphId: string; block: number }[] = [];
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    pools.push(...outcome.value.pools);
    excluded.push(...outcome.value.excluded);
    sources.push({
      protocol: outcome.value.subgraph.protocol,
      subgraphId: outcome.value.subgraph.subgraphId,
      block: outcome.value.block,
    });
  }

  if (sources.length === 0) throw new GraphQueryError("all", "every standardized subgraph failed");

  pools.sort((a, b) => Number(b.totalValueLockedUSD) - Number(a.totalValueLockedUSD));
  const taken = pools.slice(0, limit);
  return {
    pools: taken,
    ...(taken.length < limit
      ? {
          shortfall: {
            asked: limit,
            returned: taken.length,
            because: `${excluded.length} pools across ${sources.length} protocol(s) were excluded as self-inconsistent`,
          },
        }
      : {}),
    excluded,
    sources,
  };
}
