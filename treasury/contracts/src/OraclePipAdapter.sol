// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {PipLike} from "@dss/spot.sol";
import {ITokenPriceFeed} from "./ITokenPriceFeed.sol";

/// @title OraclePipAdapter
/// @notice Wraps ImpactOracleAdapter (getTokenPrice) into DSS PipLike (peek) interface
/// @dev This is the only glue needed to connect ImpactOracleAdapter to DSS Spotter/OSM.
///      ImpactOracleAdapter returns uint256 price in 1e18; PipLike expects bytes32 val.
contract OraclePipAdapter is PipLike {
    error ZeroAddress();

    ITokenPriceFeed public immutable source; // IPriceFeed-compatible price feed
    address public immutable token;  // The token this adapter prices

    constructor(address _source, address _token) {
        if (_source == address(0) || _token == address(0)) revert ZeroAddress();
        source = ITokenPriceFeed(_source);
        token = _token;
    }

    function peek() external view override returns (bytes32 val, bool has) {
        try source.getTokenPrice(token) returns (uint256 price) {
            if (price > 0) {
                val = bytes32(price);
                has = true;
            }
        } catch {}
    }
}
