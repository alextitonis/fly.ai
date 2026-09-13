// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {LvrMarket} from "src/LvrMarket.sol";
import {IMarketBuyCallback} from "./interfaces/IMarketBuyCallback.sol";
import {IMarketSellCallback} from "./interfaces/IMarketSellCallback.sol";
import {IMarketRedeemCallback} from "./interfaces/IMarketRedeemCallback.sol";   
import {IMarketBondCallback} from "./interfaces/IMarketBondCallback.sol";

contract Router is IMarketBuyCallback, IMarketSellCallback, IMarketRedeemCallback, IMarketBondCallback{
    // Enhanced event with full metadata for frontend indexing
    event MarketCreated(
        bytes32 indexed marketId, 
        address indexed market,
        address indexed creator,
        string title,
        string description,
        string resolutionSource,
        uint256 deadline,
        uint256 liquidity
    );

    struct MarketMetadata {
        string title;
        string description;
        string resolutionSource;
    }

    struct MarketInfo {
        address market;
        uint256 liquidity;
        bool initialized;
        MarketMetadata metadata;
    }

    mapping(bytes32 marketId => MarketInfo info) public markets;
    address[] public allMarkets; // Array for enumeration
    bytes32[] public allMarketIds; // Corresponding market IDs
    IERC20 public mUSD; // Collateral Token
    
    constructor(address _mUSD){
        mUSD = IERC20(_mUSD);
    } 

    function create(
        string memory title, 
        string memory description,
        string memory resolutionSource,
        bool isDynamic, 
        uint256 duration, 
        uint256 collateralIn
    ) public {
        // A new market is deployed
        bytes32 marketId = keccak256(abi.encodePacked(title, msg.sender, block.timestamp));
        require(!markets[marketId].initialized, "Market Already Exists");

        LvrMarket market = new LvrMarket(address(this), isDynamic, duration, address(mUSD), msg.sender);
        
        // Transfer USD token to market contract
        mUSD.transferFrom(msg.sender, address(market), collateralIn);
        uint256 liquidity = market.initializeLiquidity(collateralIn);

        markets[marketId] = MarketInfo({
            market: address(market),
            liquidity: liquidity,
            initialized: true,
            metadata: MarketMetadata({
                title: title,
                description: description,
                resolutionSource: resolutionSource
            })
        });

        allMarkets.push(address(market));
        allMarketIds.push(marketId);
        
        emit MarketCreated(
            marketId, 
            address(market), 
            msg.sender,
            title,
            description,
            resolutionSource,
            block.timestamp + duration,
            liquidity
        );
    }

    // View functions for frontend enumeration
    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    function getMarketAtIndex(uint256 index) external view returns (address market, bytes32 marketId) {
        require(index < allMarkets.length, "Index out of bounds");
        return (allMarkets[index], allMarketIds[index]);
    }

    function getMarketMetadata(bytes32 marketId) external view returns (
        address market,
        uint256 liquidity,
        string memory title,
        string memory description,
        string memory resolutionSource
    ) {
        MarketInfo storage info = markets[marketId];
        require(info.initialized, "Market does not exist");
        return (
            info.market,
            info.liquidity,
            info.metadata.title,
            info.metadata.description,
            info.metadata.resolutionSource
        );
    }

    function getAllMarkets() external view returns (address[] memory) {
        return allMarkets;
    }

    function buyYes(address market, uint256 collateralIn) public {
        // Takes mUSD from user
        // Mints Yes + No token
        // Sells No token to AMM
        // Sends corresponding Yes token to User

        LvrMarket(market).buy(true, collateralIn, msg.sender);
    }

    function buyNo(address market, uint256 collateralIn) public {
        LvrMarket(market).buy(false, collateralIn, msg.sender);
    }

    function sellYes(address market, uint256 tokenIn) public {
        // Takes yesToken from the user
        // Sells Yes token to AMM
        // Sends corresponding No token to User
        LvrMarket(market).sell(true, tokenIn, msg.sender);
    }

    function sellNo(address market, uint256 tokenIn) public {
        LvrMarket(market).sell(false, tokenIn, msg.sender);
    }

    function proposerOutcome(address market, uint256 _outcome) public {
        LvrMarket(market).proposeOutcome(_outcome, msg.sender);
    }

    function dispute(address market) public {
        LvrMarket(market).dispute();
    }

    function settleMarket(address market) public {
        LvrMarket(market).settleMarket();
    }

    function redeem(address market, uint256 amountYes, uint256 amountNo) public {
        LvrMarket(market).redeemCollateralWithToken(amountYes, amountNo, msg.sender);
    }

    // Callbacks

    function marketBuyCallback(uint256 collateralIn, bytes calldata data) external override {
        (address collateral, address buyer) = abi.decode(data, (address, address));

        // msg.sender is the Market Contract which calls the callback
        IERC20(collateral).transferFrom(buyer, msg.sender, collateralIn);
    }

    function marketSellCallback(uint256 tokenIn, bytes calldata data) external override {
        (address tokenToSell, address seller) = abi.decode(data, (address, address));

        IERC20(tokenToSell).transferFrom(seller, msg.sender, tokenIn);
    }

    function marketRedeemCallback(uint256 amountYes, uint256 amountNo, bytes calldata data) external override {
        (address yesToken, address noToken, address redeemer) = abi.decode(data, (address, address, address));

        IERC20(yesToken).transferFrom(redeemer, msg.sender, amountYes);
        IERC20(noToken).transferFrom(redeemer, msg.sender, amountNo);
    }

    function marketBondCallback(uint256 bond, bytes calldata data) external override {
        (address collateral, address proposer) = abi.decode(data, (address, address));

        IERC20(collateral).transferFrom(proposer, msg.sender, bond);
    }
}