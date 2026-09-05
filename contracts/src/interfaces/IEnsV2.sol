// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal interfaces for the ENSv2 beta contracts deployed on Sepolia.
///
///      These are hand-extracted from `ensdomains/contracts-v2` @ 48b3e2d rather than imported,
///      deliberately. ENS states the v2 interfaces are "not yet final and may change prior to
///      mainnet deployment", so vendoring the full tree would pin us to a snapshot that can drift
///      away from what is actually deployed. We declare only the calls we make and exercise them
///      against the live Sepolia deployment in fork tests — so an upstream breaking change fails
///      our test suite instead of silently passing against a stale local copy.

/// @notice Subset of `IPermissionedRegistry` / `IStandardRegistry` we depend on.
interface IPermissionedRegistry {
    /// @notice Mint a subname.
    /// @param label The subname label, e.g. "uniswap-pools".
    /// @param owner The account receiving the ERC1155 token for this name.
    /// @param registry Child registry for the name, or the zero address for none.
    /// @param resolver Resolver the name should point at.
    /// @param roleBitmap Nybble-packed EAC roles granted to `owner` on the name's own resource.
    /// @param expiry Absolute unix timestamp at which the name expires.
    /// @return tokenId The ERC1155 token id representing the name.
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    )
        external
        returns (uint256 tokenId);

    /// @notice Burn a name before its expiry.
    function unregister(uint256 anyId) external;

    /// @notice Extend a name's expiry.
    function renew(uint256 tokenId, uint64 expiry) external;

    /// @notice Current owner of a name, or the zero address if unregistered or expired.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Grant EAC roles on the root resource of this registry.
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);

    /// @notice Whether `account` holds all of `roleBitmap` on `resource`.
    function hasRoles(uint256 resource, uint256 roleBitmap, address account)
        external
        view
        returns (bool);
}

/// @notice Subset of `IPermissionedResolver` we depend on.
interface IPermissionedResolver {
    /// @notice Write a text record. Gated per-node AND per-key by EAC.
    function setText(bytes32 node, string calldata key, string calldata value) external;

    /// @notice Read a text record.
    function text(bytes32 node, string calldata key) external view returns (string memory);

    /// @notice Grant or revoke `ROLE_SET_TEXT` for a single `key` on a single `toName`.
    /// @dev This is the primitive behind delegated, record-scoped permissions: an account
    ///      authorized for "x402:price" cannot write "x402:settlement" on the same name.
    /// @param toName DNS-encoded name. Use `NameCoder.encode("")` to mean any name.
    /// @param key The text record key being delegated.
    /// @param account The delegate.
    /// @param grant True to grant, false to revoke.
    function authorizeTextRoles(
        bytes calldata toName,
        string calldata key,
        address account,
        bool grant
    )
        external
        returns (bool);

    /// @notice Bump the record version for a node, clearing every record under it.
    function clearRecords(bytes32 node) external;

    /// @notice Grant EAC roles on the root resource of this resolver.
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);

    /// @notice Whether `account` holds all of `roleBitmap` on `resource`.
    function hasRoles(uint256 resource, uint256 roleBitmap, address account)
        external
        view
        returns (bool);
}

/// @notice `VerifiableFactory` — deploys the UUPS proxies ENSv2 uses for user registries
///         and per-owner resolvers.
interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata initData)
        external
        returns (address);
}
