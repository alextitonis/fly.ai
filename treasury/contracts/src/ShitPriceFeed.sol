// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {TwapLibrary} from "./TwapLibrary.sol";
import {ITwapPriceFeed} from "./ITwapPriceFeed.sol";
import {ITokenPriceFeed} from "./ITokenPriceFeed.sol";
import {IPriceFeed} from "./IPriceFeed.sol";
import {ITreasuryPolicy} from "./ITreasuryPolicy.sol";
import {MultisigGuard} from "./MultisigGuard.sol";

/// @title ShitPriceFeed
/// @notice TWAP-based price feed for SHIT using Uniswap V3 pool observations
/// @dev Fail-closed: reverts on stale data or insufficient observations.
///      No Chainlink — reads on-chain TWAP directly from a configured Uni V3 pool.
///      Uses TwapLibrary (MIT) which wraps Uniswap V4 core TickMath/FullMath (MIT).
///      Implements ITwapPriceFeed for ShitPrice (SHIT Protocol V3 PRICE module fork).
///      Implements IPriceFeed for ShitStaking and TreasuryValuation.
contract ShitPriceFeed is ITwapPriceFeed, IPriceFeed, MultisigGuard {
    error TokenNotSupported(address token);

    address public pool;
    address public immutable shitToken;
    ITreasuryPolicy public immutable treasuryPolicy;
    uint32 public constant TWAP_PERIOD = 1800; // 30 minutes

    event PoolUpdated(address indexed newPool);

    constructor(address _pool, address _shitToken, address _treasuryPolicy, address _multisig) MultisigGuard(_multisig) {
        if (_pool == address(0) || _shitToken == address(0) || _treasuryPolicy == address(0)) revert ZeroAddress();
        pool = _pool;
        shitToken = _shitToken;
        treasuryPolicy = ITreasuryPolicy(_treasuryPolicy);
    }

    function setPool(address _newPool) external onlyMultisig {
        if (_newPool == address(0)) revert ZeroAddress();
        pool = _newPool;
        emit PoolUpdated(_newPool);
    }

    // ======== ITwapPriceFeed ======== //

    /// @inheritdoc ITwapPriceFeed
    function latestPrice() external view returns (uint256) {
        return TwapLibrary.getTwapPrice(pool, TWAP_PERIOD, false);
    }

    /// @inheritdoc ITwapPriceFeed
    function spotPrice() external view returns (uint256) {
        return TwapLibrary.getSpotPrice(pool, false);
    }

    // ======== IPriceFeed ======== //

    /// @inheritdoc ITokenPriceFeed
    function getTokenPrice(address token) external view returns (uint256) {
        if (token == shitToken) {
            return TwapLibrary.getTwapPrice(pool, TWAP_PERIOD, false);
        }
        revert TokenNotSupported(token);
    }

    /// @inheritdoc IPriceFeed
    function getNavPerToken() external view returns (uint256) {
        return treasuryPolicy.navPerShit();
    }
}
