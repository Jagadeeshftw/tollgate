import { describe, expect, it } from "vitest";

import { implausibilityOf, MAX_TVL_TO_VOLUME_RATIO } from "../src/gateway.js";
import { DEX_SUBGRAPHS } from "../src/subgraphs.js";

/**
 * The rule that decides what a buyer sees in a ranking they paid for.
 *
 * Figures below are the real ones observed on the Messari uniswap-v3-ethereum deployment, so these
 * are not invented edge cases — they are the data the service actually receives.
 */
describe("implausibility of a pool's own figures", () => {
  it("keeps a pool whose TVL is dwarfed by its trading volume", () => {
    // USDC/WETH: $108M locked against $605B traded. Obviously real.
    expect(implausibilityOf({ totalValueLockedUSD: "1.08e8", cumulativeVolumeUSD: "6.05e11" })).toBeNull();
  });

  it("rejects a pool claiming more value than has ever traded through it", () => {
    // WETH/YES: $94.5B locked against $513K traded, a ratio of ~184,000x.
    const reason = implausibilityOf({ totalValueLockedUSD: "9.45e10", cumulativeVolumeUSD: "5.13e5" });
    expect(reason).toContain("not credible");
    expect(reason).toContain("184,");
  });

  it("states the arithmetic, so the exclusion can be argued with", () => {
    const reason = implausibilityOf({ totalValueLockedUSD: "1e9", cumulativeVolumeUSD: "1e6" });
    expect(reason).toMatch(/1\.00e\+9/);
    expect(reason).toMatch(/1\.00e\+6/);
    expect(reason).toMatch(/1,000x/);
  });

  it("sits well clear of both real and broken pools rather than on a knife edge", () => {
    // An order of magnitude either side of the threshold agrees with the threshold.
    expect(implausibilityOf({ totalValueLockedUSD: "1", cumulativeVolumeUSD: "1" })).toBeNull();
    expect(implausibilityOf({ totalValueLockedUSD: String(MAX_TVL_TO_VOLUME_RATIO), cumulativeVolumeUSD: "1" })).toBeNull();
    expect(implausibilityOf({ totalValueLockedUSD: "100", cumulativeVolumeUSD: "1" })).not.toBeNull();
  });

  /** A pool that has never traded cannot be judged by this rule, and must not be silently dropped. */
  it("does not exclude a pool with no trading history", () => {
    expect(implausibilityOf({ totalValueLockedUSD: "1e9", cumulativeVolumeUSD: "0" })).toBeNull();
    expect(implausibilityOf({ totalValueLockedUSD: "1e9", cumulativeVolumeUSD: "not-a-number" })).toBeNull();
  });
});

describe("the configured standardized subgraphs", () => {
  it("covers protocols with genuinely different AMM designs", () => {
    // The Track C claim depends on these being unlike each other, not three forks of one design.
    const protocols = DEX_SUBGRAPHS.map((s) => s.protocol);
    expect(protocols).toContain("Uniswap V3");
    expect(protocols).toContain("Curve Finance");
    expect(protocols).toContain("SushiSwap");
  });

  it("records each deployment's schema version, since they differ", () => {
    for (const s of DEX_SUBGRAPHS) {
      expect(s.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(s.subgraphId).toMatch(/^[A-Za-z0-9]{40,}$/);
    }
    // Standardized does not mean identical — the caveat the write-up must keep.
    expect(new Set(DEX_SUBGRAPHS.map((s) => s.schemaVersion)).size).toBeGreaterThan(1);
  });
});
