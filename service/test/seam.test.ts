import { describe, expect, it } from "vitest";

import { toBaseUnits } from "../src/asset.js";
import type { Listing } from "../src/listing.js";
import { totalPrice } from "../src/metering.js";
import { assertQuotable, UnquotableListingError } from "../src/validate.js";
import { UNISWAP_POOLS } from "./inMemoryListings.js";

const withPrice = (unitPrice: string, extra: Partial<Listing> = {}): Listing => ({
  ...UNISWAP_POOLS,
  unitPrice,
  ...extra,
});

/**
 * The seam between an operator-authored ENS text record and the facilitator's exact-amount check.
 * Nothing validates across it but us: ENS stores whatever string the operator wrote, and the
 * facilitator rejects anything that is not exactly right.
 */
describe("ENS price string -> exact on-chain amount", () => {
  it("converts a well-formed HBAR price to tinybars", () => {
    expect(toBaseUnits(totalPrice("0.001", 50), 8)).toBe("5000000"); // 0.05 HBAR
    expect(toBaseUnits(totalPrice("0.001", 1), 8)).toBe("100000");
  });

  it("accepts a price at exactly the asset's precision limit", () => {
    expect(() => assertQuotable("edge", withPrice("0.00000001"))).not.toThrow(); // 1 tinybar
  });

  /**
   * The bug this suite exists for. A 9-decimal price on an 8-decimal asset is quotable at some
   * quantities and not others, because multiplying by the right number of units lands back on a
   * whole tinybar. Left unvalidated, the same listing 500s at ?limit=1 and succeeds at ?limit=50.
   */
  it("catches a price that is only payable at certain quantities", () => {
    expect(() => toBaseUnits(totalPrice("0.000000001", 1), 8)).toThrow(/more precision/);
    expect(toBaseUnits(totalPrice("0.000000001", 50), 8)).toBe("5"); // quietly fine
    expect(toBaseUnits(totalPrice("0.000000001", 10), 8)).toBe("1"); // also fine

    // ...so the listing is rejected outright rather than per-request.
    expect(() => assertQuotable("uniswap-pools", withPrice("0.000000001"))).toThrow(
      UnquotableListingError,
    );
  });

  it.each([
    ["1e-3", "scientific notation"],
    [".5", "no leading digit"],
    ["0.05 ", "trailing whitespace"],
    ["", "empty"],
    ["abc", "not a number"],
    ["-0.5", "negative"],
  ])("rejects a malformed operator price: %o (%s)", (price) => {
    expect(() => assertQuotable("uniswap-pools", withPrice(price))).toThrow(UnquotableListingError);
  });

  it("rejects a listing that would price to zero", () => {
    // 0 HBAR per unit is expressible, but a paid service that costs nothing is a misconfiguration.
    expect(() => assertQuotable("uniswap-pools", withPrice("0"))).toThrow(/prices to zero/);
  });

  it("rejects an asset whose decimals we cannot establish", () => {
    expect(() => assertQuotable("odd", withPrice("0.001", { asset: "0.0.999999" }))).toThrow(
      UnquotableListingError,
    );
  });

  /** USDC has 6 decimals, HBAR 8. The same price string means different base units per asset. */
  it("scales the same price differently per asset", () => {
    expect(toBaseUnits(totalPrice("0.001", 50), 8)).toBe("5000000"); // HBAR
    expect(toBaseUnits(totalPrice("0.001", 50), 6)).toBe("50000"); // USDC
  });

  it("handles large quantities without precision loss", () => {
    expect(toBaseUnits(totalPrice("0.001", 1000), 8)).toBe("100000000"); // exactly 1 HBAR
  });
});
