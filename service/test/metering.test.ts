import { describe, expect, it } from "vitest";

import { InvalidUnitsError, MAX_UNITS, isFlatFee, quote, totalPrice, unitsRequested } from "../src/metering.js";
import type { Listing } from "../src/listing.js";

describe("unitsRequested", () => {
  it("defaults to a single unit", () => {
    expect(unitsRequested(undefined)).toBe(1);
    expect(unitsRequested("")).toBe(1);
  });

  it("accepts a whole number of units", () => {
    expect(unitsRequested("50")).toBe(50);
    expect(unitsRequested(String(MAX_UNITS))).toBe(MAX_UNITS);
  });

  it.each(["0", "-1", "1.5", "abc", "1e3", " 5", String(MAX_UNITS + 1)])(
    "rejects %o rather than billing for it",
    (input) => {
      expect(() => unitsRequested(input)).toThrow(InvalidUnitsError);
    },
  );
});

describe("totalPrice", () => {
  it("multiplies the unit price by the units", () => {
    expect(totalPrice("0.001", 50)).toBe("0.05");
    expect(totalPrice("0.05", 1)).toBe("0.05");
    expect(totalPrice("2", 3)).toBe("6");
  });

  /**
   * The reason this module does not use floating point. Quoting `0.30000000000000004` in a 402 and
   * then settling a rounded amount is a mismatch the facilitator would reject a long way from its
   * cause. Each case below is one that IEEE 754 actually gets wrong — checked, not assumed.
   */
  it("stays exact where floating point would not", () => {
    expect(0.1 * 3).toBe(0.30000000000000004); // the trap being avoided
    expect(totalPrice("0.1", 3)).toBe("0.3");

    expect(0.29 * 3).toBe(0.8699999999999999);
    expect(totalPrice("0.29", 3)).toBe("0.87");

    expect(1.1 * 3).toBe(3.3000000000000003);
    expect(totalPrice("1.1", 3)).toBe("3.3");
  });

  it("trims trailing zeros without losing value", () => {
    expect(totalPrice("0.10", 5)).toBe("0.5");
    expect(totalPrice("0.250", 4)).toBe("1");
  });

  it("refuses a malformed listing price rather than guessing", () => {
    expect(() => totalPrice("free", 1)).toThrow(/malformed price/);
    expect(() => totalPrice("", 1)).toThrow(/malformed price/);
  });
});

const listing = (over: Partial<Listing> = {}): Listing => ({
  context: "c", endpoint: "e", unitPrice: "0.001", unit: "pool",
  settlement: "0.0.1", network: "hedera:testnet", asset: "0.0.0", schema: "s",
  ...over,
});

describe("isFlatFee", () => {
  it("is true only for unit: query", () => {
    expect(isFlatFee(listing({ unit: "query" }))).toBe(true);
    expect(isFlatFee(listing({ unit: "pool" }))).toBe(false);
    expect(isFlatFee(listing({ unit: "block" }))).toBe(false);
  });
});

describe("quote", () => {
  it("charges once for a flat-fee listing, whatever units was asked for", () => {
    const l = listing({ unit: "query", unitPrice: "0.001" });
    for (const requested of [1, 3, 10, 25, 50, 1000]) {
      const q = quote(l, requested);
      expect(q.units).toBe(1);
      expect(q.total).toBe("0.001");
    }
  });

  it("is unchanged for a metered listing", () => {
    const l = listing({ unit: "pool", unitPrice: "0.001" });
    expect(quote(l, 10)).toEqual({ units: 10, unit: "pool", unitPrice: "0.001", total: "0.01" });
  });

  /**
   * The bug this closes: a caller could ask for `?limit=1000` against a flat-fee listing and be
   * charged 1000x for one number served 1000 times over. Canaried by asserting on `totalPrice`
   * directly — the function that would misprice it if `quote()`'s clamp were ever removed — so
   * this test is not merely restating what `quote()` already does.
   */
  it("would have overcharged without the clamp", () => {
    expect(totalPrice("0.001", 1000)).toBe("1"); // what 1000 "queries" would cost, unclamped
    expect(quote(listing({ unit: "query", unitPrice: "0.001" }), 1000).total).toBe("0.001");
  });
});
