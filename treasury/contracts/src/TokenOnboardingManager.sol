// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {TokenRegistry} from "./TokenRegistry.sol";

/// @title TokenOnboardingManager
/// @notice Multisig-gated onboarding flow for adding/removing tokens from the protocol
/// @dev Simplified whitelist pattern — multisig triggers add/remove via timelocked execute
///      Enforces minimum liquidity requirement before a token can be onboarded.
contract TokenOnboardingManager is AccessControlEnumerable {
    error ZeroAddress();
    error NotAContract(address token);
    error ProposalAlreadyExists(address token);
    error ProposalNotFound(address token);
    error ProposalNotReady(address token);
    error ProposalExpired(address token);
    error DuplicateProposal(address token);
    error InsufficientLiquidity(address token, uint256 reported, uint256 required);
    error NoLiquidityOracle();

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    TokenRegistry public immutable registry;

    // ======== MINIMUM LIQUIDITY REQUIREMENT ======== //
    uint256 public constant MIN_LIQUIDITY_USD = 10_000e18; // $10K minimum depth on a DEX
    address public liquidityOracle; // ILiquidityOracle that reports token liquidity depth

    enum ProposalType {
        ADD,
        REMOVE
    }

    enum ProposalState {
        PENDING,
        READY,
        EXECUTED,
        EXPIRED
    }

    struct OnboardingProposal {
        ProposalType proposalType;
        address token;
        string metadata; // IPFS hash or off-chain metadata URI
        uint64 submittedAt;
        uint64 timelockEnds; // submittedAt + delay
        bool executed;
    }

    uint64 public constant ONBOARDING_DELAY = 2 days; // timelock before execution
    uint64 public constant PROPOSAL_EXPIRY = 14 days; // proposal expires if not executed

    mapping(address => OnboardingProposal) public proposals;
    address[] public proposalList;

    event ProposalCreated(address indexed token, ProposalType indexed proposalType, string metadata, uint64 timelockEnds);
    event ProposalExecuted(address indexed token, ProposalType indexed proposalType);
    event ProposalCancelled(address indexed token);

    /// @param _registry The TokenRegistry contract address
    /// @param admin The Safe multisig that manages the onboarding flow
    constructor(TokenRegistry _registry, address admin) {
        if (address(_registry) == address(0)) revert ZeroAddress();
        if (admin == address(0)) revert ZeroAddress();
        registry = _registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
    }

    /// @notice Submit a proposal to onboard a new token
    /// @param token The ERC20 token address to onboard
    /// @param metadata IPFS hash or URI with token due diligence info
    function proposeAdd(address token, string calldata metadata) external onlyRole(MANAGER_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (token.code.length == 0) revert NotAContract(token);
        if (proposals[token].submittedAt != 0) revert ProposalAlreadyExists(token);

        // Enforce minimum liquidity requirement
        if (liquidityOracle != address(0)) {
            uint256 liquidity = ILiquidityOracle(liquidityOracle).getLiquidityDepth(token);
            if (liquidity < MIN_LIQUIDITY_USD) {
                revert InsufficientLiquidity(token, liquidity, MIN_LIQUIDITY_USD);
            }
        }

        uint64 now_ = uint64(block.timestamp);
        proposals[token] = OnboardingProposal({
            proposalType: ProposalType.ADD,
            token: token,
            metadata: metadata,
            submittedAt: now_,
            timelockEnds: now_ + ONBOARDING_DELAY,
            executed: false
        });
        proposalList.push(token);

        emit ProposalCreated(token, ProposalType.ADD, metadata, now_ + ONBOARDING_DELAY);
    }

    /// @notice Submit a proposal to remove a token from the protocol
    /// @param token The ERC20 token address to remove
    /// @param metadata Reason for removal
    function proposeRemove(address token, string calldata metadata) external onlyRole(MANAGER_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (proposals[token].submittedAt != 0) revert ProposalAlreadyExists(token);

        uint64 now_ = uint64(block.timestamp);
        proposals[token] = OnboardingProposal({
            proposalType: ProposalType.REMOVE,
            token: token,
            metadata: metadata,
            submittedAt: now_,
            timelockEnds: now_ + ONBOARDING_DELAY,
            executed: false
        });
        proposalList.push(token);

        emit ProposalCreated(token, ProposalType.REMOVE, metadata, now_ + ONBOARDING_DELAY);
    }

    /// @notice Execute a matured proposal
    /// @param token The token address of the proposal to execute
    function execute(address token) external onlyRole(MANAGER_ROLE) {
        OnboardingProposal storage proposal = proposals[token];
        if (proposal.submittedAt == 0) revert ProposalNotFound(token);
        if (proposal.executed) revert ProposalAlreadyExists(token);
        if (block.timestamp < proposal.timelockEnds) revert ProposalNotReady(token);
        if (block.timestamp > proposal.submittedAt + PROPOSAL_EXPIRY) revert ProposalExpired(token);

        proposal.executed = true;

        if (proposal.proposalType == ProposalType.ADD) {
            registry.whitelist(token);
        } else {
            registry.remove(token);
        }

        emit ProposalExecuted(token, proposal.proposalType);
    }

    /// @notice Cancel a pending proposal
    /// @param token The token address of the proposal to cancel
    function cancel(address token) external onlyRole(MANAGER_ROLE) {
        OnboardingProposal storage proposal = proposals[token];
        if (proposal.submittedAt == 0) revert ProposalNotFound(token);
        if (proposal.executed) revert ProposalAlreadyExists(token);

        delete proposals[token];

        emit ProposalCancelled(token);
    }

    /// @notice Get the state of a proposal
    /// @param token The token address to check
    /// @return The current ProposalState
    function getProposalState(address token) external view returns (ProposalState) {
        OnboardingProposal storage proposal = proposals[token];
        if (proposal.submittedAt == 0) return ProposalState.EXPIRED;
        if (proposal.executed) return ProposalState.EXECUTED;
        if (block.timestamp > proposal.submittedAt + PROPOSAL_EXPIRY) return ProposalState.EXPIRED;
        if (block.timestamp < proposal.timelockEnds) return ProposalState.PENDING;
        return ProposalState.READY;
    }

    /// @notice Get all proposal token addresses
    /// @return Array of token addresses that have proposals
    function getAllProposals() external view returns (address[] memory) {
        return proposalList;
    }

    /// @notice Set the liquidity oracle for minimum liquidity checks
    /// @param oracle Address of the ILiquidityOracle contract
    function setLiquidityOracle(address oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (oracle == address(0)) revert ZeroAddress();
        liquidityOracle = oracle;
    }

    /// @notice Check if a token meets the minimum liquidity requirement
    /// @param token The token address to check
    /// @return meets Whether the token meets the minimum liquidity requirement
    /// @return liquidity The reported liquidity depth in USD (1e18 = $1)
    function checkLiquidity(address token) external view returns (bool meets, uint256 liquidity) {
        if (liquidityOracle == address(0)) return (true, 0); // No oracle = no enforcement
        liquidity = ILiquidityOracle(liquidityOracle).getLiquidityDepth(token);
        meets = liquidity >= MIN_LIQUIDITY_USD;
    }
}

/// @notice Interface for checking token liquidity depth
interface ILiquidityOracle {
    /// @return liquidityUSD Total liquidity depth in USD (1e18 = $1)
    function getLiquidityDepth(address token) external view returns (uint256 liquidityUSD);
}
