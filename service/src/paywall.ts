import type { HTTPRequestContext, RouteConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";

import { decimalsFor, toBaseUnits } from "./asset.js";
import { requireListing } from "./ens.js";
import type { Listings } from "./listing.js";
import { quote, unitsRequested } from "./metering.js";

/**
 * Pull the service label out of a request path.
 *
 * @remarks
 * Accepts both `/s/<label>` and `/<label>`. The paywall is mounted with `app.use("/s", ...)`, and
 * Express strips the mount prefix before the middleware sees the path — so at runtime this is
 * handed `/uniswap-pools`, not `/s/uniswap-pools`. Handling both keeps the function correct
 * whether it is called from inside the mounted middleware or against a full request path.
 */
export function labelFromPath(path: string): string | null {
  const match = /^(?:\/s)?\/([^/?]+)/.exec(path);
  return match?.[1] ?? null;
}

/**
 * Read `?limit` from the request.
 *
 * @remarks
 * `getQueryParam` is optional on the `HTTPAdapter` interface, so an adapter that does not
 * implement it would throw here at request time rather than at startup. Falling back to parsing
 * the URL keeps the meter working on any adapter.
 */
function limitOf(ctx: HTTPRequestContext): string | undefined {
  const raw = ctx.adapter.getQueryParam?.("limit");
  if (raw !== undefined) return Array.isArray(raw) ? raw[0] : raw;

  const url = ctx.adapter.getUrl?.();
  if (!url) return undefined;
  return new URL(url, "http://localhost").searchParams.get("limit") ?? undefined;
}

function contextOf(ctx: HTTPRequestContext): { label: string; limit: string | undefined } {
  const label = labelFromPath(ctx.path);
  if (!label) throw new Error(`not a service path: ${ctx.path}`);
  return { label, limit: limitOf(ctx) };
}

/**
 * The 402 gate.
 *
 * @remarks
 * Every field an agent is asked to pay against is resolved from the service's ENS name at request
 * time — the price, the unit it is metered in, the Hedera account to be credited, the network and
 * the asset. None of it is server configuration.
 *
 * That is not an aesthetic choice. If the price lived in this process, the ENS record would be
 * decoration: an operator could advertise one price on their name and charge another, and an agent
 * reading the name before calling would be reading a claim rather than a commitment. Resolving it
 * here is what makes the published record binding.
 */
export function buildRouteConfig(listings: Listings): RouteConfig {
  return {
    accepts: [
      {
        scheme: "exact",

        // Resolved per request, from the name.
        network: "hedera:testnet" as Network,

        /**
         * Priced in the asset the listing names, not in a default.
         *
         * @remarks
         * Returning a bare money string here would hand the amount to the scheme's default money
         * parser, which converts it into the network's default asset — USDC on Hedera. A listing
         * that publishes `x402:asset = "0.0.0"` would then be quoted, and settled, in USDC while
         * its ENS record said HBAR. Observed doing exactly that before this was fixed.
         *
         * Returning an explicit `{ asset, amount }` makes the published record binding: the asset
         * charged is the asset the name advertises, and a listing that names something we cannot
         * price is rejected rather than silently redenominated.
         */
        price: async (ctx: HTTPRequestContext) => {
          const { label, limit } = contextOf(ctx);
          const listing = await requireListing(listings, label);
          const q = quote(listing, unitsRequested(limit));
          return {
            asset: listing.asset,
            amount: toBaseUnits(q.total, decimalsFor(listing.asset, listing.network)),
          };
        },

        payTo: async (ctx: HTTPRequestContext) => {
          const { label } = contextOf(ctx);
          const listing = await requireListing(listings, label);
          return listing.settlement;
        },

        maxTimeoutSeconds: 300,
      },
    ],

    /**
     * What an unpaid caller gets back alongside the 402.
     *
     * An agent that has just been refused should not have to guess why it is being charged what
     * it is being charged. Returning the meter — unit price, units, and the ENS name the quote
     * came from — lets it decide whether the price is worth paying, which is the decision Phase 5
     * needs it to be able to make.
     */
    unpaidResponseBody: async (ctx: HTTPRequestContext) => {
      const { label, limit } = contextOf(ctx);
      const listing = await requireListing(listings, label);
      const q = quote(listing, unitsRequested(limit));

      return {
        contentType: "application/json",
        body: {
          service: label,
          context: listing.context,
          quote: {
            units: q.units,
            unit: q.unit,
            unitPrice: q.unitPrice,
            total: q.total,
            asset: listing.asset,
          },
          settlement: {
            account: listing.settlement,
            network: listing.network,
            asset: listing.asset,
          },
          schema: listing.schema,
          source: "ens",
        },
      };
    },
  };
}
