// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title IValuationCalculator
/// @notice Interface for swappable valuation computation logic
/// @dev Deploy a new calculator with improved pricing/haircut logic and call
///      TreasuryValuation.setValuationCalculator() to swap it in.
interface IValuationCalculator {
    /// @notice Compute aggregate NAV and RFV from registered assets
    /// @param assetList List of asset token addresses
    /// @param assetsData Encoded asset metadata (type, priceFeed, haircutBps, manualValue, active)
    /// @param reserveTreasury Address of SHIT ProtocolTreasury (or zero for balanceOf fallback)
    /// @return nav Total net asset value
    /// @return rfv Total risk-free value (after haircuts)
    function computeValuations(
        address[] calldata assetList,
        bytes calldata assetsData,
        address reserveTreasury
    ) external view returns (uint256 nav, uint256 rfv);
}
