// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title ITokenPriceFeed
/// @notice Interface for price feeds that return token prices
/// @dev Used by contracts that only need getTokenPrice (ImpactOracleAdapter, ShitCircuitBreaker, OraclePipAdapter).
///      IPriceFeed extends this with getNavPerToken for contracts that also need NAV.
interface ITokenPriceFeed {
    function getTokenPrice(address token) external view returns (uint256);
}
