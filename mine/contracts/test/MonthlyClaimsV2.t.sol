// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {
    ITransparentUpgradeableProxy,
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MonthlyClaimsV2} from "../src/MonthlyClaimsV2.sol";
import {TestToken, FeeToken} from "./MonthlyClaims.t.sol";

/// an upgrade that appends nothing and adds one view, to check storage survives
contract MonthlyClaimsV2Next is MonthlyClaimsV2 {
    function version() external pure returns (uint256) {
        return 2;
    }
}

/// The V1 suite run through the proxy, plus the two settings (window, minimum hold) and the upgrade path.
/// Proofs come from contracts/test/fixtures/snapshot.json, written by the server's payout code.
contract MonthlyClaimsV2Test is Test {
    bytes32 constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    TestToken token;
    MonthlyClaimsV2 claims;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    uint64 constant WINDOW = 30 days;

    uint256 month;
    bytes32 root;
    uint256 total;
    address[] accounts;
    uint256[] amounts;
    string json;

    function deploy(IERC20 t, uint64 window, uint256 minHold) internal returns (MonthlyClaimsV2) {
        address impl = address(new MonthlyClaimsV2());
        return MonthlyClaimsV2(address(new TransparentUpgradeableProxy(impl, owner,
            abi.encodeCall(MonthlyClaimsV2.initialize, (t, window, minHold, owner)))));
    }

    function setUp() public {
        json = vm.readFile("test/fixtures/snapshot.json");
        month = vm.parseJsonUint(json, ".month");
        root = vm.parseJsonBytes32(json, ".root");
        total = vm.parseJsonUint(json, ".total");
        accounts = vm.parseJsonAddressArray(json, ".accounts");
        amounts = vm.parseJsonUintArray(json, ".amounts");

        token = new TestToken();
        claims = deploy(token, WINDOW, 0);
        token.mint(owner, total * 3);
        vm.prank(owner);
        token.approve(address(claims), type(uint256).max);
    }

    function proof(uint256 i) internal view returns (bytes32[] memory) {
        return vm.parseJsonBytes32Array(json, string.concat(".proofs[", vm.toString(i), "]"));
    }

    function open() internal {
        vm.prank(owner);
        claims.openMonth(month, root, uint128(total));
    }

    // ---- setup ----

    function test_initialState() public view {
        assertEq(address(claims.token()), address(token));
        assertEq(claims.claimWindow(), WINDOW);
        assertEq(claims.minHold(), 0);
        assertEq(claims.owner(), owner);
        address admin = address(uint160(uint256(vm.load(address(claims), ADMIN_SLOT))));
        assertEq(ProxyAdmin(admin).owner(), owner);
    }

    function test_initializeOnlyOnce() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        claims.initialize(token, WINDOW, 0, address(this));
    }

    function test_implementationCantBeInitialized() public {
        MonthlyClaimsV2 impl = new MonthlyClaimsV2();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(token, WINDOW, 0, address(this));
    }

    function test_initializeRefusesBadInputs() public {
        address impl = address(new MonthlyClaimsV2());
        vm.expectRevert(MonthlyClaimsV2.ZeroAddress.selector);
        new TransparentUpgradeableProxy(impl, owner,
            abi.encodeCall(MonthlyClaimsV2.initialize, (IERC20(address(0)), WINDOW, 0, owner)));
        vm.expectRevert(MonthlyClaimsV2.BadWindow.selector);
        new TransparentUpgradeableProxy(impl, owner, abi.encodeCall(MonthlyClaimsV2.initialize, (token, 6 days, 0, owner)));
        vm.expectRevert(MonthlyClaimsV2.BadWindow.selector);
        new TransparentUpgradeableProxy(impl, owner, abi.encodeCall(MonthlyClaimsV2.initialize, (token, 731 days, 0, owner)));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new TransparentUpgradeableProxy(impl, owner, abi.encodeCall(MonthlyClaimsV2.initialize, (token, WINDOW, 0, address(0))));
    }

    // ---- the V1 behaviour ----

    function test_openPullsExactlyTheTotal() public {
        uint256 before = token.balanceOf(owner);
        open();
        assertEq(token.balanceOf(address(claims)), total);
        assertEq(before - token.balanceOf(owner), total);
        (bytes32 r, uint128 t, uint128 c, uint64 deadline, bool swept) = claims.months(month);
        assertEq(r, root);
        assertEq(t, total);
        assertEq(c, 0);
        assertEq(deadline, block.timestamp + WINDOW);
        assertFalse(swept);
    }

    function test_rootCantBeReplaced() public {
        open();
        vm.prank(owner);
        vm.expectRevert(MonthlyClaimsV2.MonthExists.selector);
        claims.openMonth(month, keccak256("another root"), uint128(total));
    }

    function test_onlyOwnerOpens() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        claims.openMonth(month, root, uint128(total));
    }

    function test_badMonthsAndEmptyRoot() public {
        vm.startPrank(owner);
        vm.expectRevert(MonthlyClaimsV2.BadMonth.selector);
        claims.openMonth(202613, root, 1);
        vm.expectRevert(MonthlyClaimsV2.BadMonth.selector);
        claims.openMonth(202600, root, 1);
        vm.expectRevert(MonthlyClaimsV2.BadMonth.selector);
        claims.openMonth(999912, root, 1);
        vm.expectRevert(MonthlyClaimsV2.EmptyRoot.selector);
        claims.openMonth(month, bytes32(0), 1);
        vm.stopPrank();
    }

    function test_everyoneInTheSnapshotClaims() public {
        open();
        address relayer = makeAddr("relayer");
        for (uint256 i = 0; i < accounts.length; i++) {
            vm.prank(relayer); // anyone may send a claim; the tokens go to the account
            claims.claim(month, accounts[i], amounts[i], proof(i));
            assertEq(token.balanceOf(accounts[i]), amounts[i]);
            assertTrue(claims.hasClaimed(month, accounts[i]));
        }
        assertEq(token.balanceOf(relayer), 0);
        assertEq(token.balanceOf(address(claims)), 0);
        (,, uint128 claimed,,) = claims.months(month);
        assertEq(claimed, total);
    }

    function test_claimingTwiceFails() public {
        open();
        claims.claim(month, accounts[0], amounts[0], proof(0));
        vm.expectRevert(MonthlyClaimsV2.AlreadyClaimed.selector);
        claims.claim(month, accounts[0], amounts[0], proof(0));
    }

    function test_wrongAmountAccountOrMonthFails() public {
        open();
        bytes32[] memory p = proof(0);
        vm.expectRevert(MonthlyClaimsV2.BadProof.selector);
        claims.claim(month, accounts[0], amounts[0] + 1, p);
        vm.expectRevert(MonthlyClaimsV2.BadProof.selector);
        claims.claim(month, accounts[1], amounts[0], p);
        vm.expectRevert(MonthlyClaimsV2.UnknownMonth.selector);
        claims.claim(month + 1, accounts[0], amounts[0], p);
    }

    function test_claimsNeverExceedTheFundedTotal() public {
        vm.prank(owner);
        claims.openMonth(month, root, uint128(total - 1));
        uint256 last = accounts.length - 1;
        for (uint256 i = 0; i < last; i++) claims.claim(month, accounts[i], amounts[i], proof(i));
        vm.expectRevert(MonthlyClaimsV2.OverTotal.selector);
        claims.claim(month, accounts[last], amounts[last], proof(last));
    }

    function test_noClaimsAfterTheWindow() public {
        open();
        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectRevert(MonthlyClaimsV2.WindowClosed.selector);
        claims.claim(month, accounts[0], amounts[0], proof(0));
    }

    function test_sweepOnlyAfterTheWindowAndOnce() public {
        open();
        claims.claim(month, accounts[0], amounts[0], proof(0));
        vm.startPrank(owner);
        vm.expectRevert(MonthlyClaimsV2.WindowOpen.selector);
        claims.sweep(month, treasury);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectRevert(MonthlyClaimsV2.ZeroAddress.selector);
        claims.sweep(month, address(0));
        claims.sweep(month, treasury);
        assertEq(token.balanceOf(treasury), total - amounts[0]);
        vm.expectRevert(MonthlyClaimsV2.AlreadySwept.selector);
        claims.sweep(month, treasury);
        vm.stopPrank();
    }

    function test_onlyOwnerSweeps() public {
        open();
        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        claims.sweep(month, address(this));
    }

    function test_feeOnTransferTokenRefused() public {
        FeeToken fee = new FeeToken();
        MonthlyClaimsV2 c = deploy(IERC20(address(fee)), WINDOW, 0);
        fee.mint(owner, total);
        vm.startPrank(owner);
        fee.approve(address(c), total);
        vm.expectRevert(MonthlyClaimsV2.NotFullyFunded.selector);
        c.openMonth(month, root, uint128(total));
        vm.stopPrank();
    }

    function test_ownershipCantBeRenounced() public {
        vm.prank(owner);
        vm.expectRevert(MonthlyClaimsV2.RenounceDisabled.selector);
        claims.renounceOwnership();
        assertEq(claims.owner(), owner);
    }

    function test_monthsAreIndependent() public {
        open();
        vm.prank(owner);
        claims.openMonth(month + 1, root, uint128(total));
        claims.claim(month, accounts[0], amounts[0], proof(0));
        claims.claim(month + 1, accounts[0], amounts[0], proof(0));
        assertEq(token.balanceOf(accounts[0]), amounts[0] * 2);
    }

    // ---- claim window setting ----

    function test_windowChangeAppliesToLaterMonthsOnly() public {
        open(); // deadline = now + 30 days
        (,,, uint64 first,) = claims.months(month);
        vm.prank(owner);
        claims.setClaimWindow(14 days);
        assertEq(claims.claimWindow(), 14 days);
        vm.prank(owner);
        claims.openMonth(month + 1, root, uint128(total));
        (,,, uint64 second,) = claims.months(month + 1);
        assertEq(first, block.timestamp + WINDOW);
        assertEq(second, block.timestamp + 14 days);
        // the first month still pays after day 14
        vm.warp(block.timestamp + 20 days);
        claims.claim(month, accounts[0], amounts[0], proof(0));
        vm.expectRevert(MonthlyClaimsV2.WindowClosed.selector);
        claims.claim(month + 1, accounts[0], amounts[0], proof(0));
    }

    function test_windowBoundsAndOwnerOnly() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        claims.setClaimWindow(14 days);
        vm.startPrank(owner);
        vm.expectRevert(MonthlyClaimsV2.BadWindow.selector);
        claims.setClaimWindow(6 days);
        vm.expectRevert(MonthlyClaimsV2.BadWindow.selector);
        claims.setClaimWindow(731 days);
        claims.setClaimWindow(7 days);
        vm.stopPrank();
        assertEq(claims.claimWindow(), 7 days);
    }

    // ---- minimum hold ----

    function test_minHoldBlocksEmptyWalletsUntilTheyHold() public {
        open();
        vm.prank(owner);
        claims.setMinHold(1 ether);
        address a = accounts[0];
        vm.expectRevert(abi.encodeWithSelector(MonthlyClaimsV2.HoldTooLow.selector, 0, 1 ether));
        claims.claim(month, a, amounts[0], proof(0));
        token.mint(a, 1 ether - 1);
        vm.expectRevert(abi.encodeWithSelector(MonthlyClaimsV2.HoldTooLow.selector, 1 ether - 1, 1 ether));
        claims.claim(month, a, amounts[0], proof(0));
        token.mint(a, 1);
        claims.claim(month, a, amounts[0], proof(0));
        assertEq(token.balanceOf(a), 1 ether + amounts[0]);
    }

    function test_minHoldIsOnTheAccountNotTheSender() public {
        open();
        vm.prank(owner);
        claims.setMinHold(1 ether);
        address relayer = makeAddr("relayer");
        token.mint(relayer, 10 ether); // a rich sender doesn't help an empty account
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MonthlyClaimsV2.HoldTooLow.selector, 0, 1 ether));
        claims.claim(month, accounts[0], amounts[0], proof(0));
    }

    function test_minHoldBackToZeroAndOwnerOnly() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        claims.setMinHold(1 ether);
        open();
        vm.startPrank(owner);
        claims.setMinHold(1 ether);
        claims.setMinHold(0);
        vm.stopPrank();
        claims.claim(month, accounts[0], amounts[0], proof(0));
    }

    // ---- upgrades ----

    function test_upgradeKeepsStateAndOnlyTheAdminOwnerCanUpgrade() public {
        open();
        claims.claim(month, accounts[0], amounts[0], proof(0));
        vm.prank(owner);
        claims.setMinHold(5);
        address admin = address(uint160(uint256(vm.load(address(claims), ADMIN_SLOT))));
        address next = address(new MonthlyClaimsV2Next());

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        ProxyAdmin(admin).upgradeAndCall(ITransparentUpgradeableProxy(address(claims)), next, "");

        vm.prank(owner);
        ProxyAdmin(admin).upgradeAndCall(ITransparentUpgradeableProxy(address(claims)), next, "");
        assertEq(MonthlyClaimsV2Next(address(claims)).version(), 2);
        assertTrue(claims.hasClaimed(month, accounts[0]));
        (,, uint128 claimed,,) = claims.months(month);
        assertEq(claimed, amounts[0]);
        assertEq(claims.minHold(), 5);
        assertEq(claims.claimWindow(), WINDOW);
        assertEq(address(claims.token()), address(token));
    }
}
