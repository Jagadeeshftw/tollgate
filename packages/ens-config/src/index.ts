/**
 * ENSv2 beta on Sepolia — the deployment the ENS App and Explorer actually serve.
 *
 * Deliberately a standalone package with **no dependencies**. These addresses are needed by
 * production paths (the deploy script, the live gates) and by the test harness alike, and having
 * the former import them from a test-only package was backwards — it made `scripts/deploy-ens.ts`,
 * which sends real transactions, depend on a fork-testing utility.
 *
 * @remarks
 * Source: https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta
 *
 * **Do not take these from `ensdomains/contracts-v2`.** That repo's `main` branch ships
 * `contracts/deployments/sepolia/*.json` describing a *superseded* tree: complete, internally
 * consistent, still holding bytecode on Sepolia, and invisible to the ENS App. Nothing in those
 * artifacts marks them stale, and we lost three days to it. The docs table is authoritative.
 *
 * To confirm which tree is live at any moment, ask the chain rather than a file — the upgradable
 * Universal Resolver proxy is stable across deployments and reports the root registry currently
 * being served:
 *
 * ```
 * cast call 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe "ROOT_REGISTRY()(address)"
 * ```
 *
 * `pnpm gates` asserts that equals {@link ENSV2_SEPOLIA.rootRegistry}, so drifting onto a retired
 * set fails loudly instead of silently.
 */
export const ENSV2_SEPOLIA = {
  /** Stable across deployments; the canonical way to discover the live tree. */
  universalResolverProxy: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" as `0x${string}`,

  rootRegistry: "0x8115186E8f2E0B0281e86ab91f0f48Ba90364354" as `0x${string}`,
  ethRegistry: "0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2" as `0x${string}`,
  ethRegistrar: "0xa88553F454b77203B0D036A05c894d555EAAa2Cc" as `0x${string}`,
  universalResolver: "0x4A1817d13E9cF196f471725176355C1234b63C70" as `0x${string}`,

  verifiableFactory: "0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef" as `0x${string}`,
  userRegistryImpl: "0x624a25d67B59D587752EbEc8DdeD8827dAe52050" as `0x${string}`,
  permissionedResolverImpl: "0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e" as `0x${string}`,
  labelStore: "0x532CD0CC4AC0793d838F71A67d29B2D790D18777" as `0x${string}`,

  /** Testnet payment token for registrations; has a public `mint()`. */
  mockUSDC: "0x768F42455A2D082E23ceeF7d51e5787C82d67a39" as `0x${string}`,

  chainId: 11155111,
} as const;
