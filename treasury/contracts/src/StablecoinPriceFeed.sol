// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {ITokenPriceFeed} from "./ITokenPriceFeed.sol";

/// @title StablecoinPriceFeed
/// @notice Fixed-price feed for stablecoins (USDC, USDT, AZUSD, etc.)
/// @dev Returns 1e18 (=$1.00) for any token. Used as the oracle for stablecoin
///      collateral in the DSS collateral manager where price is assumed to be $1.
///      For non-stablecoin collateral, use ImpactOracleAdapter with a Uni V3 pool.
contract StablecoinPriceFeed is ITokenPriceFeed {
    uint256 public constant PRICE = 1e18;

    function getTokenPrice(address) external view returns (uint256) {
        return PRICE;
    }
}
