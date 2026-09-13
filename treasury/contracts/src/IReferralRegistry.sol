// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title IReferralRegistry
/// @notice Interface for the ReferralRegistry contract
interface IReferralRegistry {
    struct Project {
        uint256 defaultFeeBps;
        uint256 platformShareBps;
        uint256 maxFeeBps;
        bool active;
    }

    struct ReferralAccount {
        address owner;
        uint256 projectId;
        uint256 customFeeBps;
        bool active;
    }

    event ProjectCreated(uint256 indexed projectId, address indexed owner, uint256 defaultFeeBps, uint256 platformShareBps);
    event ProjectUpdated(uint256 indexed projectId, uint256 defaultFeeBps, uint256 platformShareBps, bool active);
    event ReferralAccountCreated(address indexed account, address indexed owner, uint256 indexed projectId);
    event UserBound(address indexed user, address indexed referralAccount);
    event FeeRecorded(address indexed user, address indexed referralAccount, address indexed token, uint256 referrerShare, uint256 platformShare);
    event FeesClaimed(address indexed referralAccount, address indexed token, uint256 amount);
    event PlatformFeesClaimed(address indexed token, uint256 amount);
    event HedgeyCampaignEligibilityUpdated(bytes16 indexed campaignId, bool eligible);
    event HedgeyBonusBpsUpdated(uint256 indexed bps);
    event HedgeyBonusRecorded(bytes16 indexed campaignId, address indexed user, address indexed referrer, address token, uint256 claimAmount, uint256 bonusAmount);
    event HedgeyBonusFunded(address indexed token, uint256 amount);

    function createProject(uint256 defaultFeeBps, uint256 platformShareBps, uint256 maxFeeBps) external returns (uint256);
    function updateProject(uint256 projectId, uint256 defaultFeeBps, uint256 platformShareBps, bool active) external;
    function createReferralAccount(uint256 projectId, uint256 customFeeBps) external returns (address);
    function bindToReferrer(address referralAccount) external;
    function recordFee(address user, address token, uint256 protocolFeeAmount) external;
    function recordFeeBatch(address[] calldata users, address token, uint256[] calldata amounts) external;
    function claimFees(address token) external returns (uint256);
    function claimPlatformFees(address token) external;
    function setHedgeyClaimCampaigns(address _hedgey) external;
    function addEligibleHedgeyCampaign(bytes16 campaignId) external;
    function removeEligibleHedgeyCampaign(bytes16 campaignId) external;
    function setHedgeyBonusBps(uint256 _bps) external;
    function fundHedgeyBonus(address token, uint256 amount) external;
    function claimHedgeyBonus(bytes16 campaignId, bytes32[] calldata proof, uint256 claimAmount) external returns (uint256);
    function calculateFeeSplit(address user, uint256 protocolFeeAmount) external view returns (uint256 referrerShare, uint256 platformShare, bool hasReferrer);
    function getReferrerOf(address user) external view returns (address);
    function getReferralAccount(address account) external view returns (ReferralAccount memory);
    function getPendingFees(address referralAccount, address token) external view returns (uint256);
    function getProject(uint256 projectId) external view returns (Project memory);
    function isEligibleHedgeyCampaign(bytes16 campaignId) external view returns (bool);
    function hasHedgeyBonusBeenPaid(bytes16 campaignId, address user) external view returns (bool);
    function getHedgeyBonusConfig() external view returns (address hedgeyContract, uint256 bonusBps);
}
