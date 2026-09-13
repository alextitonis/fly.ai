// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {YesToken, NoToken} from "./Token.sol";
import {SwapMath} from "./lib/SwapMath.sol";
import {Math} from "./lib/Math.sol";
import {IMarketBuyCallback} from "./interfaces/IMarketBuyCallback.sol";
import {IMarketSellCallback} from "./interfaces/IMarketSellCallback.sol";
import {IMarketRedeemCallback} from "./interfaces/IMarketRedeemCallback.sol";
import {IMarketBondCallback} from "./interfaces/IMarketBondCallback.sol";

contract LvrMarket {
    event MarketInitialized(uint256 liquidity, uint256 collateralIn, uint256 timestamp);
    
    event OutcomeProposed(uint256 outcome, address indexed proposer, uint256 resolutionTimestamp);
    event MarketDisputed();
    event MarketSettled(uint256 outcome, address indexed proposer, uint256 bondReturned);
    event MarketResolvedByAdmin(uint256 outcome, address indexed admin);
    
    event MarketBuy(address indexed buyer, bool isBuyYes, uint256 amountIn, uint256 amountOut);
    event MarketSell(address indexed seller, bool isSellYes, uint256 amountIn, uint256 amountOut);
    event CollateralRedeemed(address indexed redeemer, uint256 amountYes, uint256 amountNo, uint256 payout);

    // Price snapshot for frontend charting - emitted on every trade
    event PriceSnapshot(
        uint256 indexed timestamp,
        uint256 priceYes,
        uint256 priceNo,
        uint256 reserveYes,
        uint256 reserveNo
    );

    enum MarketState {
        OPEN,
        CLOSED,
        PENDING,
        DISPUTED,
        RESOLVED
    }

    uint256 constant DISPUTE_WINDOW = 5 minutes; // 5 mins
    uint256 constant BOND_VALUE = 50;
    MarketState public state;
    uint256 private resolutionTimestamp;
    uint256 private outcome;
    address private proposer = address(0);

    YesToken public yesToken;
    NoToken public noToken;

    address public immutable i_admin;
    address public immutable i_router;
    address public immutable i_collateral;
    uint256 private liquidity;

    bool private liquidityInitialized;
    bool private isDynamic;

    uint256 private deadline;

    constructor(address _router, bool _type, uint256 duration, address _collateral, address admin){
        i_router = _router;
        isDynamic = _type;
        i_collateral = _collateral;
        i_admin = admin;

        deadline = block.timestamp + duration;
        state = MarketState.OPEN;
    }

    modifier isRouter() {
        require(msg.sender == i_router, "Invalid Caller Address");
        _;
    }

    function proposeOutcome(uint256 _outcome, address _proposer) external isRouter{
        require(state == MarketState.OPEN, "Market Not Open");
        require(block.timestamp >= deadline, "Market not finished");
        require(_outcome == 0 || _outcome == 1, "Invalid outcome");
        // Make a bond with the proposer to keep as collateral incase of false outcome
        uint256 balanceBefore = IERC20(i_collateral).balanceOf(address(this));
        bytes memory data = abi.encode(i_collateral, _proposer);
        IMarketBondCallback(msg.sender).marketBondCallback(BOND_VALUE, data);
        require(IERC20(i_collateral).balanceOf(address(this)) >= balanceBefore + BOND_VALUE);

        outcome = _outcome;
        state = MarketState.PENDING;
        resolutionTimestamp = block.timestamp + DISPUTE_WINDOW;
        proposer = _proposer;

        emit OutcomeProposed(_outcome, _proposer, resolutionTimestamp);
    }

    function dispute() external isRouter{
        require(state == MarketState.PENDING, "Challenge Window Not opened");
        // Break the bond 
        state = MarketState.DISPUTED;
        // set the market outcome through creator/resolver voting/admin
        
        emit MarketDisputed();
    }

    function settleMarket() external isRouter{
        require(block.timestamp >= resolutionTimestamp, "Challenge Window Open");
        // Return bond to proposer with Reward collected through market fees
        IERC20(i_collateral).transfer(proposer, BOND_VALUE); // Add fees and then reward the proposer
        state = MarketState.RESOLVED;

        emit MarketSettled(outcome, proposer, BOND_VALUE);
    }

    function adminResolve(uint256 _outcome) external {
        require(msg.sender == i_admin, "Only Admin can call this method");
        require(block.timestamp >= deadline, "Market not finished");
        require(_outcome == 0 || _outcome == 1, "Invalid outcome");
        require(state == MarketState.DISPUTED || state == MarketState.OPEN, "Invalid Market State");

        // If proposer is intialized then return the bond
        if(proposer != address(0)){
            IERC20(i_collateral).transfer(proposer, BOND_VALUE);
        }

        outcome = _outcome;
        state = MarketState.RESOLVED;

        emit MarketResolvedByAdmin(_outcome, msg.sender);
    }

    function redeemCollateralWithToken(uint256 amountYesIn, uint256 amountNoIn, address redeemer) external isRouter {
        require(state == MarketState.RESOLVED, "Market Not Resolved");

        bytes memory data = abi.encode(address(yesToken), address(noToken), redeemer);
        IMarketRedeemCallback(msg.sender).marketRedeemCallback(amountYesIn, amountNoIn, data);

        if(amountYesIn > 0) yesToken.burn(address(this), amountYesIn);
        if(amountNoIn > 0) noToken.burn(address(this), amountNoIn);

        uint256 payout = 0;
        if(outcome == 1) {
            payout = amountYesIn;
            IERC20(i_collateral).transfer(redeemer, amountYesIn);
        }else {
            payout = amountNoIn;
            IERC20(i_collateral).transfer(redeemer,  amountNoIn);
        }

        emit CollateralRedeemed(redeemer, amountYesIn, amountNoIn, payout);
    }

    function initializeLiquidity(uint256 collateralIn) external isRouter returns(uint256){
        require(!liquidityInitialized, "Liquidity already Initialized");
        yesToken = new YesToken(address(this), collateralIn);
        noToken = new NoToken(address(this), collateralIn);
        liquidity = Math.calcInitialLiquidity(collateralIn);
        liquidityInitialized = true;
        
        emit MarketInitialized(liquidity, collateralIn, block.timestamp);
        return liquidity;
    }

    function buy(bool isBuyYes, uint256 amountIn, address buyer) public isRouter {
        require(state == MarketState.OPEN, "Market Not Open");

        // Calculates amount of tokens to give after
        uint256 amountOut = _swap(!isBuyYes, int256(amountIn));

        bytes memory data = abi.encode(i_collateral, buyer);

        uint256 balanceBefore = IERC20(i_collateral).balanceOf(address(this));

        // Call the callback function in the router contract which transfers collateral from user to market
        IMarketBuyCallback(msg.sender).marketBuyCallback(amountIn, data);
        // Collateral is transferred to the Market

        require(IERC20(i_collateral).balanceOf(address(this)) >= balanceBefore + amountIn);

        // Mints yes and no tokens
        yesToken.mint(address(this), amountIn);
        noToken.mint(address(this), amountIn);

        // returns yes tokens to the user
        if(isBuyYes){
            IERC20(yesToken).transfer(buyer, amountIn + amountOut);
        }else{
            IERC20(noToken).transfer(buyer, amountIn + amountOut);
        }

        emit MarketBuy(buyer, isBuyYes, amountIn, amountOut);
        _emitPriceSnapshot();
    }

    function sell(bool isSellYes, uint256 amountIn, address seller) public isRouter {
        require(state == MarketState.OPEN, "Market Not Open");

        address tokenIn = isSellYes ? address(yesToken) : address(noToken);
        uint256 amountOut = _swap(isSellYes, int256(amountIn));

        uint256 tokenBalanceBefore = IERC20(tokenIn).balanceOf(address(this));

        bytes memory data = abi.encode(tokenIn, seller);
        IMarketSellCallback(msg.sender).marketSellCallback(amountIn, data);

        require(IERC20(tokenIn).balanceOf(address(this)) >= tokenBalanceBefore + amountIn);

        if(isSellYes){
            IERC20(noToken).transfer(seller, amountOut);
        }else{
            IERC20(yesToken).transfer(seller, amountOut);
        }

        emit MarketSell(seller, isSellYes, amountIn, amountOut);
        _emitPriceSnapshot();
    }

    function _swap(bool yesToNo, int256 amountIn) internal view returns(uint256){
        require(block.timestamp < deadline, "Market Expired");
        uint256 liq = isDynamic ? Math.calcLiquidity(liquidity, deadline, block.timestamp) : liquidity;

        int256 currentReserveYes = int256(IERC20(address(yesToken)).balanceOf(address(this)));
        int256 currentReserveNo = int256(IERC20(address(noToken)).balanceOf(address(this)));
        uint256 amountOut = SwapMath.getSwapAmount(yesToNo, currentReserveYes, currentReserveNo, liq, amountIn);
        return amountOut;
    }

    function getUserBalance(address user) public view returns(uint256) {
        return IERC20(address(yesToken)).balanceOf(user);
    }

    function getToken(bool tokenYes) public view returns(address) {
        return tokenYes ? address(yesToken) : address(noToken);
    }

    function getPriceYes() public view returns(uint256) {
        return Math.calcPrice(yesToken.balanceOf(address(this)), noToken.balanceOf(address(this)), liquidity);
    }

    function getPriceNo() public view returns(uint256) {
        return 1e18 - getPriceYes(); // Prices sum to 1.0 (1e18 in WAD)
    }

    function getMarketDetails() external view returns (
        MarketState currentState,
        uint256 marketDeadline,
        uint256 marketOutcome,
        uint256 marketLiquidity,
        uint256 reserveYes,
        uint256 reserveNo,
        uint256 priceYes,
        uint256 priceNo
    ) {
        return (
            state,
            deadline,
            outcome,
            liquidity,
            yesToken.balanceOf(address(this)),
            noToken.balanceOf(address(this)),
            getPriceYes(),
            getPriceNo()
        );
    }

    function _emitPriceSnapshot() internal {
        emit PriceSnapshot(
            block.timestamp,
            getPriceYes(),
            getPriceNo(),
            yesToken.balanceOf(address(this)),
            noToken.balanceOf(address(this))
        );
    }
}
