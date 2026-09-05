// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPermissionedRegistry, IPermissionedResolver} from "./interfaces/IEnsV2.sol";
import {TollgateRecordsLib} from "./libraries/TollgateRecordsLib.sol";

/// @title TollgateRegistrar
/// @notice Mints a service listing as an ENS subname and publishes everything an agent needs to
///         find, price and pay for that service — endpoint, price, settlement account — as text
///         records on the name's own resolver.
///
/// @dev This is the "subname registry under your own rules" half of the product. The rules are:
///
///      1. **A listing is atomic.** A name is never visible in a half-configured state where an
///         agent could read an endpoint but no price, or a price but no settlement account. The
///         name is minted and every record written in one transaction, or the whole thing reverts.
///
///      2. **The operator may reprice, but may not redirect the money.** After listing, the
///         operator is delegated `ROLE_SET_TEXT` on exactly two record keys — the price and the
///         endpoint — via the resolver's per-key authorization. The settlement account is not
///         delegated, so the account that gets paid is fixed at listing time and the operator
///         cannot move it. This is enforced by ENS's Enhanced Access Control, not by us.
///
///      3. **The operator may not repoint the resolver.** The operator owns the name's ERC1155
///         token but is granted a role bitmap that withholds `ROLE_SET_RESOLVER` and
///         `ROLE_SET_SUBREGISTRY`. Without this, rule 2 would be trivially bypassable: an operator
///         could point the name at a resolver they control and publish any settlement account
///         they liked. The narrow text delegation is only meaningful if the resolver is pinned.
///
///      4. **Listings expire.** Every name is minted with an expiry, and can be revoked before it.
///         A marketplace whose entries never go stale is a directory of dead endpoints.
contract TollgateRegistrar {
    ////////////////////////////////////////////////////////////////////////
    // Roles — mirrored from ENSv2 rather than imported. See IEnsV2.sol.
    ////////////////////////////////////////////////////////////////////////

    /// @dev `RegistryRolesLib.ROLE_RENEW` — nybble 4.
    uint256 internal constant ROLE_RENEW = 1 << 16;
    /// @dev `RegistryRolesLib.ROLE_UNREGISTER` — nybble 3.
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;

    /// @dev `RegistryRolesLib.ROLE_REGISTRAR` — nybble 0.
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    /// @dev `PermissionedResolverLib.ROLE_SET_TEXT` — nybble 1.
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    /// @dev `PermissionedResolverLib.ROLE_CLEAR` — nybble 8.
    uint256 internal constant ROLE_CLEAR = 1 << 32;

    /// @notice EAC roles this contract must hold on `REGISTRY`'s root resource to function.
    /// @dev `ROLE_RENEW << 128` is the admin bit for `ROLE_RENEW`: EAC requires you to hold a
    ///      role's admin bit in order to grant that role onward, and `list()` grants `ROLE_RENEW`
    ///      to the operator. Published as a constant so the deploy script and the tests provision
    ///      exactly this and nothing wider.
    uint256 public constant REQUIRED_REGISTRY_ROLES =
        ROLE_REGISTRAR | ROLE_UNREGISTER | (ROLE_RENEW << 128);

    /// @notice EAC roles this contract must hold on `RESOLVER`'s root resource to function.
    /// @dev `ROLE_SET_TEXT << 128` is what permits `authorizeTextRoles` to delegate individual
    ///      keys onward to operators. Admin bits imply their regular counterpart, so this also
    ///      confers `ROLE_SET_TEXT` itself.
    uint256 public constant REQUIRED_RESOLVER_ROLES =
        ROLE_SET_TEXT | (ROLE_SET_TEXT << 128) | ROLE_CLEAR;

    /// @dev Roles handed to a service operator on their own name.
    ///      Deliberately excludes `ROLE_SET_RESOLVER` (1 << 24) and `ROLE_SET_SUBREGISTRY`
    ///      (1 << 20) — see rule 3 above.
    uint256 internal constant OPERATOR_NAME_ROLES = ROLE_RENEW;

    ////////////////////////////////////////////////////////////////////////
    // Immutables
    ////////////////////////////////////////////////////////////////////////

    /// @notice Our own subname registry (a `UserRegistry` proxy) sitting under the parent name.
    IPermissionedRegistry public immutable REGISTRY;

    /// @notice The resolver every listing points at. Pinned — see rule 3.
    IPermissionedResolver public immutable RESOLVER;

    /// @notice Namehash of the parent name, e.g. `namehash("tollgate.eth")`.
    bytes32 public immutable PARENT_NODE;

    ////////////////////////////////////////////////////////////////////////
    // Storage
    ////////////////////////////////////////////////////////////////////////

    /// @notice DNS wire-format parent name, e.g. `\x08tollgate\x03eth\x00`.
    /// @dev Kept alongside `PARENT_NODE` because the resolver's per-key authorization takes a
    ///      DNS-encoded name while its record setters take a namehash.
    bytes public parentDnsName;

    /// @notice Account permitted to administer this registrar.
    address public admin;

    /// @notice Accounts permitted to list services. Curation is a marketplace's job.
    mapping(address => bool) public isLister;

    ////////////////////////////////////////////////////////////////////////
    // Types
    ////////////////////////////////////////////////////////////////////////

    /// @notice Everything published about a service at listing time.
    struct Listing {
        /// @dev ENSIP-26 `agent-context`: what this service sells, in prose an agent can read.
        string context;
        /// @dev ENSIP-26 `agent-endpoint[web]`: the x402-gated HTTP endpoint.
        string endpoint;
        /// @dev Price per unit as a decimal USD string, e.g. "0.001".
        string price;
        /// @dev What one unit is, e.g. "pool". Fixed at listing time — see `_delegateRepricingRights`.
        string unit;
        /// @dev Hedera account credited on settlement, e.g. "0.0.7326075". Immutable after listing.
        string settlement;
        /// @dev CAIP-2 network id, e.g. "hedera:testnet".
        string network;
        /// @dev Asset id; "0.0.0" is the x402 sentinel for native HBAR.
        string asset;
        /// @dev Shape of the response body, so an agent knows what it is buying.
        string schema;
    }

    ////////////////////////////////////////////////////////////////////////
    // Events
    ////////////////////////////////////////////////////////////////////////

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
    event ListerSet(address indexed account, bool allowed);
    event AdminTransferred(address indexed from, address indexed to);

    ////////////////////////////////////////////////////////////////////////
    // Errors
    ////////////////////////////////////////////////////////////////////////

    error NotAdmin(address caller);
    error NotLister(address caller);
    error ZeroAddress();
    error ExpiryInPast(uint64 expiry);
    error EmptyRecord(string field);

    ////////////////////////////////////////////////////////////////////////
    // Setup
    ////////////////////////////////////////////////////////////////////////

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    modifier onlyLister() {
        if (!isLister[msg.sender]) revert NotLister(msg.sender);
        _;
    }

    /// @param registry Our subname registry. This contract must hold `ROLE_REGISTRAR` on it.
    /// @param resolver The pinned resolver. This contract must hold `ROLE_SET_TEXT` and
    ///        `ROLE_SET_TEXT_ADMIN` on its root resource — the former to write records, the
    ///        latter to delegate individual keys onward to operators.
    /// @param parentDnsName_ DNS wire-format parent name, including its terminating root byte,
    ///        e.g. `\x08tollgate\x03eth\x00`. `PARENT_NODE` is *derived* from this rather than
    ///        passed separately: the registry and resolver are addressed by namehash while
    ///        per-key authorization is addressed by DNS-encoded name, and if the two were accepted
    ///        as independent arguments a mismatch would not revert — it would quietly grant the
    ///        operator rights over a name nobody can resolve, leaving their real listing
    ///        uneditable. One source of truth removes the failure mode.
    /// @param admin_ Initial admin.
    constructor(
        IPermissionedRegistry registry,
        IPermissionedResolver resolver,
        bytes memory parentDnsName_,
        address admin_
    ) {
        if (address(registry) == address(0)) revert ZeroAddress();
        if (address(resolver) == address(0)) revert ZeroAddress();
        if (admin_ == address(0)) revert ZeroAddress();

        REGISTRY = registry;
        RESOLVER = resolver;
        PARENT_NODE = TollgateRecordsLib.namehashDns(parentDnsName_);
        parentDnsName = parentDnsName_;
        admin = admin_;
        isLister[admin_] = true;

        emit AdminTransferred(address(0), admin_);
        emit ListerSet(admin_, true);
    }

    ////////////////////////////////////////////////////////////////////////
    // Administration
    ////////////////////////////////////////////////////////////////////////

    function setLister(address account, bool allowed) external onlyAdmin {
        if (account == address(0)) revert ZeroAddress();
        isLister[account] = allowed;
        emit ListerSet(account, allowed);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    ////////////////////////////////////////////////////////////////////////
    // Listing
    ////////////////////////////////////////////////////////////////////////

    /// @notice Mint `label` under the parent name and publish a complete service listing on it.
    /// @dev Rules 1–4 in the contract docs are all enforced here.
    /// @param label The subname label, e.g. "uniswap-pools".
    /// @param operator Account that will own the name and may reprice it.
    /// @param listing The records to publish.
    /// @param expiry Absolute unix timestamp at which the listing expires.
    /// @return tokenId The ERC1155 token id of the minted name.
    function list(
        string calldata label,
        address operator,
        Listing calldata listing,
        uint64 expiry
    )
        external
        onlyLister
        returns (uint256 tokenId)
    {
        if (operator == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert ExpiryInPast(expiry);

        // An agent must never resolve a listing that is missing the parts it needs to transact.
        // Rejecting at the boundary is what makes rule 1 meaningful — an atomically written but
        // half-empty listing would be just as unusable as a half-written one.
        if (bytes(listing.endpoint).length == 0) revert EmptyRecord("endpoint");
        if (bytes(listing.price).length == 0) revert EmptyRecord("price");
        if (bytes(listing.unit).length == 0) revert EmptyRecord("unit");
        if (bytes(listing.settlement).length == 0) revert EmptyRecord("settlement");
        if (bytes(listing.network).length == 0) revert EmptyRecord("network");
        if (bytes(listing.context).length == 0) revert EmptyRecord("context");

        tokenId = REGISTRY.register(
            label,
            operator,
            address(0), // no child registry — a service listing is a leaf
            address(RESOLVER), // pinned, per rule 3
            OPERATOR_NAME_ROLES,
            expiry
        );

        bytes32 node = TollgateRecordsLib.childNode(PARENT_NODE, label);
        _writeRecords(node, listing);
        _delegateRepricingRights(label, operator);

        emit ServiceListed(
            tokenId,
            node,
            label,
            operator,
            listing.endpoint,
            listing.price,
            listing.settlement,
            expiry
        );
    }

    /// @notice Take a listing down before its expiry.
    /// @dev Records are cleared as well as the name burned. Leaving live records behind on a
    ///      revoked name would let an agent that caches the node keep paying a dead endpoint.
    function revoke(string calldata label) external onlyLister {
        bytes32 node = TollgateRecordsLib.childNode(PARENT_NODE, label);

        // Registry ids are labelhash-derived, resolver keys are namehash-derived. These are not
        // interchangeable — see TollgateRecordsLib.labelId.
        uint256 id = TollgateRecordsLib.labelId(label);

        RESOLVER.clearRecords(node);
        REGISTRY.unregister(id);

        emit ServiceRevoked(id, node, label);
    }

    ////////////////////////////////////////////////////////////////////////
    // Reads
    ////////////////////////////////////////////////////////////////////////

    /// @notice Read back the payment-relevant records for a listing.
    /// @dev Convenience for the service and the UI. The consumer agent deliberately does *not*
    ///      use this — it resolves through the public ENS resolution path like any other client,
    ///      because a marketplace only works if discovery does not require our contract.
    function quote(string calldata label)
        external
        view
        returns (string memory endpoint, string memory price, string memory settlement)
    {
        bytes32 node = TollgateRecordsLib.childNode(PARENT_NODE, label);
        return (
            RESOLVER.text(node, TollgateRecordsLib.AGENT_ENDPOINT_WEB),
            RESOLVER.text(node, TollgateRecordsLib.X402_PRICE),
            RESOLVER.text(node, TollgateRecordsLib.X402_SETTLEMENT)
        );
    }

    /// @notice Namehash of a label under the parent name.
    function nodeOf(string calldata label) external view returns (bytes32) {
        return TollgateRecordsLib.childNode(PARENT_NODE, label);
    }

    ////////////////////////////////////////////////////////////////////////
    // Internals
    ////////////////////////////////////////////////////////////////////////

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

    /// @dev Rule 2. Delegate exactly two keys and no more.
    ///      Note what is absent: no call is made for `X402_SETTLEMENT`, and none for `X402_UNIT`.
    ///      The operator therefore falls through the resolver's per-key check to the name-wide
    ///      check, which they fail, so `setText(node, "x402:settlement", ...)` reverts for them
    ///      permanently. `X402_UNIT` is withheld for a different reason than settlement: an
    ///      operator free to redefine what a unit *is* could multiply the bill without ever
    ///      touching the advertised price. Repricing is legitimate; silently redefining the meter
    ///      underneath a published price is not.
    function _delegateRepricingRights(string calldata label, address operator) internal {
        bytes memory dnsName = TollgateRecordsLib.childDnsName(label, parentDnsName);
        RESOLVER.authorizeTextRoles(dnsName, TollgateRecordsLib.X402_PRICE, operator, true);
        RESOLVER.authorizeTextRoles(dnsName, TollgateRecordsLib.AGENT_ENDPOINT_WEB, operator, true);
    }
}
