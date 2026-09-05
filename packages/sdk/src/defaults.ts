/**
 * The live Tollgate deployment on Sepolia.
 *
 * These are duplicated from `deployments/ens-sepolia.json` rather than read from it: a published
 * package cannot rely on a JSON file in a sibling directory of a repository the caller does not
 * have. All three are public — they are verifiable on Etherscan and are printed in the project
 * README — so nothing is disclosed by inlining them.
 *
 * Every one is overridable through `TollgateOptions`. A caller running their own registrar passes
 * their own; nothing here is load-bearing for anyone but us.
 */
export const SEPOLIA_DEPLOYMENT = {
  parent: "tollgatehq.eth",
  /** TollgateRegistrar — emits `ServiceListed` / `ServiceRevoked`. */
  registrar: "0x78155e1b4cd666244d5bdae73ad4a8c53693c661",
  /** ENSv2 PermissionedResolver holding each listing's terms. */
  resolver: "0xeb22a41C9b5f979385A045faaE72E730BF9d0B0C",
  /**
   * Block the registrar was deployed at. Discovery scans from here — real Sepolia rejects
   * `eth_getLogs` from genesis, and the registrar cannot have events before it existed.
   */
  deployBlock: 11613900,
  /**
   * Labels this deployment listed.
   *
   * A *hint about where to look*, never a source of terms. Every one is still resolved through the
   * public ENS path and dropped unless the resolver backs it, so a stale entry cannot invent a
   * service and a revoked one stays revoked.
   *
   * It exists because public Sepolia endpoints return incomplete `eth_getLogs` results without
   * erroring — currently zero of three events, repeatably. Discovery that trusted the log alone
   * would silently show an empty marketplace, which is exactly what happened the first time this
   * SDK's own example was run.
   */
  services: ["uniswap-pools", "dex-pools", "curve-pools"],
} as const;

/** Native HBAR. Prices in a listing are denominated in the asset its records name. */
export const HBAR = "0.0.0";

/** HBAR has eight decimals, so one HBAR is 100,000,000 tinybars. */
export const TINYBARS_PER_HBAR = 100_000_000n;
