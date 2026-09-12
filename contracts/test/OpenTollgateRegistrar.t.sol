// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {OpenTollgateRegistrar} from "../src/OpenTollgateRegistrar.sol";
import {TollgateRegistrar} from "../src/TollgateRegistrar.sol";
import {EnsV2Sepolia} from "../src/config/EnsV2Sepolia.sol";
import {IPermissionedRegistry, IPermissionedResolver} from "../src/interfaces/IEnsV2.sol";
import {TollgateRecordsLib} from "../src/libraries/TollgateRecordsLib.sol";

/// @notice The open registrar, rolled out onto the **live** Tollgate deployment on a Sepolia fork —
///         the same registry, resolver and curated listings a judge is reading right now.
///
/// @dev Unlike TollgateRegistrar.t.sol, which stands up a fresh registry, this suite forks the
///      real one and performs the exact production rollout in setUp: the deployer grants the new
///      contract its roles on the live registry and resolver. So the assertions that matter —
///      the curated listings survive, a stranger cannot redirect money, rollback works — are made
///      against the state the rollout would actually touch, not a model of it.
///
///      Requires SEPOLIA_RPC_URL.
contract OpenTollgateRegistrarForkTest is Test {
    IPermissionedRegistry internal constant LIVE_REGISTRY = IPermissionedRegistry(0x45BF1E3da54d9747Eb12D260fC76C3F5dc35d78e);
    IPermissionedResolver internal constant LIVE_RESOLVER = IPermissionedResolver(0xeb22a41C9b5f979385A045faaE72E730BF9d0B0C);
    TollgateRegistrar internal constant CURATED = TollgateRegistrar(0x78155e1B4cd666244d5Bdae73AD4a8C53693c661);
    address internal constant DEPLOYER = 0xF6A97d82885628b68DC2AdCFaBA936578AffeF8F;

    /// @dev \x0atollgatehq\x03eth\x00
    bytes internal constant PARENT_DNS = hex"0a746f6c6c6761746568710365746800";

    /// @dev IEnhancedAccessControl.EACUnauthorizedAccountRoles(uint256,uint256,address).
    bytes4 internal constant EAC_UNAUTHORIZED = 0x4b27a133;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;

    OpenTollgateRegistrar internal open;
    bytes32 internal parentNode;

    address internal judge = makeAddr("judge");
    address internal other = makeAddr("other");

    function setUp() public {
        try vm.envString("SEPOLIA_RPC_URL") returns (string memory url) {
            vm.createSelectFork(url);
        } catch {
            vm.skip(true);
        }
        assertEq(block.chainid, EnsV2Sepolia.CHAIN_ID, "not forked onto Sepolia");

        open = new OpenTollgateRegistrar(LIVE_REGISTRY, LIVE_RESOLVER, PARENT_DNS, DEPLOYER);
        parentNode = open.PARENT_NODE();
        assertEq(parentNode, CURATED.PARENT_NODE(), "must mint under the same parent as the curated registrar");

        // The production rollout, verbatim: grant exactly the declared roles, no wider.
        vm.startPrank(DEPLOYER);
        LIVE_REGISTRY.grantRootRoles(open.REQUIRED_REGISTRY_ROLES(), address(open));
        LIVE_RESOLVER.grantRootRoles(open.REQUIRED_RESOLVER_ROLES(), address(open));
        vm.stopPrank();
    }

    function _listing(string memory settlement) internal pure returns (OpenTollgateRegistrar.Listing memory) {
        return OpenTollgateRegistrar.Listing({
            context: "A judge's own data service, self-published.",
            endpoint: "https://judge.example/data",
            price: "0.005",
            unit: "row",
            settlement: settlement,
            network: "hedera:testnet",
            asset: "0.0.0",
            schema: "{rows:[]}"
        });
    }

    function _listAsJudge(string memory label) internal returns (bytes32 node) {
        vm.prank(judge);
        open.list(label, judge, _listing("0.0.4242"), uint64(block.timestamp + 30 days));
        return TollgateRecordsLib.childNode(parentNode, label);
    }

    function _liveNode(string memory label) internal view returns (bytes32) {
        return TollgateRecordsLib.childNode(parentNode, label);
    }

    ////////////////////////////////////////////////////////////////////////
    // The rollout leaves the live catalogue exactly as it was
    ////////////////////////////////////////////////////////////////////////

    function test_curatedListingsUntouchedByRollout() public view {
        string[3] memory curated = ["uniswap-pools", "dex-pools", "curve-pools"];
        for (uint256 i = 0; i < 3; i++) {
            bytes32 node = _liveNode(curated[i]);
            assertGt(bytes(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_PRICE)).length, 0, curated[i]);
            assertGt(bytes(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_SETTLEMENT)).length, 0, curated[i]);
            assertTrue(LIVE_REGISTRY.ownerOf(TollgateRecordsLib.tokenId(curated[i])) != address(0), curated[i]);
        }
    }

    function test_curatedRegistrarStillWorksAlongside() public {
        vm.prank(DEPLOYER);
        CURATED.list(
            "curated-still-works",
            DEPLOYER,
            TollgateRegistrar.Listing({
                context: "c", endpoint: "https://e", price: "0.001", unit: "pool",
                settlement: "0.0.1", network: "hedera:testnet", asset: "0.0.0", schema: "{}"
            }),
            uint64(block.timestamp + 30 days)
        );
        assertEq(LIVE_RESOLVER.text(_liveNode("curated-still-works"), TollgateRecordsLib.X402_PRICE), "0.001");
    }

    /// @dev Rule 6 against the real thing: a stranger cannot take a curated name, and so cannot
    ///      rewrite its settlement account through the open door.
    function test_strangerCannotOverwriteACuratedListing() public {
        bytes32 node = _liveNode("uniswap-pools");
        string memory before = LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_SETTLEMENT);

        vm.prank(judge);
        vm.expectRevert(abi.encodeWithSignature("LabelAlreadyRegistered(string)", "uniswap-pools"));
        open.list("uniswap-pools", judge, _listing("0.0.666"), uint64(block.timestamp + 30 days));

        assertEq(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_SETTLEMENT), before, "settlement unchanged");
    }

    ////////////////////////////////////////////////////////////////////////
    // A stranger can list — and is refused on settlement, which is the point
    ////////////////////////////////////////////////////////////////////////

    function test_strangerCanListForThemselves() public {
        bytes32 node = _listAsJudge("judge-rows");

        assertEq(LIVE_REGISTRY.ownerOf(TollgateRecordsLib.tokenId("judge-rows")), judge);
        assertEq(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_PRICE), "0.005");
        assertEq(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_SETTLEMENT), "0.0.4242");
    }

    function test_strangerCanRepriceTheirOwnListing() public {
        bytes32 node = _listAsJudge("judge-rows");
        vm.prank(judge);
        LIVE_RESOLVER.setText(node, TollgateRecordsLib.X402_PRICE, "0.009");
        assertEq(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_PRICE), "0.009");
    }

    /// @dev The refusal a judge is meant to hit themselves. Asserted against the precise EAC error:
    ///      a bare expectRevert would also pass on a typo'd key and prove nothing.
    function test_strangerCannotMoveTheirOwnSettlementAccount() public {
        bytes32 node = _listAsJudge("judge-rows");

        vm.prank(judge);
        vm.expectRevert(
            abi.encodeWithSelector(
                EAC_UNAUTHORIZED, uint256(keccak256(abi.encode(node, bytes32(0)))), ROLE_SET_TEXT, judge
            )
        );
        LIVE_RESOLVER.setText(node, TollgateRecordsLib.X402_SETTLEMENT, "0.0.999999");

        assertEq(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_SETTLEMENT), "0.0.4242");
    }

    function test_strangerCannotRepriceACuratedListing() public {
        _listAsJudge("judge-rows");
        vm.prank(judge);
        vm.expectRevert();
        LIVE_RESOLVER.setText(_liveNode("uniswap-pools"), TollgateRecordsLib.X402_PRICE, "0.000001");
    }

    function test_cannotListForSomeoneElse() public {
        vm.prank(judge);
        vm.expectRevert(abi.encodeWithSelector(OpenTollgateRegistrar.NotSelf.selector, judge, other));
        open.list("judge-rows", other, _listing("0.0.4242"), uint64(block.timestamp + 30 days));
    }

    function test_rejectsLookalikeLabels() public {
        string[4] memory bad = ["Uniswap-Pools", "-lead", "trail-", "under_score"];
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(judge);
            vm.expectRevert(abi.encodeWithSelector(OpenTollgateRegistrar.InvalidLabel.selector, bad[i]));
            open.list(bad[i], judge, _listing("0.0.4242"), uint64(block.timestamp + 30 days));
        }
    }

    function test_termIsCapped() public {
        uint64 tooFar = uint64(block.timestamp) + 366 days;
        vm.prank(judge);
        vm.expectRevert(
            abi.encodeWithSelector(
                OpenTollgateRegistrar.ExpiryTooFar.selector, tooFar, uint64(block.timestamp) + 365 days
            )
        );
        open.list("judge-rows", judge, _listing("0.0.4242"), tooFar);
    }

    function test_incompleteListingReverts() public {
        vm.prank(judge);
        vm.expectRevert(abi.encodeWithSelector(OpenTollgateRegistrar.EmptyRecord.selector, "settlement"));
        open.list("judge-rows", judge, _listing(""), uint64(block.timestamp + 30 days));
    }

    ////////////////////////////////////////////////////////////////////////
    // Enumeration — what makes a stranger's listing discoverable without the dead log path
    ////////////////////////////////////////////////////////////////////////

    function test_listingsAreEnumerable() public {
        _listAsJudge("judge-rows");
        vm.prank(other);
        open.list("other-rows", other, _listing("0.0.5151"), uint64(block.timestamp + 30 days));

        assertEq(open.labelCount(), 2);
        string[] memory page = open.labelsFrom(0, 10);
        assertEq(page.length, 2);
        assertEq(page[0], "judge-rows");
        assertEq(page[1], "other-rows");
        assertEq(open.labelsFrom(1, 10)[0], "other-rows");
        assertEq(open.labelsFrom(5, 10).length, 0);
    }

    ////////////////////////////////////////////////////////////////////////
    // Revocation and moderation
    ////////////////////////////////////////////////////////////////////////

    function test_ownerCanWithdrawTheirOwn() public {
        bytes32 node = _listAsJudge("judge-rows");
        vm.prank(judge);
        open.revoke("judge-rows");
        assertEq(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_PRICE), "");
        assertEq(LIVE_REGISTRY.ownerOf(TollgateRecordsLib.tokenId("judge-rows")), address(0));
    }

    function test_strangerCannotRevokeSomeoneElses() public {
        _listAsJudge("judge-rows");
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(OpenTollgateRegistrar.NotOwnerOrAdmin.selector, other, "judge-rows"));
        open.revoke("judge-rows");
    }

    function test_strangerCannotRevokeACuratedListing() public {
        vm.prank(judge);
        vm.expectRevert(abi.encodeWithSelector(OpenTollgateRegistrar.NotOwnerOrAdmin.selector, judge, "uniswap-pools"));
        open.revoke("uniswap-pools");
    }

    function test_adminCanModerateAnyOpenListing() public {
        _listAsJudge("judge-rows");
        vm.prank(DEPLOYER);
        open.revoke("judge-rows");
        assertEq(LIVE_REGISTRY.ownerOf(TollgateRecordsLib.tokenId("judge-rows")), address(0));
    }

    /// @dev The cleanup path if the open registrar itself misbehaves: the curated registrar can
    ///      take down anything under the parent, including names this contract minted.
    function test_curatedRegistrarCanCleanUpOpenListings() public {
        bytes32 node = _listAsJudge("judge-rows");
        vm.prank(DEPLOYER);
        CURATED.revoke("judge-rows");
        assertEq(LIVE_RESOLVER.text(node, TollgateRecordsLib.X402_SETTLEMENT), "");
    }

    /// @dev The trap behind a real bug: `ownerOf` resolves the token id, not the raw labelhash.
    ///      If this ever stops holding, every ownership check above is testing the wrong thing.
    function test_ownerOfNeedsTheTokenIdNotTheLabelhash() public view {
        assertEq(LIVE_REGISTRY.ownerOf(TollgateRecordsLib.labelId("uniswap-pools")), address(0));
        assertTrue(LIVE_REGISTRY.ownerOf(TollgateRecordsLib.tokenId("uniswap-pools")) != address(0));
        // getExpiry masks for itself, so both forms agree — which is why the bug hid.
        assertEq(
            LIVE_REGISTRY.getExpiry(TollgateRecordsLib.labelId("uniswap-pools")),
            LIVE_REGISTRY.getExpiry(TollgateRecordsLib.tokenId("uniswap-pools"))
        );
    }

    ////////////////////////////////////////////////////////////////////////
    // Rollback
    ////////////////////////////////////////////////////////////////////////

    /// @dev Rollback is revoking what setUp granted. Afterwards the open door is shut and the
    ///      curated catalogue still resolves — the whole failure path, proven before it is needed.
    function test_rollbackShutsTheDoorAndLeavesTheCatalogue() public {
        vm.startPrank(DEPLOYER);
        assertTrue(LIVE_REGISTRY.revokeRootRoles(open.REQUIRED_REGISTRY_ROLES(), address(open)));
        assertTrue(LIVE_RESOLVER.revokeRootRoles(open.REQUIRED_RESOLVER_ROLES(), address(open)));
        vm.stopPrank();

        vm.prank(judge);
        vm.expectRevert();
        open.list("judge-rows", judge, _listing("0.0.4242"), uint64(block.timestamp + 30 days));

        assertGt(bytes(LIVE_RESOLVER.text(_liveNode("uniswap-pools"), TollgateRecordsLib.X402_PRICE)).length, 0);
    }
}
