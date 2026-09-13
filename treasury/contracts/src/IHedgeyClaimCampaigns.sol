// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title IHedgeyClaimCampaigns
/// @notice Minimal interface for Hedgey Finance ClaimCampaigns contract
/// @dev Used by ReferralRegistry to verify claims and read campaign data
interface IHedgeyClaimCampaigns {
    struct Campaign {
        address manager;
        address token;
        uint256 amount;
        uint256 end;
        uint8 tokenLockup;
        bytes32 root;
        bool delegating;
    }

    /// @notice Check if a user has claimed from a campaign
    /// @param campaignId The campaign ID
    /// @param user The user address
    /// @return Whether the user has claimed
    function claimed(bytes16 campaignId, address user) external view returns (bool);

    /// @notice Get campaign data
    /// @param id The campaign ID
    /// @return Campaign struct with manager, token, amount, end, tokenLockup, root, delegating
    function campaigns(bytes16 id) external view returns (Campaign memory);
}
