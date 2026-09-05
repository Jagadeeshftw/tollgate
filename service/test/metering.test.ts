import { describe, expect, it } from "vitest";

import { InvalidUnitsError, MAX_UNITS, totalPrice, unitsRequested } from "../src/metering.js";

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
