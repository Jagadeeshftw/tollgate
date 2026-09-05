// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TollgateRecordsLib
/// @notice The text-record schema a listed service publishes on its ENS name, plus the ENS
///         name-encoding helpers the registrar needs.
///
/// @dev **Schema policy.** Where ENS has standardised a key, we use the standard key verbatim
///      rather than inventing our own. Where no standard exists, we namespace under `x402:` so
///      it is obvious the key belongs to the payment protocol and is not squatting a generic name.
///
///      Standardised (ENSIP-26, agent text records):
///        - `agent-context`          MANDATORY. What the service sells, in prose an agent reads.
///        - `agent-endpoint[web]`    The HTTP endpoint. ENSIP-26 defines the `[<protocol>]` form.
///
///      Standardised (ENSIP-25, verifiable agent identity) — used by the consumer agent's own
///      name rather than by service listings:
///        - `agent-registration[<erc7930Registry>][<agentId>]`
///
///      Not standardised anywhere, so namespaced here. x402 has no ENSIP for price discovery:
///        - `x402:price`             Price per call, decimal string in USD, e.g. "0.05".
///        - `x402:settlement`        Hedera account that receives payment, e.g. "0.0.7326075".
///        - `x402:network`           CAIP-2 network id, e.g. "hedera:testnet".
///        - `x402:asset`             Asset id. "0.0.0" is the x402 sentinel for native HBAR.
///        - `x402:schema`            Shape of the response body, so an agent knows what it buys.
library TollgateRecordsLib {
    ////////////////////////////////////////////////////////////////////////
    // Record keys
    ////////////////////////////////////////////////////////////////////////

    string internal constant AGENT_CONTEXT = "agent-context";
    string internal constant AGENT_ENDPOINT_WEB = "agent-endpoint[web]";

    string internal constant X402_PRICE = "x402:price";
    string internal constant X402_UNIT = "x402:unit";
    string internal constant X402_SETTLEMENT = "x402:settlement";
    string internal constant X402_NETWORK = "x402:network";
    string internal constant X402_ASSET = "x402:asset";
    string internal constant X402_SCHEMA = "x402:schema";

    ////////////////////////////////////////////////////////////////////////
    // Errors
    ////////////////////////////////////////////////////////////////////////

    /// @dev DNS wire format encodes each label with a single length byte.
    error LabelTooLong(uint256 length);
    error EmptyLabel();
    error MalformedName();

    ////////////////////////////////////////////////////////////////////////
    // Name encoding
    ////////////////////////////////////////////////////////////////////////

    /// @notice ENS namehash of a DNS wire-format name.
    /// @dev EIP-137, computed right-to-left over the encoded labels:
    ///      `namehash(a.b) = keccak256(namehash(b) ++ keccak256("a"))`, with the root hashing to
    ///      zero. Implemented here rather than imported so that the parent node and the parent's
    ///      DNS encoding cannot disagree — see the `TollgateRegistrar` constructor.
    function namehashDns(bytes memory name) internal pure returns (bytes32) {
        return _namehash(name, 0);
    }

    function _namehash(bytes memory name, uint256 offset) private pure returns (bytes32) {
        if (offset >= name.length) revert MalformedName();
        uint256 length = uint8(name[offset]);
        if (length == 0) return bytes32(0);
        bytes32 parent = _namehash(name, offset + 1 + length);
        return keccak256(abi.encodePacked(parent, _labelHashAt(name, offset + 1, length)));
    }

    /// @dev keccak256 over `length` bytes of `name` starting at `offset`, without copying.
    function _labelHashAt(bytes memory name, uint256 offset, uint256 length)
        private
        pure
        returns (bytes32 hash)
    {
        if (offset + length > name.length) revert MalformedName();
        assembly {
            hash := keccak256(add(add(name, 0x20), offset), length)
        }
    }

    /// @notice Registry id for `label`.
    /// @dev The registry and the resolver use *different keyspaces*, which is easy to get wrong.
    ///      A `PermissionedRegistry` keys entries by labelhash — `keccak256(label)` alone, with no
    ///      parent — and carries a version counter in the low 32 bits (`LibLabel.withVersion`), so
    ///      that a name re-registered after expiry gets a fresh token id. Registry calls accept
    ///      "any id": the version bits are masked off to find the entry, so passing the bare
    ///      labelhash is correct and version-agnostic.
    ///
    ///      The resolver, by contrast, keys records by *namehash*, which does include the parent.
    ///      Passing a namehash to the registry (or a labelhash to the resolver) silently addresses
    ///      a different name rather than reverting.
    function labelId(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    /// @notice Namehash of `label` under `parentNode`, per ENS.
    /// @dev EIP-137: `namehash(label.parent) = keccak256(namehash(parent) ++ keccak256(label))`.
    function childNode(bytes32 parentNode, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }

    /// @notice DNS wire-format encoding of `label` prepended to an already-encoded parent.
    /// @dev `authorizeTextRoles` takes a DNS-encoded name rather than a node, so the registrar
    ///      has to carry both representations. `parentDnsName` is expected to already carry its
    ///      terminating root byte, so prepending one length-prefixed label is the whole job.
    /// @param label The subname label, e.g. "uniswap-pools".
    /// @param parentDnsName DNS-encoded parent, e.g. `\x08tollgate\x03eth\x00`.
    function childDnsName(string memory label, bytes memory parentDnsName)
        internal
        pure
        returns (bytes memory)
    {
        uint256 length = bytes(label).length;
        if (length == 0) revert EmptyLabel();
        if (length > 255) revert LabelTooLong(length);
        return abi.encodePacked(uint8(length), bytes(label), parentDnsName);
    }
}
