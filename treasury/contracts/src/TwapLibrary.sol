// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title TwapLibrary
/// @notice Shared TWAP price computation from Uniswap V3 pools
/// @dev Eliminates duplicated TWAP logic across 5 oracle contracts.
///      Uses TickMath and FullMath from Uniswap V4 core (MIT license).
///      Prices are returned in 1e18 format.
interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}

library TwapLibrary {
    error InsufficientObservations();

    /// @notice Get TWAP price from a Uniswap V3 pool over a given period
    /// @param poolAddr The Uniswap V3 pool address
    /// @param twapPeriod The TWAP period in seconds
    /// @param tokenIsToken1 If true, the token of interest is token1 (price is inverted)
    /// @return price The time-weighted average price in 1e18 format
    function getTwapPrice(address poolAddr, uint32 twapPeriod, bool tokenIsToken1) internal view returns (uint256) {
        IUniswapV3Pool pool = IUniswapV3Pool(poolAddr);
        (, , , uint16 observationCardinality, , , ) = pool.slot0();
        if (observationCardinality < 2) revert InsufficientObservations();

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapPeriod;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = pool.observe(secondsAgos);

        int56 tickDelta = tickCumulatives[1] - tickCumulatives[0];
        int24 tick = int24(tickDelta / int56(int32(twapPeriod)));
        if (tickDelta < 0 && tickDelta % int56(int32(twapPeriod)) != 0) --tick;

        return _tickToPrice(tick, tokenIsToken1);
    }

    /// @notice Get the current spot price from a Uniswap V3 pool
    /// @param poolAddr The Uniswap V3 pool address
    /// @param tokenIsToken1 If true, the token of interest is token1 (price is inverted)
    /// @return price The spot price in 1e18 format
    function getSpotPrice(address poolAddr, bool tokenIsToken1) internal view returns (uint256) {
        IUniswapV3Pool pool = IUniswapV3Pool(poolAddr);
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
        return _sqrtPriceToPrice(sqrtPriceX96, tokenIsToken1);
    }

    function _tickToPrice(int24 tick, bool tokenIsToken1) private pure returns (uint256) {
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(tick);
        return _sqrtPriceToPrice(sqrtPriceX96, tokenIsToken1);
    }

    function _sqrtPriceToPrice(uint160 sqrtPriceX96, bool tokenIsToken1) private pure returns (uint256) {
        uint256 rawPrice = FullMath.mulDiv(uint256(sqrtPriceX96) * uint256(sqrtPriceX96), 1e18, 1 << 192);
        if (tokenIsToken1) {
            return rawPrice == 0 ? 0 : (1e36 / rawPrice);
        }
        return rawPrice;
    }
}
