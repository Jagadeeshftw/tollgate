// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title EnsV2Sepolia
/// @notice Addresses of the ENSv2 beta on Sepolia — the deployment the ENS App and Explorer serve.
///
/// @dev **Source: the ENS docs deployments table**, which is authoritative:
///      https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta
///
///      **Do not take these from `ensdomains/contracts-v2`.** That repo's `main` branch ships
///      `contracts/deployments/sepolia/*.json` describing a *superseded* tree. Those artifacts are
///      complete, internally consistent, and every address in them still holds bytecode on
///      Sepolia — but the ENS App does not serve them, so names registered there resolve correctly
///      within that tree and are invisible everywhere else. Nothing marks them stale. We built
///      against them for three days before ENS Labs put us right.
///
///      **To confirm the live tree, ask the chain rather than any file.** The upgradable Universal
///      Resolver proxy is stable across deployments and reports the root registry currently being
///      served:
///
///          cast call 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe "ROOT_REGISTRY()(address)"
///            -> 0x8115186E8f2E0B0281e86ab91f0f48Ba90364354
///
///      `pnpm gates` asserts that matches `ROOT_REGISTRY` below, so drifting onto a retired
///      deployment fails loudly rather than silently.
library EnsV2Sepolia {
    ////////////////////////////////////////////////////////////////////////
    // Discovery
    ////////////////////////////////////////////////////////////////////////

    /// @dev Stable across deployments. `ROOT_REGISTRY()` on this names the live tree.
    address internal constant UNIVERSAL_RESOLVER_PROXY =
        0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe;

    ////////////////////////////////////////////////////////////////////////
    // Current deployment — every address verified to hold bytecode on Sepolia
    ////////////////////////////////////////////////////////////////////////

    /// @dev Root of the registry tree.
    address internal constant ROOT_REGISTRY = 0x8115186E8f2E0B0281e86ab91f0f48Ba90364354;

    /// @dev Registry holding `.eth` second-level names — where our parent name lives.
    address internal constant ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;

    /// @dev Registers `.eth` names. A plain contract call; the ENS App is a client of it.
    address internal constant ETH_REGISTRAR = 0xa88553F454b77203B0D036A05c894d555EAAa2Cc;

    /// @dev Public resolution entry point.
    address internal constant UNIVERSAL_RESOLVER = 0x4A1817d13E9cF196f471725176355C1234b63C70;

    /// @dev Deploys the UUPS proxies used for user registries and per-owner resolvers.
    address internal constant VERIFIABLE_FACTORY = 0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef;

    /// @dev Implementation behind a user-owned subname registry proxy.
    address internal constant USER_REGISTRY_IMPL = 0x624a25d67B59D587752EbEc8DdeD8827dAe52050;

    /// @dev Implementation behind a per-owner permissioned resolver proxy.
    address internal constant PERMISSIONED_RESOLVER_IMPL =
        0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e;

    /// @dev Shared label database written by every registry.
    address internal constant LABEL_STORE = 0x532CD0CC4AC0793d838F71A67d29B2D790D18777;

    /// @dev Testnet payment token for registrations; has a public `mint()`.
    address internal constant MOCK_USDC = 0x768F42455A2D082E23ceeF7d51e5787C82d67a39;

    uint256 internal constant CHAIN_ID = 11155111;
}
