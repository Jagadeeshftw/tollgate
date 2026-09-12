// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPermissionedRegistry, IPermissionedResolver} from "./interfaces/IEnsV2.sol";
import {TollgateRecordsLib} from "./libraries/TollgateRecordsLib.sol";

/// @title OpenTollgateRegistrar
/// @notice Anyone may list a data service under the parent name, for themselves. Listings are
///         self-published and unvetted — the registry enforces *what an operator can change*, not
///         *whether a service is any good*.
///
/// @dev Deployed **alongside** `TollgateRegistrar`, not instead of it. Both mint into the same
///      subname registry and write to the same resolver, so the existing listings are untouched
///      and the curated registrar keeps working throughout. Rollback is revoking this contract's
///      roles on the registry and resolver — one transaction by the admin of those contracts.
///
///      The four rules of `TollgateRegistrar` hold here unchanged, and open listing adds three:
///
///      5. **You list for yourself.** `operator` must be `msg.sender`. Nobody can mint a name to
///         someone else's address and leave them holding a listing they never made.
///      6. **Live names cannot be taken.** The registry itself rejects registering a label that is
///         already live (`LabelAlreadyRegistered`), so this contract cannot overwrite an existing
///         listing — including the curated ones — or its settlement account.
///      7. **Listings are enumerable on chain.** Public RPC endpoints return incomplete
///         `eth_getLogs` results without erroring; a stranger's listing that only exists as an
///         event would routinely be invisible. `labelCount` / `labelsFrom` are plain `eth_call`s,
///         which those same endpoints serve correctly.
///
///      Labels are restricted to `[a-z0-9-]`, 1–63 characters, no leading or trailing hyphen:
///      an open namespace invites lookalikes, and `UNISWAP-POOLS` beside `uniswap-pools` would be
///      one. Terms are capped at `MAX_TERM` so abandoned listings lapse instead of accumulating.
contract OpenTollgateRegistrar {
    ////////////////////////////////////////////////////////////////////////
    // Roles — identical to TollgateRegistrar; see that contract for the derivation.
    ////////////////////////////////////////////////////////////////////////

    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_CLEAR = 1 << 32;

    uint256 public constant REQUIRED_REGISTRY_ROLES =
        ROLE_REGISTRAR | ROLE_UNREGISTER | (ROLE_RENEW << 128);
    uint256 public constant REQUIRED_RESOLVER_ROLES =
        ROLE_SET_TEXT | (ROLE_SET_TEXT << 128) | ROLE_CLEAR;

    /// @dev Withholds ROLE_SET_RESOLVER and ROLE_SET_SUBREGISTRY — without that, the narrow
    ///      record delegation below is bypassable by repointing the name at another resolver.
    uint256 internal constant OPERATOR_NAME_ROLES = ROLE_RENEW;

    /// @notice Longest initial term. Renewal is the operator's, via ROLE_RENEW.
    uint64 public constant MAX_TERM = 365 days;

    IPermissionedRegistry public immutable REGISTRY;
    IPermissionedResolver public immutable RESOLVER;
    bytes32 public immutable PARENT_NODE;
    bytes public parentDnsName;

    /// @notice May revoke any listing made here — moderation, not curation.
    address public admin;

    /// @dev Every label ever listed here, in order. Includes revoked and expired ones; a reader
    ///      must check liveness (`REGISTRY.ownerOf`) and the resolver's records, exactly as it
    ///      already does for event-discovered listings.
    string[] internal labels;

    struct Listing {
        string context;
        string endpoint;
        string price;
        string unit;
        string settlement;
        string network;
        string asset;
        string schema;
    }

    /// @dev Same signature as TollgateRegistrar's, so existing discovery reads both.
    event ServiceListed(
        uint256 indexed tokenId,
        bytes32 indexed node,
        string label,
        address indexed operator,
        string endpoint,
        string price,
        string settlement,
        uint64 expiry
    );
    event ServiceRevoked(uint256 indexed tokenId, bytes32 indexed node, string label);
    event AdminTransferred(address indexed from, address indexed to);

    error NotAdmin(address caller);
    error NotSelf(address caller, address operator);
    error NotOwnerOrAdmin(address caller, string label);
    error InvalidLabel(string label);
    error ExpiryInPast(uint64 expiry);
    error ExpiryTooFar(uint64 expiry, uint64 latest);
    error EmptyRecord(string field);
    error ZeroAddress();

    constructor(
        IPermissionedRegistry registry,
        IPermissionedResolver resolver,
        bytes memory parentDnsName_,
        address admin_
    ) {
        if (address(registry) == address(0) || address(resolver) == address(0) || admin_ == address(0)) {
            revert ZeroAddress();
        }
        REGISTRY = registry;
        RESOLVER = resolver;
        parentDnsName = parentDnsName_;
        // Derived from the DNS encoding rather than passed separately, so the two cannot disagree —
        // the exact inconsistency that once pointed a delegation at a resource nobody checks.
        PARENT_NODE = TollgateRecordsLib.namehashDns(parentDnsName_);
        admin = admin_;
    }

    ////////////////////////////////////////////////////////////////////////
    // Listing
    ////////////////////////////////////////////////////////////////////////

    /// @notice List a service under the parent name, owned by and repriceable by the caller.
    /// @param operator Must equal `msg.sender` (rule 5). Kept in the signature so this contract
    ///        and `TollgateRegistrar` share one ABI for tooling.
    function list(
        string calldata label,
        address operator,
        Listing calldata listing,
        uint64 expiry
    )
        external
        returns (uint256 tokenId)
    {
        if (operator != msg.sender) revert NotSelf(msg.sender, operator);
        _checkLabel(label);
        if (expiry <= block.timestamp) revert ExpiryInPast(expiry);
        uint64 latest = uint64(block.timestamp) + MAX_TERM;
        if (expiry > latest) revert ExpiryTooFar(expiry, latest);

        if (bytes(listing.endpoint).length == 0) revert EmptyRecord("endpoint");
        if (bytes(listing.price).length == 0) revert EmptyRecord("price");
        if (bytes(listing.unit).length == 0) revert EmptyRecord("unit");
        if (bytes(listing.settlement).length == 0) revert EmptyRecord("settlement");
        if (bytes(listing.network).length == 0) revert EmptyRecord("network");
        if (bytes(listing.context).length == 0) revert EmptyRecord("context");

        // Reverts with LabelAlreadyRegistered for any live label (rule 6). Nothing below runs.
        tokenId = REGISTRY.register(
            label, operator, address(0), address(RESOLVER), OPERATOR_NAME_ROLES, expiry
        );

        bytes32 node = TollgateRecordsLib.childNode(PARENT_NODE, label);
        _writeRecords(node, listing);
        _delegateRepricingRights(label, operator);
        labels.push(label);

        emit ServiceListed(
            tokenId, node, label, operator, listing.endpoint, listing.price, listing.settlement, expiry
        );
    }

    /// @notice Take a listing down. The owner may withdraw their own; the admin may remove any.
    function revoke(string calldata label) external {
        // ownerOf needs the token id (low bits cleared); a raw labelhash returns the zero address
        // for every name, which would silently deny every owner. See TollgateRecordsLib.labelId.
        if (msg.sender != admin && msg.sender != REGISTRY.ownerOf(TollgateRecordsLib.tokenId(label))) {
            revert NotOwnerOrAdmin(msg.sender, label);
        }
        uint256 id = TollgateRecordsLib.labelId(label);
        bytes32 node = TollgateRecordsLib.childNode(PARENT_NODE, label);
        RESOLVER.clearRecords(node);
        REGISTRY.unregister(id);
        emit ServiceRevoked(id, node, label);
    }

    function transferAdmin(address newAdmin) external {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    ////////////////////////////////////////////////////////////////////////
    // Enumeration (rule 7)
    ////////////////////////////////////////////////////////////////////////

    function labelCount() external view returns (uint256) {
        return labels.length;
    }

    /// @notice Up to `max` labels starting at `start`. Paged so a large catalogue cannot exceed
    ///         an endpoint's `eth_call` gas limit.
    function labelsFrom(uint256 start, uint256 max) external view returns (string[] memory out) {
        uint256 end = start + max;
        if (end > labels.length) end = labels.length;
        if (start >= end) return new string[](0);
        out = new string[](end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = labels[i];
        }
    }

    function nodeOf(string calldata label) external view returns (bytes32) {
        return TollgateRecordsLib.childNode(PARENT_NODE, label);
    }

    ////////////////////////////////////////////////////////////////////////
    // Internals
    ////////////////////////////////////////////////////////////////////////

    function _checkLabel(string calldata label) internal pure {
        bytes calldata b = bytes(label);
        uint256 n = b.length;
        if (n == 0 || n > 63 || b[0] == "-" || b[n - 1] == "-") revert InvalidLabel(label);
        for (uint256 i = 0; i < n; i++) {
            bytes1 c = b[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-";
            if (!ok) revert InvalidLabel(label);
        }
    }

    function _writeRecords(bytes32 node, Listing calldata listing) internal {
        RESOLVER.setText(node, TollgateRecordsLib.AGENT_CONTEXT, listing.context);
        RESOLVER.setText(node, TollgateRecordsLib.AGENT_ENDPOINT_WEB, listing.endpoint);
        RESOLVER.setText(node, TollgateRecordsLib.X402_PRICE, listing.price);
        RESOLVER.setText(node, TollgateRecordsLib.X402_UNIT, listing.unit);
        RESOLVER.setText(node, TollgateRecordsLib.X402_SETTLEMENT, listing.settlement);
        RESOLVER.setText(node, TollgateRecordsLib.X402_NETWORK, listing.network);
        RESOLVER.setText(node, TollgateRecordsLib.X402_ASSET, listing.asset);
        RESOLVER.setText(node, TollgateRecordsLib.X402_SCHEMA, listing.schema);
    }

    /// @dev Exactly two keys, exactly as TollgateRegistrar. Settlement, unit, asset, network,
    ///      context and schema are not delegated — the operator of a self-published listing still
    ///      cannot move where its money goes.
    function _delegateRepricingRights(string calldata label, address operator) internal {
        bytes memory dnsName = TollgateRecordsLib.childDnsName(label, parentDnsName);
        RESOLVER.authorizeTextRoles(dnsName, TollgateRecordsLib.X402_PRICE, operator, true);
        RESOLVER.authorizeTextRoles(dnsName, TollgateRecordsLib.AGENT_ENDPOINT_WEB, operator, true);
    }
}
