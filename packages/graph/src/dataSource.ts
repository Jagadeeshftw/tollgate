import { MAX_TVL_TO_VOLUME_RATIO, poolsAcrossProtocols, poolsFor, type PoolQueryResult } from "./gateway.js";
import { SCHEMA_DRIFT } from "./subgraphs.js";

/** Structurally matches the service's `DataSource`, without importing it (avoids a cycle). */
export interface DataRequest {
  readonly label: string;
  readonly units: number;
}

/**
 * The service's goods: live pool data from Messari-standardized subgraphs.
 *
 * @remarks
 * Two labels, differing precisely in whether they use the shared schema across protocols:
 *
 *   `uniswap-pools`  one protocol, one subgraph
 *   `curve-pools`    a different protocol, the same query, no adapter written for it
 *   `dex-pools`      the same query against every configured protocol, merged and re-ranked
 *
 * That difference is the product's own demonstration of what standardization buys — the second
 * service exists only because the first one's query shape happens to work everywhere.
 *
 * Values are returned exactly as the subgraphs report them, including implausible ones. Some
 * deployments publish TVL figures that are clearly wrong, and silently filtering or correcting
 * them would be inventing data. Reporting them with their provenance lets the agent notice and
 * say so, which is the honest behaviour and a better demonstration than clean-looking numbers.
 */
export class GraphDataSource {
  readonly name = "The Graph — Messari standardized subgraphs (live)";

  /**
   * Service label to standardized subgraph.
   *
   * Adding a protocol is an entry in this map. There is no per-protocol code to write, which is
   * the shared schema's whole return: `curve-pools` exists because `POOLS_QUERY` already worked
   * against Curve, not because anything was built for it.
   */
  private static readonly BY_LABEL: Record<string, string> = {
    "uniswap-pools": "uniswap-v3",
    "curve-pools": "curve",
    "sushi-pools": "sushiswap",
  };

  async fetch(request: DataRequest): Promise<unknown> {
    const result: PoolQueryResult =
      request.label === "dex-pools"
        ? await poolsAcrossProtocols(request.units)
        : await poolsFor(GraphDataSource.BY_LABEL[request.label] ?? "uniswap-v3", request.units);

    return {
      pools: result.pools,
      ...(result.shortfall ? { shortfall: result.shortfall } : {}),
      provenance: {
        note: "live from The Graph's decentralized network via Messari standardized subgraphs",
        // Without this the rows look like an arbitrary sample, and a careful reader correctly
        // refuses to call them "the top pools". They are the subgraph's own global ordering.
        ordering:
          "These are the highest-TVL pools the subgraph holds, not a sample: the query orders by " +
          "totalValueLockedUSD descending across all pools the protocol has indexed, and the rows " +
          "below are the head of that ordering after self-inconsistent entries were removed.",
        schemaCaveat: SCHEMA_DRIFT,
        dataQuality:
          `Pools whose reported TVL exceeds ${MAX_TVL_TO_VOLUME_RATIO}x their lifetime traded ` +
          `volume are excluded from the ranking — that ratio is not physically plausible and ` +
          `indicates a decimals error in the source. Every excluded pool is listed below with ` +
          `its figures, so nothing is hidden. No value is ever rewritten.`,
        excluded: result.excluded,
        sources: result.sources,
      },
    };
  }
}
