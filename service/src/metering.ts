import type { Listing } from "./listing.js";

/** Hard ceiling on units per call, so a typo in a query string cannot bill unboundedly. */
export const MAX_UNITS = 1000;

export class InvalidUnitsError extends Error {
  constructor(readonly requested: string) {
    super(`"limit" must be a whole number between 1 and ${MAX_UNITS}, got "${requested}"`);
    this.name = "InvalidUnitsError";
  }
}

/**
 * How many units a request is asking for.
 *
 * @remarks
 * This is the metering half of "pay per call, not per subscription". The unit is whatever the
 * listing says it is — a pool, a block, a token — and the caller states how many they want. Two
 * requests to the same endpoint therefore cost different amounts, which is the distinction Hedera
 * draws between metered and flat-rate pricing.
 */
export function unitsRequested(limit: string | undefined): number {
  if (limit === undefined || limit === "") return 1;
  if (!/^\d+$/.test(limit)) throw new InvalidUnitsError(limit);

  const units = Number(limit);
  if (!Number.isSafeInteger(units) || units < 1 || units > MAX_UNITS) {
    throw new InvalidUnitsError(limit);
  }
  return units;
}

/**
 * Total price for `units` at the listing's unit price, as a decimal string.
 *
 * @remarks
 * Deliberately not floating point. `0.001 * 3` is `0.003000000000000000...` in IEEE 754, and a
 * price string that disagrees with the amount actually settled is the kind of discrepancy that
 * shows up as a facilitator rejection much later. Scaling to integers and reinserting the decimal
 * point keeps the quote exact.
 */
export function totalPrice(unitPrice: string, units: number): string {
  if (!/^\d+(\.\d+)?$/.test(unitPrice)) {
    throw new Error(`listing has a malformed price: "${unitPrice}"`);
  }

  const [whole = "0", fraction = ""] = unitPrice.split(".");
  const scaled = BigInt(whole + fraction) * BigInt(units);
  const decimals = fraction.length;
  if (decimals === 0) return scaled.toString();

  const digits = scaled.toString().padStart(decimals + 1, "0");
  const intPart = digits.slice(0, -decimals);
  const fracPart = digits.slice(-decimals).replace(/0+$/, "");
  return fracPart === "" ? intPart : `${intPart}.${fracPart}`;
}

export interface Quote {
  readonly units: number;
  readonly unit: string;
  readonly unitPrice: string;
  readonly total: string;
}

export function quote(listing: Listing, units: number): Quote {
  return {
    units,
    unit: listing.unit,
    unitPrice: listing.unitPrice,
    total: totalPrice(listing.unitPrice, units),
  };
}
