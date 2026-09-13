// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title ITreasuryPolicy
/// @notice Interface for treasury policy RFV enforcement
interface ITreasuryPolicy {
    function enforceRfvInvariant(uint256 shitSupply) external view;
    function floorPrice() external view returns (uint256);
    function navPerShit() external view returns (uint256);
    function rfv() external view returns (uint256);
}
