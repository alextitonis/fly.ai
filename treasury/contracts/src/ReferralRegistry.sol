// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin-upgradeable/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {MultisigGuard} from "./MultisigGuard.sol";
import {IReferralRegistry, IReferralRegistry as IRR} from "./IReferralRegistry.sol";
import {IReferralFeeSource} from "./IReferralFeeSource.sol";
import {IHedgeyClaimCampaigns} from "./IHedgeyClaimCampaigns.sol";

/// @title ReferralRegistry
/// @notice On-chain referral registry with fee splitting, Hedgey claim bonus, and pull-based claiming
/// @dev Deployed behind a UUPS proxy. Multisig controls upgrades and admin params.
///      All rewards are pull-based — no automatic token transfers.
contract ReferralRegistry is Initializable, UUPSUpgradeable, MultisigGuard, ReentrancyGuard, IReferralRegistry {
    using SafeERC20 for IERC20;

    // ======== ERRORS ======== //
    error ProjectNotActive();
    error ProjectNotFound();
    error AccountNotFound();
    error AccountNotActive();
    error AlreadyBound();
    error CannotSelfRefer();
    error InvalidFeeBps();
    error InvalidPlatformShare();
    error NotFeeSource();
    error NoPendingFees();
    error CampaignNotEligible();
    error NoReferrer();
    error BonusAlreadyPaid();
    error NotClaimedOnHedgey();
    error InvalidProof();
    error InsufficientBonusFunding();
    error InvalidBps();

    // ======== CONSTANTS ======== //
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_FEE_BPS = 5000; // 50% max referral fee

    // ======== STATE ======== //
    // Projects
    mapping(uint256 => IRR.Project) public projects;
    uint256 public projectCount;
    mapping(uint256 => address[]) public projectReferralAccounts;

    // Referral accounts
    mapping(address => IRR.ReferralAccount) public referralAccounts;
    mapping(address => uint256[]) public accountProjectList;

    // User bindings
    mapping(address => address) public userReferrer; // user => referralAccount address

    // Fee accumulation
    mapping(address => FeeAccumulator) internal _feeAccumulators; // referralAccount => FeeAccumulator
    mapping(address => mapping(address => uint256)) internal _platformFees; // token => multisig => amount

    struct FeeAccumulator {
        mapping(address => uint256) tokenBalances; // token => claimable amount
        uint256 totalClaimed;
    }

    // Referral counts
    mapping(address => uint256) public referralCount; // referralAccount => count

    // Fee sources (protocol contracts authorized to call recordFee)
    mapping(address => bool) public feeSources;

    // Hedgey integration
    address public hedgeyClaimCampaigns;
    mapping(bytes16 => bool) public eligibleHedgeyCampaigns;
    mapping(bytes16 => mapping(address => bool)) public hedgeyBonusPaid;
    uint256 public hedgeyBonusBps;
    mapping(address => uint256) public hedgeyBonusReserve; // token => balance held for payouts

    // ======== INITIALIZER ======== //
    /// @dev Constructor disables initializers for implementation contract
    constructor() MultisigGuard(address(0)) {
        _disableInitializers();
    }

    function initialize(address _multisig) external initializer {
        if (_multisig == address(0)) revert ZeroAddress();
        _initializeMultisig(_multisig);
        hedgeyBonusBps = 1000; // 10% default
    }

    // ======== PROJECT MANAGEMENT ======== //

    function createProject(uint256 defaultFeeBps, uint256 platformShareBps, uint256 maxFeeBps)
        external
        onlyMultisig
        returns (uint256)
    {
        if (defaultFeeBps > MAX_FEE_BPS) revert InvalidFeeBps();
        if (platformShareBps > BASIS_POINTS) revert InvalidPlatformShare();
        if (maxFeeBps > MAX_FEE_BPS) revert InvalidFeeBps();

        uint256 projectId = projectCount++;
        projects[projectId] = IRR.Project({
            defaultFeeBps: defaultFeeBps,
            platformShareBps: platformShareBps,
            maxFeeBps: maxFeeBps,
            active: true
        });

        emit ProjectCreated(projectId, msg.sender, defaultFeeBps, platformShareBps);
        return projectId;
    }

    function updateProject(uint256 projectId, uint256 defaultFeeBps, uint256 platformShareBps, bool active)
        external
        onlyMultisig
    {
        if (projectId >= projectCount) revert ProjectNotFound();
        if (defaultFeeBps > MAX_FEE_BPS) revert InvalidFeeBps();
        if (platformShareBps > BASIS_POINTS) revert InvalidPlatformShare();

        projects[projectId].defaultFeeBps = defaultFeeBps;
        projects[projectId].platformShareBps = platformShareBps;
        projects[projectId].active = active;

        emit ProjectUpdated(projectId, defaultFeeBps, platformShareBps, active);
    }

    // ======== REFERRAL ACCOUNT MANAGEMENT ======== //

    function createReferralAccount(uint256 projectId, uint256 customFeeBps)
        external
        returns (address)
    {
        if (projectId >= projectCount) revert ProjectNotFound();
        if (!projects[projectId].active) revert ProjectNotActive();
        if (customFeeBps > projects[projectId].maxFeeBps) revert InvalidFeeBps();

        address account = msg.sender;
        referralAccounts[account] = IRR.ReferralAccount({
            owner: msg.sender,
            projectId: projectId,
            customFeeBps: customFeeBps,
            active: true
        });

        projectReferralAccounts[projectId].push(account);

        emit ReferralAccountCreated(account, msg.sender, projectId);
        return account;
    }

    // ======== USER BINDING ======== //

    function bindToReferrer(address referralAccount) external {
        if (userReferrer[msg.sender] != address(0)) revert AlreadyBound();
        if (referralAccount == msg.sender) revert CannotSelfRefer();

        IRR.ReferralAccount memory acc = referralAccounts[referralAccount];
        if (acc.owner == address(0)) revert AccountNotFound();
        if (!acc.active) revert AccountNotActive();

        userReferrer[msg.sender] = referralAccount;
        referralCount[referralAccount]++;

        emit UserBound(msg.sender, referralAccount);
    }

    // ======== FEE SOURCE MANAGEMENT ======== //

    function setFeeSource(address source, bool enabled) external onlyMultisig {
        if (source == address(0)) revert ZeroAddress();
        feeSources[source] = enabled;
    }

    // ======== FEE RECORDING (called by protocol contracts) ======== //

    function recordFee(address user, address token, uint256 protocolFeeAmount) external {
        if (!feeSources[msg.sender]) revert NotFeeSource();

        address referrerAccount = userReferrer[user];
        if (referrerAccount == address(0)) return; // no referrer, no split

        (uint256 referrerShare, uint256 platformShare,) = _calculateFeeSplit(user, protocolFeeAmount);

        if (referrerShare > 0) {
            _feeAccumulators[referrerAccount].tokenBalances[token] += referrerShare;
        }
        if (platformShare > 0) {
            _platformFees[token][multisig] += platformShare;
        }

        emit FeeRecorded(user, referrerAccount, token, referrerShare, platformShare);
    }

    function recordFeeBatch(address[] calldata users, address token, uint256[] calldata amounts) external {
        if (!feeSources[msg.sender]) revert NotFeeSource();
        if (users.length != amounts.length) revert InvalidFeeBps();

        for (uint256 i = 0; i < users.length; i++) {
            address referrerAccount = userReferrer[users[i]];
            if (referrerAccount == address(0)) continue;

            (uint256 referrerShare, uint256 platformShare,) = _calculateFeeSplit(users[i], amounts[i]);

            if (referrerShare > 0) {
                _feeAccumulators[referrerAccount].tokenBalances[token] += referrerShare;
            }
            if (platformShare > 0) {
                _platformFees[token][multisig] += platformShare;
            }

            emit FeeRecorded(users[i], referrerAccount, token, referrerShare, platformShare);
        }
    }

    // ======== FEE CLAIMING (pull model) ======== //

    function claimFees(address token) external nonReentrant returns (uint256) {
        address account = msg.sender;
        uint256 amount = _feeAccumulators[account].tokenBalances[token];
        if (amount == 0) revert NoPendingFees();

        _feeAccumulators[account].tokenBalances[token] = 0;
        _feeAccumulators[account].totalClaimed += amount;

        // Pull tokens from the fee source (protocol contract)
        // First try: if this contract holds tokens (e.g. Hedgey bonus reserve), transfer directly
        uint256 selfBalance = IERC20(token).balanceOf(address(this));
        if (selfBalance >= amount) {
            IERC20(token).safeTransfer(account, amount);
        } else {
            // Pull from fee source contracts
            // For now, transfer what we have — protocol contracts must have funded the registry
            IERC20(token).safeTransfer(account, selfBalance);
        }

        emit FeesClaimed(account, token, amount);
        return amount;
    }

    function claimPlatformFees(address token) external onlyMultisig nonReentrant {
        uint256 amount = _platformFees[token][multisig];
        if (amount == 0) revert NoPendingFees();

        _platformFees[token][multisig] = 0;

        uint256 selfBalance = IERC20(token).balanceOf(address(this));
        if (selfBalance >= amount) {
            IERC20(token).safeTransfer(multisig, amount);
        } else {
            IERC20(token).safeTransfer(multisig, selfBalance);
        }

        emit PlatformFeesClaimed(token, amount);
    }

    // ======== HEDGEY BONUS MANAGEMENT (admin) ======== //

    function setHedgeyClaimCampaigns(address _hedgey) external onlyMultisig {
        if (_hedgey == address(0)) revert ZeroAddress();
        hedgeyClaimCampaigns = _hedgey;
    }

    function addEligibleHedgeyCampaign(bytes16 campaignId) external onlyMultisig {
        eligibleHedgeyCampaigns[campaignId] = true;
        emit HedgeyCampaignEligibilityUpdated(campaignId, true);
    }

    function removeEligibleHedgeyCampaign(bytes16 campaignId) external onlyMultisig {
        eligibleHedgeyCampaigns[campaignId] = false;
        emit HedgeyCampaignEligibilityUpdated(campaignId, false);
    }

    function setHedgeyBonusBps(uint256 _bps) external onlyMultisig {
        if (_bps > BASIS_POINTS) revert InvalidBps();
        hedgeyBonusBps = _bps;
        emit HedgeyBonusBpsUpdated(_bps);
    }

    function fundHedgeyBonus(address token, uint256 amount) external onlyMultisig {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        hedgeyBonusReserve[token] += amount;
        emit HedgeyBonusFunded(token, amount);
    }

    // ======== HEDGEY BONUS CLAIM (user-called, credits referrer's claimable balance) ======== //

    function claimHedgeyBonus(bytes16 campaignId, bytes32[] calldata proof, uint256 claimAmount)
        external
        nonReentrant
        returns (uint256)
    {
        if (!eligibleHedgeyCampaigns[campaignId]) revert CampaignNotEligible();

        address referrerAccount = userReferrer[msg.sender];
        if (referrerAccount == address(0)) revert NoReferrer();
        if (hedgeyBonusPaid[campaignId][msg.sender]) revert BonusAlreadyPaid();

        IHedgeyClaimCampaigns hedgey = IHedgeyClaimCampaigns(hedgeyClaimCampaigns);

        // Verify user has claimed on Hedgey
        if (!hedgey.claimed(campaignId, msg.sender)) revert NotClaimedOnHedgey();

        // Read campaign data for root + token
        IHedgeyClaimCampaigns.Campaign memory campaign = hedgey.campaigns(campaignId);

        // Verify Merkle proof against campaign root
        bytes32 leaf = keccak256(abi.encode(msg.sender, claimAmount));
        if (!MerkleProof.verify(proof, campaign.root, leaf)) revert InvalidProof();

        // Calculate bonus
        uint256 bonusAmount = (claimAmount * hedgeyBonusBps) / BASIS_POINTS;
        address token = campaign.token;

        // Check funding
        if (hedgeyBonusReserve[token] < bonusAmount) revert InsufficientBonusFunding();

        // Credit bonus to referrer's claimable balance (pull model — no transfer)
        _feeAccumulators[referrerAccount].tokenBalances[token] += bonusAmount;
        hedgeyBonusReserve[token] -= bonusAmount;

        // Mark as paid
        hedgeyBonusPaid[campaignId][msg.sender] = true;

        emit HedgeyBonusRecorded(campaignId, msg.sender, referrerAccount, token, claimAmount, bonusAmount);
        emit FeeRecorded(msg.sender, referrerAccount, token, bonusAmount, 0);

        return bonusAmount;
    }

    // ======== VIEW FUNCTIONS ======== //

    function calculateFeeSplit(address user, uint256 protocolFeeAmount)
        external
        view
        returns (uint256 referrerShare, uint256 platformShare, bool hasReferrer)
    {
        return _calculateFeeSplit(user, protocolFeeAmount);
    }

    function getReferrerOf(address user) external view returns (address) {
        return userReferrer[user];
    }

    function getReferralAccount(address account) external view returns (IRR.ReferralAccount memory) {
        return referralAccounts[account];
    }

    function getPendingFees(address referralAccount, address token) external view returns (uint256) {
        return _feeAccumulators[referralAccount].tokenBalances[token];
    }

    function getProject(uint256 projectId) external view returns (IRR.Project memory) {
        return projects[projectId];
    }

    function isEligibleHedgeyCampaign(bytes16 campaignId) external view returns (bool) {
        return eligibleHedgeyCampaigns[campaignId];
    }

    function hasHedgeyBonusBeenPaid(bytes16 campaignId, address user) external view returns (bool) {
        return hedgeyBonusPaid[campaignId][user];
    }

    function getHedgeyBonusConfig() external view returns (address, uint256) {
        return (hedgeyClaimCampaigns, hedgeyBonusBps);
    }

    function getReferralStats(address referralAccount)
        external
        view
        returns (uint256 totalClaimed, uint256 count)
    {
        return (_feeAccumulators[referralAccount].totalClaimed, referralCount[referralAccount]);
    }

    function getPlatformFees(address token) external view returns (uint256) {
        return _platformFees[token][multisig];
    }

    // ======== INTERNAL ======== //

    function _calculateFeeSplit(address user, uint256 protocolFeeAmount)
        internal
        view
        returns (uint256 referrerShare, uint256 platformShare, bool hasReferrer)
    {
        address referrerAccount = userReferrer[user];
        if (referrerAccount == address(0)) {
            return (0, 0, false);
        }

        IRR.ReferralAccount memory acc = referralAccounts[referrerAccount];
        IRR.Project memory project = projects[acc.projectId];

        uint256 feeBps = acc.customFeeBps > 0 ? acc.customFeeBps : project.defaultFeeBps;
        uint256 totalReferralFee = (protocolFeeAmount * feeBps) / BASIS_POINTS;

        referrerShare = (totalReferralFee * (BASIS_POINTS - project.platformShareBps)) / BASIS_POINTS;
        platformShare = totalReferralFee - referrerShare;
        hasReferrer = true;
    }

    // ======== UUPS ======== //

    function _authorizeUpgrade(address newImplementation) internal override onlyMultisig {}

    function upgradeTo(address newImplementation) external onlyMultisig {
        upgradeToAndCall(newImplementation, "");
    }

    // ======== STORAGE GAP ======== //
    uint256[44] __gap;
}
