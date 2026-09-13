// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {ITokenPriceFeed} from "./ITokenPriceFeed.sol";

/// @title IPriceFeed
/// @notice Interface for Shit price feed oracle
/// @dev Extends ITokenPriceFeed with getNavPerToken for contracts that need NAV (ShitStaking).
interface IPriceFeed is ITokenPriceFeed {
    function getNavPerToken() external view returns (uint256);
}
