// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {TollgateRegistrar} from "../src/TollgateRegistrar.sol";
import {EnsV2Sepolia} from "../src/config/EnsV2Sepolia.sol";
import {
    IPermissionedRegistry,
    IPermissionedResolver,
    IVerifiableFactory
} from "../src/interfaces/IEnsV2.sol";
import {TollgateRecordsLib} from "../src/libraries/TollgateRecordsLib.sol";

/// @notice Exercises `TollgateRegistrar` against the **real ENSv2 beta deployed on Sepolia**.
///
/// @dev These are fork tests, not unit tests against mocks, and that is deliberate. The central
///      claim of this contract — that a service operator can change their price but cannot
///      redirect their settlement account — is a claim about ENS's Enhanced Access Control, not
///      about our code. Asserting it against a mock resolver would only prove that our mock
///      behaves the way we assumed. Running it against the deployed `PermissionedResolver` is the
///      only way the test means anything.
///
///      Requires `SEPOLIA_RPC_URL`. Run with:  forge test --root contracts
contract TollgateRegistrarForkTest is Test {
    /// @dev EAC's `ALL_ROLES`: bit 0 of each of the 64 nybbles.
    uint256 internal constant ALL_ROLES =
        0x1111111111111111111111111111111111111111111111111111111111111111;

    /// @dev `IEnhancedAccessControl.EACUnauthorizedAccountRoles(uint256,uint256,address)`.
    bytes4 internal constant EAC_UNAUTHORIZED = 0x4b27a133;

    /// @dev `PermissionedResolverLib.ROLE_SET_TEXT` — nybble 1.
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;

    TollgateRegistrar internal registrar;
    IPermissionedRegistry internal registry;
    IPermissionedResolver internal resolver;

    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");

    /// @dev A parent name we stand in for. The registry under test is standalone until it is
    ///      attached to a real parent, so any well-formed name works here — what these tests
    ///      exercise is our registrar's behaviour against real ENS contracts.
    bytes internal constant PARENT_DNS = hex"08746f6c6c676174650365746800"; // \x08tollgate\x03eth\x00
    bytes32 internal PARENT_NODE;

    string internal constant LABEL = "uniswap-pools";

    function setUp() public {
        // Skips rather than fails when no RPC is configured, so `forge test` stays useful offline.
        try vm.envString("SEPOLIA_RPC_URL") returns (string memory url) {
            vm.createSelectFork(url);
        } catch {
            vm.skip(true);
        }
        assertEq(block.chainid, EnsV2Sepolia.CHAIN_ID, "not forked onto Sepolia");

        IVerifiableFactory factory = IVerifiableFactory(EnsV2Sepolia.VERIFIABLE_FACTORY);

        // A per-owner resolver, deployed the way ENSv2 intends: a proxy through the factory.
        bytes memory resolverInit = abi.encodeWithSignature(
            "initialize(address,uint256,bytes[])", address(this), ALL_ROLES, new bytes[](0)
        );
        resolver = IPermissionedResolver(
            factory.deployProxy(
                EnsV2Sepolia.PERMISSIONED_RESOLVER_IMPL, uint256(keccak256("tollgate.resolver")),
                resolverInit
            )
        );

        // Our own subname registry.
        bytes memory registryInit =
            abi.encodeWithSignature("initialize(address,uint256)", address(this), ALL_ROLES);
        registry = IPermissionedRegistry(
            factory.deployProxy(
                EnsV2Sepolia.USER_REGISTRY_IMPL, uint256(keccak256("tollgate.registry")), registryInit
            )
        );

        registrar = new TollgateRegistrar(registry, resolver, PARENT_DNS, address(this));
        PARENT_NODE = registrar.PARENT_NODE();

        // Provision exactly the roles the registrar declares it needs — no wider.
        registry.grantRootRoles(registrar.REQUIRED_REGISTRY_ROLES(), address(registrar));
        resolver.grantRootRoles(registrar.REQUIRED_RESOLVER_ROLES(), address(registrar));
    }

    function _listing() internal pure returns (TollgateRegistrar.Listing memory) {
        return TollgateRegistrar.Listing({
            context: "Top Uniswap v3 pools by TVL, sourced live from The Graph.",
            endpoint: "https://tollgate.example/uniswap-pools",
            price: "0.001",
            unit: "pool",
            settlement: "0.0.7326075",
            network: "hedera:testnet",
            asset: "0.0.0",
            schema: "{pools:[{id,token0,token1,tvlUSD}]}"
        });
    }

    function _list() internal returns (bytes32 node) {
        registrar.list(LABEL, operator, _listing(), uint64(block.timestamp + 365 days));
        return TollgateRecordsLib.childNode(PARENT_NODE, LABEL);
    }

    ////////////////////////////////////////////////////////////////////////
    // Listing
    ////////////////////////////////////////////////////////////////////////

    /// @dev Phase 2 done-condition: a subname can be minted and its records read back.
    function test_list_publishesEveryRecord() public {
        bytes32 node = _list();

        assertEq(
            resolver.text(node, TollgateRecordsLib.AGENT_ENDPOINT_WEB),
            "https://tollgate.example/uniswap-pools"
        );
        assertEq(resolver.text(node, TollgateRecordsLib.X402_PRICE), "0.001");
        assertEq(resolver.text(node, TollgateRecordsLib.X402_UNIT), "pool");
        assertEq(resolver.text(node, TollgateRecordsLib.X402_SETTLEMENT), "0.0.7326075");
        assertEq(resolver.text(node, TollgateRecordsLib.X402_NETWORK), "hedera:testnet");
        assertEq(resolver.text(node, TollgateRecordsLib.X402_ASSET), "0.0.0");
        assertGt(bytes(resolver.text(node, TollgateRecordsLib.AGENT_CONTEXT)).length, 0);
    }

    function test_list_mintsNameToOperator() public {
        uint256 tokenId =
            registrar.list(LABEL, operator, _listing(), uint64(block.timestamp + 365 days));
        assertEq(registry.ownerOf(tokenId), operator, "operator should own the name");
    }

    /// @dev Rule 1: a listing is atomic. A missing settlement account must take the whole
    ///      transaction down rather than leaving a name an agent can find but cannot pay.
    function test_list_revertsOnIncompleteListing() public {
        TollgateRegistrar.Listing memory bad = _listing();
        bad.settlement = "";

        vm.expectRevert(abi.encodeWithSelector(TollgateRegistrar.EmptyRecord.selector, "settlement"));
        registrar.list(LABEL, operator, bad, uint64(block.timestamp + 365 days));
    }

    function test_list_onlyLister() public {
        vm.expectRevert(abi.encodeWithSelector(TollgateRegistrar.NotLister.selector, stranger));
        vm.prank(stranger);
        registrar.list(LABEL, operator, _listing(), uint64(block.timestamp + 365 days));
    }

    function test_list_revertsOnPastExpiry() public {
        uint64 past = uint64(block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(TollgateRegistrar.ExpiryInPast.selector, past));
        registrar.list(LABEL, operator, _listing(), past);
    }

    ////////////////////////////////////////////////////////////////////////
    // Delegated permissions — the point of the whole design
    ////////////////////////////////////////////////////////////////////////

    /// @dev Rule 2, first half: the operator may reprice their own service.
    function test_operatorCanEditPrice() public {
        bytes32 node = _list();

        vm.prank(operator);
        resolver.setText(node, TollgateRecordsLib.X402_PRICE, "0.002");

        assertEq(resolver.text(node, TollgateRecordsLib.X402_PRICE), "0.002");
    }

    function test_operatorCanEditEndpoint() public {
        bytes32 node = _list();

        vm.prank(operator);
        resolver.setText(node, TollgateRecordsLib.AGENT_ENDPOINT_WEB, "https://tollgate.example/v2");

        assertEq(
            resolver.text(node, TollgateRecordsLib.AGENT_ENDPOINT_WEB), "https://tollgate.example/v2"
        );
    }

    /// @dev Rule 2, second half — and the single most important assertion in this suite.
    ///      The operator holds `ROLE_SET_TEXT` for the price key on this name, so they are not
    ///      powerless here; they are specifically powerless *for this one key*. If ENS's per-key
    ///      authorization did not work, this test would pass a payment redirection silently.
    function test_operatorCannotMoveSettlementAccount() public {
        bytes32 node = _list();

        // Asserted against the precise EAC error rather than a bare `expectRevert()`. A blanket
        // revert expectation would also be satisfied by a typo in the key or a misconfigured
        // resolver, which would make this test pass while proving nothing.
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                EAC_UNAUTHORIZED,
                uint256(keccak256(abi.encode(node, bytes32(0)))), // resolver's widest resource
                ROLE_SET_TEXT,
                operator
            )
        );
        resolver.setText(node, TollgateRecordsLib.X402_SETTLEMENT, "0.0.999999");

        assertEq(
            resolver.text(node, TollgateRecordsLib.X402_SETTLEMENT),
            "0.0.7326075",
            "settlement account must be unchanged"
        );
    }

    /// @dev The operator may reprice, but may not redefine what they are charging *per*.
    ///      Without this, repricing authority would be unbounded in practice: leave the headline
    ///      price at 0.001 and quietly redefine a "unit" to mean a tenth of what it did.
    function test_operatorCannotRedefineTheMeteredUnit() public {
        bytes32 node = _list();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                EAC_UNAUTHORIZED,
                uint256(keccak256(abi.encode(node, bytes32(0)))),
                ROLE_SET_TEXT,
                operator
            )
        );
        resolver.setText(node, TollgateRecordsLib.X402_UNIT, "basis-point");

        assertEq(resolver.text(node, TollgateRecordsLib.X402_UNIT), "pool");
    }

    /// @dev The delegation is scoped to one name, not to the key globally. An operator of one
    ///      service must not be able to reprice a competitor's.
    function test_operatorCannotRepriceADifferentName() public {
        _list();
        registrar.list("aave-markets", stranger, _listing(), uint64(block.timestamp + 365 days));
        bytes32 otherNode = TollgateRecordsLib.childNode(PARENT_NODE, "aave-markets");

        vm.prank(operator);
        vm.expectRevert();
        resolver.setText(otherNode, TollgateRecordsLib.X402_PRICE, "99.00");
    }

    function test_strangerCannotEditAnything() public {
        bytes32 node = _list();

        vm.prank(stranger);
        vm.expectRevert();
        resolver.setText(node, TollgateRecordsLib.X402_PRICE, "0.01");
    }

    ////////////////////////////////////////////////////////////////////////
    // Revocation
    ////////////////////////////////////////////////////////////////////////

    /// @dev Phase 2 done-condition: the name can be revoked. Records must go with it — a cached
    ///      node that still resolves to a live endpoint would keep taking payments after takedown.
    function test_revoke_clearsRecordsAndBurnsName() public {
        bytes32 node = _list();

        registrar.revoke(LABEL);

        assertEq(resolver.text(node, TollgateRecordsLib.X402_PRICE), "", "records should be cleared");
        assertEq(
            registry.ownerOf(TollgateRecordsLib.labelId(LABEL)),
            address(0),
            "name should no longer be owned"
        );
    }

    function test_revoke_onlyLister() public {
        _list();
        vm.expectRevert(abi.encodeWithSelector(TollgateRegistrar.NotLister.selector, stranger));
        vm.prank(stranger);
        registrar.revoke(LABEL);
    }

    ////////////////////////////////////////////////////////////////////////
    // Name encoding
    ////////////////////////////////////////////////////////////////////////

    /// @dev The registry keys by labelhash and the resolver by namehash. Conflating them is the
    ///      easiest way to silently address the wrong name, so pin the distinction in a test.
    function test_labelIdAndNodeAreDifferentKeyspaces() public view {
        assertTrue(
            TollgateRecordsLib.labelId(LABEL) != uint256(TollgateRecordsLib.childNode(PARENT_NODE, LABEL))
        );
    }

    /// @dev Pin the namehash implementation against the canonical published value for "eth".
    ///      If this drifts, every delegation in the contract silently targets the wrong resource.
    function test_namehashMatchesCanonicalEth() public pure {
        assertEq(
            TollgateRecordsLib.namehashDns(hex"0365746800"),
            0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae
        );
    }

    function test_childDnsNameEncoding() public pure {
        assertEq(
            TollgateRecordsLib.childDnsName("uniswap-pools", PARENT_DNS),
            hex"0d756e69737761702d706f6f6c7308746f6c6c676174650365746800"
        );
    }
}
