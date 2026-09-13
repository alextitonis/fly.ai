// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title IReferralFeeSource
/// @notice Interface that protocol contracts (hooks, bonding) implement to allow
///         ReferralRegistry to withdraw referral fees that were recorded against them.
interface IReferralFeeSource {
    /// @notice Withdraw accumulated referral fees for a given token
    /// @param token The token to withdraw
    /// @param amount The amount to withdraw
    /// @return success Whether the withdrawal succeeded
    function withdrawReferralFees(address token, uint256 amount) external returns (bool success);
}
