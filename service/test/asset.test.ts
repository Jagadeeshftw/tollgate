import { describe, expect, it } from "vitest";

import { decimalsFor, toBaseUnits, UnsupportedAssetError } from "../src/asset.js";

describe("decimalsFor", () => {
  it("knows HBAR is denominated in tinybars", () => {
    expect(decimalsFor("0.0.0", "hedera:testnet")).toBe(8);
  });

  it("knows USDC on Hedera testnet has six decimals", () => {
    expect(decimalsFor("0.0.429274", "hedera:testnet")).toBe(6);
  });

  /**
   * The failure this guards against is a factor-of-100 billing error, so guessing is worse than
   * refusing. A listing naming an asset we cannot price must break loudly at quote time.
   */
  it("refuses an unknown asset rather than assuming a default", () => {
    expect(() => decimalsFor("0.0.999999", "hedera:testnet")).toThrow(UnsupportedAssetError);
  });
});

describe("toBaseUnits", () => {
  it("converts HBAR to tinybars", () => {
    expect(toBaseUnits("0.05", 8)).toBe("5000000");
    expect(toBaseUnits("1", 8)).toBe("100000000");
    expect(toBaseUnits("0.00000001", 8)).toBe("1");
  });

  it("converts USDC amounts at six decimals", () => {
    expect(toBaseUnits("0.05", 6)).toBe("50000");
  });

  /** Silently truncating here would charge less than quoted, or more. */
  it("refuses precision the asset cannot represent", () => {
    expect(() => toBaseUnits("0.0000001", 6)).toThrow(/more precision/);
  });
});
