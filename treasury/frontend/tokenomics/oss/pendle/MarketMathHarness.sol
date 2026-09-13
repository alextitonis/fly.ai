// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SimplifiedMarketMathHarness
/// @notice A deliberately simplified Pendle-style PT/SY implied-rate AMM harness.
/// @dev This is not Pendle production math. It is a pedagogical model for testing
///      market-direction intuition and boundary behavior:
///
///      PT buy  -> pool PT decreases -> PT proportion decreases -> exchangeRate decreases
///              -> PT price increases -> implied APY decreases
///
///      PT sell -> pool PT increases -> PT proportion increases -> exchangeRate increases
///              -> PT price decreases -> implied APY increases
///
///      The real Pendle AMM uses fixed-point log/exp math, rate scalar, rate anchor,
///      PYIndex conversions, fees, reserve fees, and additional boundary checks.
///      This harness intentionally isolates the main shape of the curve.
contract SimplifiedMarketMathHarness {
    uint256 public constant ONE = 1e18;
    uint256 public constant YEAR = 365 days;

    /// @notice We avoid implementing a full natural log / exp library here.
    /// @dev For the boundary tests, we use a simplified monotonic proxy:
    ///
    ///      exchangeRate = rateAnchor + proportion / rateScalar
    ///
    ///      Real Pendle uses:
    ///
    ///      exchangeRate = rateAnchor + logit(proportion) / rateScalar
    ///
    ///      where:
    ///
    ///      logit(p) = ln(p / (1 - p))
    ///
    ///      This simplified version preserves the direction:
    ///
    ///      proportion up   -> exchangeRate up
    ///      proportion down -> exchangeRate down
    ///
    ///      but it does not reproduce real Pendle prices.
    struct Market {
        uint256 totalPt;
        uint256 totalAsset;
        uint256 rateScalar;
        uint256 rateAnchor;
        uint256 timeToExpiry;
    }

    struct MarketView {
        uint256 proportion;
        uint256 exchangeRate;
        uint256 ptPrice;
        uint256 impliedApyProxy;
    }

    function getView(Market memory market) external pure returns (MarketView memory view_) {
        _validateMarket(market);

        view_.proportion = getProportion(market.totalPt, market.totalAsset);
        view_.exchangeRate = getExchangeRate(market);
        view_.ptPrice = ptPriceFromExchangeRate(view_.exchangeRate);
        view_.impliedApyProxy = impliedApyProxyFromExchangeRate(view_.exchangeRate, market.timeToExpiry);
    }

    /// @notice Compute PT proportion in the Pendle-style state variable.
    /// @dev Real Pendle uses:
    ///
    ///      proportion = totalPt / (totalPt + totalAsset)
    function getProportion(uint256 totalPt, uint256 totalAsset) public pure returns (uint256) {
        require(totalPt > 0, "zero PT");
        require(totalAsset > 0, "zero asset");

        return (totalPt * ONE) / (totalPt + totalAsset);
    }

    /// @notice Simplified monotonic exchange-rate curve.
    /// @dev This replaces Pendle's logit curve with a linear monotonic proxy.
    function getExchangeRate(Market memory market) public pure returns (uint256) {
        _validateMarket(market);

        uint256 proportion = getProportion(market.totalPt, market.totalAsset);
        uint256 slopeComponent = (proportion * ONE) / market.rateScalar;

        return market.rateAnchor + slopeComponent;
    }

    /// @notice PT price proxy in asset units.
    /// @dev Since exchangeRate is approximately inverse PT price:
    ///
    ///      PT price ≈ 1 / exchangeRate
    function ptPriceFromExchangeRate(uint256 exchangeRate) public pure returns (uint256) {
        require(exchangeRate >= ONE, "exchange rate below one");
        return (ONE * ONE) / exchangeRate;
    }

    /// @notice Simplified annualized implied-rate proxy.
    /// @dev Real Pendle uses:
    ///
    ///      impliedRate = ln(exchangeRate) * YEAR / timeToExpiry
    ///
    ///      To avoid log math in this educational harness, we use:
    ///
    ///      impliedApyProxy = (exchangeRate - 1) * YEAR / timeToExpiry
    ///
    ///      For small deviations from 1, ln(E) ≈ E - 1, so this is directionally useful.
    function impliedApyProxyFromExchangeRate(uint256 exchangeRate, uint256 timeToExpiry)
        public
        pure
        returns (uint256)
    {
        require(exchangeRate >= ONE, "exchange rate below one");
        require(timeToExpiry > 0, "zero time");

        return ((exchangeRate - ONE) * YEAR) / timeToExpiry;
    }

    /// @notice Simulate a PT buy.
    /// @dev User receives PT, so pool PT reserve decreases.
    function buyPt(Market memory market, uint256 ptOut) external pure returns (Market memory newMarket) {
        _validateMarket(market);
        require(ptOut > 0, "zero ptOut");
        require(ptOut < market.totalPt, "insufficient PT");

        newMarket = market;
        newMarket.totalPt = market.totalPt - ptOut;
    }

    /// @notice Simulate a PT sell.
    /// @dev User sends PT to pool, so pool PT reserve increases.
    function sellPt(Market memory market, uint256 ptIn) external pure returns (Market memory newMarket) {
        _validateMarket(market);
        require(ptIn > 0, "zero ptIn");

        newMarket = market;
        newMarket.totalPt = market.totalPt + ptIn;
    }

    /// @notice Compare implied APY proxy for same exchange-rate deviation at different maturities.
    function impliedApyProxyAtMaturity(uint256 exchangeRate, uint256 timeToExpiry)
        external
        pure
        returns (uint256)
    {
        return impliedApyProxyFromExchangeRate(exchangeRate, timeToExpiry);
    }

    function _validateMarket(Market memory market) internal pure {
        require(market.totalPt > 0, "zero totalPt");
        require(market.totalAsset > 0, "zero totalAsset");
        require(market.rateScalar > 0, "zero rateScalar");
        require(market.rateAnchor >= ONE, "anchor below one");
        require(market.timeToExpiry > 0, "zero time");
    }
}