import { decimalsFor, toBaseUnits, UnsupportedAssetError } from "./asset.js";
import type { Listing } from "./listing.js";
import { totalPrice } from "./metering.js";

/**
 * A listing that resolves but cannot be turned into a payable amount.
 *
 * Distinct from `IncompleteListingError` (fields absent) — here the fields are present and wrong.
 * Either way it is the operator's problem, not the caller's, so both surface as 502 rather than
 * 400: the caller did nothing wrong and cannot fix it by retrying differently.
 */
export class UnquotableListingError extends Error {
  constructor(
    readonly label: string,
    readonly reason: string,
  ) {
    super(`listing "${label}" cannot be priced: ${reason}`);
    this.name = "UnquotableListingError";
  }
}

/**
 * Assert that a listing can be converted into an exact on-chain amount.
 *
 * @remarks
 * This is the seam between an operator-authored string in an ENS text record and the facilitator's
 * exact-amount check, and the two have no shared validation. Everything in between — decimal
 * parsing, the unit multiplier, the asset's decimal places, tinybar conversion — is ours.
 *
 * The specific bug this exists to prevent: a unit price with more decimal places than the asset can
 * represent (say 9 on HBAR, which has 8) is *sometimes* quotable, because multiplying by the right
 * number of units lands back on a whole base unit. `0.000000001` HBAR/unit throws at `?limit=1`
 * and succeeds at `?limit=50`. A listing whose payability depends on how much of it you buy is
 * broken, and it fails as a 500 on an endpoint that looked fine a moment earlier.
 *
 * So the unit price is validated at its *smallest* purchasable quantity — one unit. If a single
 * unit cannot be expressed exactly in the asset's base units, the listing is rejected outright.
 */
export function assertQuotable(label: string, listing: Listing): void {
  let decimals: number;
  try {
    decimals = decimalsFor(listing.asset, listing.network);
  } catch (err) {
    if (err instanceof UnsupportedAssetError) {
      throw new UnquotableListingError(label, err.message);
    }
    throw err;
  }

  let single: string;
  try {
    single = totalPrice(listing.unitPrice, 1);
  } catch (err) {
    throw new UnquotableListingError(label, (err as Error).message);
  }

  try {
    toBaseUnits(single, decimals);
  } catch (err) {
    throw new UnquotableListingError(
      label,
      `${(err as Error).message}. A single unit must be expressible in the asset's base units, ` +
        `or the listing is payable at some quantities and not others.`,
    );
  }

  if (BigInt(toBaseUnits(single, decimals)) === 0n) {
    throw new UnquotableListingError(
      label,
      `a single unit prices to zero in the asset's base units — the service would be free`,
    );
  }
}
