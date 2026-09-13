// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.19;

import {Test, console} from "forge-std/Test.sol";
import {Router} from "src/Router.sol";
import {LvrMarket} from "src/LvrMarket.sol";
import {MockUSD} from "src/MockUSD.sol";
import {Math} from "src/lib/Math.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";

contract RouterTest is Test {
    uint256 constant INITIAL_USER_DEPOSIT = 100 ether;
    uint256 constant INITIAL_MARKET_COLLATERAL = 1000 ether;
    uint256 constant COLLATERAL_DEPOSIT = 10 ether;
    uint256 constant MARKET_DURATION = 7 days;

    Router router;
    MockUSD mUSD;

    address public user = makeAddr("user");
    address public user2 = makeAddr("user2");
    address public marketCreator = makeAddr("creator");

    address public market;
    bytes32 public marketId;

    function setUp() public {
        mUSD = new MockUSD();
        router = new Router(address(mUSD));

        mUSD.mint(user, INITIAL_USER_DEPOSIT);
        mUSD.mint(user2, INITIAL_USER_DEPOSIT);
        mUSD.mint(marketCreator, INITIAL_MARKET_COLLATERAL);
    }

    modifier createMarket() {
        string memory title = "Will ETH go above $5000 by end of 2026?";
        string memory description = "This market resolves YES if ETH/USD >= 5000 on any major exchange.";
        string memory resolutionSource = "CoinGecko";

        vm.startPrank(marketCreator);
        mUSD.approve(address(router), INITIAL_MARKET_COLLATERAL);
        router.create(
            title,
            description,
            resolutionSource,
            true, // isDynamic
            MARKET_DURATION,
            INITIAL_MARKET_COLLATERAL
        );
        
        // Get first market
        (market, marketId) = router.getMarketAtIndex(0);
        vm.stopPrank();
        _;
    }

    // ============ Market Creation Tests ============

    function test_CreateMarket() public createMarket {
        assertEq(router.getMarketCount(), 1, "Market count should be 1");
        
        (
            address marketAddr,
            uint256 liquidity,
            string memory title,
            string memory description,
            string memory resolutionSource
        ) = router.getMarketMetadata(marketId);

        assertEq(marketAddr, market, "Market address mismatch");
        assertGt(liquidity, 0, "Liquidity should be > 0");
        assertEq(title, "Will ETH go above $5000 by end of 2026?");
        assertEq(resolutionSource, "CoinGecko");
        assertEq(mUSD.balanceOf(market), INITIAL_MARKET_COLLATERAL, "Collateral not received");
    }

    function test_GetAllMarkets() public createMarket {
        address[] memory allMarkets = router.getAllMarkets();
        assertEq(allMarkets.length, 1);
        assertEq(allMarkets[0], market);
    }

    // ============ Trading Tests ============

    function test_BuyYes() public createMarket {
        vm.startPrank(user);
        mUSD.approve(address(router), COLLATERAL_DEPOSIT);
        
        uint256 balanceBefore = mUSD.balanceOf(user);
        router.buyYes(market, COLLATERAL_DEPOSIT);
        
        assertEq(mUSD.balanceOf(user), balanceBefore - COLLATERAL_DEPOSIT, "Collateral not deducted");
        
        address yesToken = LvrMarket(market).getToken(true);
        assertGt(IERC20(yesToken).balanceOf(user), 0, "User should have YES tokens");
        vm.stopPrank();
    }

    function test_BuyNo() public createMarket {
        vm.startPrank(user);
        mUSD.approve(address(router), COLLATERAL_DEPOSIT);
        
        router.buyNo(market, COLLATERAL_DEPOSIT);
        
        address noToken = LvrMarket(market).getToken(false);
        assertGt(IERC20(noToken).balanceOf(user), 0, "User should have NO tokens");
        vm.stopPrank();
    }

    function test_PriceChangesAfterTrade() public createMarket {
        uint256 priceBefore = LvrMarket(market).getPriceYes();
        
        vm.startPrank(user);
        mUSD.approve(address(router), COLLATERAL_DEPOSIT);
        router.buyYes(market, COLLATERAL_DEPOSIT);
        vm.stopPrank();
        
        uint256 priceAfter = LvrMarket(market).getPriceYes();
        assertGt(priceAfter, priceBefore, "Price should increase after buying YES");
    }

    function test_PriceYesPlusNoEqualsOne() public createMarket {
        uint256 priceYes = LvrMarket(market).getPriceYes();
        uint256 priceNo = LvrMarket(market).getPriceNo();
        
        // Should sum to 1e18 (within rounding tolerance)
        assertApproxEqAbs(priceYes + priceNo, 1e18, 1e10, "Prices should sum to 1.0");
    }

    // ============ Market Details Test ============

    function test_GetMarketDetails() public createMarket {
        (
            LvrMarket.MarketState currentState,
            uint256 marketDeadline,
            uint256 marketOutcome,
            uint256 marketLiquidity,
            uint256 reserveYes,
            uint256 reserveNo,
            uint256 priceYes,
            uint256 priceNo
        ) = LvrMarket(market).getMarketDetails();

        assertEq(uint256(currentState), 0, "Should be OPEN state");
        assertGt(marketDeadline, block.timestamp, "Deadline should be in future");
        assertEq(marketOutcome, 0, "Outcome should be 0 initially");
        assertGt(marketLiquidity, 0, "Should have liquidity");
        assertEq(reserveYes, reserveNo, "Initial reserves should be equal");
    }

    // ============ Resolution Tests ============

    function test_AdminResolve() public createMarket {
        // Fast forward past deadline
        vm.warp(block.timestamp + MARKET_DURATION + 1);
        
        vm.prank(marketCreator);
        LvrMarket(market).adminResolve(1); // Resolve YES
        
        (LvrMarket.MarketState currentState,,,,,,,) = LvrMarket(market).getMarketDetails();
        assertEq(uint256(currentState), 4, "Should be RESOLVED state");
    }

    function test_RedeemAfterResolution() public createMarket {
        // Buy YES tokens
        vm.startPrank(user);
        mUSD.approve(address(router), COLLATERAL_DEPOSIT);
        router.buyYes(market, COLLATERAL_DEPOSIT);
        vm.stopPrank();
        
        address yesToken = LvrMarket(market).getToken(true);
        uint256 yesBalance = IERC20(yesToken).balanceOf(user);
        
        // Fast forward and resolve
        vm.warp(block.timestamp + MARKET_DURATION + 1);
        vm.prank(marketCreator);
        LvrMarket(market).adminResolve(1); // YES wins
        
        // Redeem
        uint256 balanceBefore = mUSD.balanceOf(user);
        
        vm.startPrank(user);
        IERC20(yesToken).approve(address(router), yesBalance);
        router.redeem(market, yesBalance, 0);
        vm.stopPrank();
        
        assertGt(mUSD.balanceOf(user), balanceBefore, "Should receive payout");
    }
}
