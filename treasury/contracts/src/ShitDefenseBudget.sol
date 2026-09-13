// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Kernel, Policy, Keycode, toKeycode, Permissions} from "@shit-v3/Kernel.sol";
import {ROLESv1} from "@shit-v3/modules/ROLES/ROLES.v1.sol";
import {IPeriodicTask} from "@shit-v3/interfaces/IPeriodicTask.sol";
import {IERC165} from "@openzeppelin-4.8.0/interfaces/IERC165.sol";
import {IOperator} from "@shit-v3/policies/interfaces/IOperator.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MultisigGuard} from "./MultisigGuard.sol";
import {ShitCircuitBreaker} from "./ShitCircuitBreaker.sol";

/// @title ShitDefenseBudget
/// @notice Per-epoch treasury defense budget for RBS wall operations
/// @dev The SHIT Protocol V3 Operator has capacity + regen, but no hard cap on total
///      treasury drawdown per epoch/day. Under sustained one-directional pressure,
///      the treasury could keep defending the wall until reserves are meaningfully
///      drawn down (Frax AMO lesson).
///
///      This contract is a Kernel Policy that implements IPeriodicTask.
///      It is registered as a periodic task on the Heart, which calls execute()
///      on each beat. execute() calls IOperator.operate() with budget enforcement.
///
///      Design:
///      - Tracks SHIT token outflows from treasury during wall defense
///      - Per-epoch budget (default: 2% of liquid treasury value)
///      - When budget exhausted, blocks further operate() calls until next epoch
///      - Multisig can adjust budget or emergency override
contract ShitDefenseBudget is Policy, IPeriodicTask, MultisigGuard {
    error BudgetExhausted();
    error InvalidParams();
    error OperatorNotSet();
    error CircuitBreakerTripped();

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant EPOCH_LENGTH = 8 hours;

    IOperator public operator; // SHIT Protocol V3 Operator
    address public treasury; // Treasury address (SHIT source for defense)
    address public shitToken;

    uint256 public budgetBps = 200; // 2% of liquid treasury per epoch
    uint256 public epochStart;
    uint256 public epochSpent;
    uint256 public liquidTreasuryValue; // Updated by multisig

    bool public budgetOverride; // Multisig can disable budget enforcement

    // Circuit breaker integration — when set, defense spending halts if Bucky depegs
    ShitCircuitBreaker public circuitBreaker;

    ROLESv1 internal ROLES;

    event BudgetUpdated(uint256 indexed bps);
    event EpochReset(uint256 indexed epochStart, uint256 indexed carriedOver);
    event SpendingRecorded(uint256 indexed amount, uint256 indexed totalThisEpoch);
    event BudgetExhaustedEvent(uint256 indexed spent, uint256 indexed budget);
    event OverrideToggled(bool indexed override_);
    event OperatorUpdated(address indexed operator);
    event CircuitBreakerSet(address indexed breaker);

    constructor(
        Kernel kernel_,
        address _operator,
        address _treasury,
        address _shitToken,
        address _multisig
    ) Policy(kernel_) MultisigGuard(_multisig) {
        if (_treasury == address(0) || _shitToken == address(0) || _multisig == address(0))
            revert ZeroAddress();
        if (_operator != address(0)) {
            operator = IOperator(_operator);
        }
        treasury = _treasury;
        shitToken = _shitToken;
        epochStart = block.timestamp;
    }

    /// @inheritdoc Policy
    function configureDependencies() external override returns (Keycode[] memory dependencies) {
        dependencies = new Keycode[](1);
        dependencies[0] = toKeycode("ROLES");
        ROLES = ROLESv1(getModuleAddress(dependencies[0]));
    }

    /// @inheritdoc Policy
    function requestPermissions() external view override returns (Permissions[] memory requests) {
        requests = new Permissions[](0);
    }

    /// @notice Returns the contract version
    function VERSION() external pure returns (uint8 major, uint8 minor) {
        return (1, 0);
    }

    //============================================================================================//
    //                                   IPeriodicTask                                             //
    //============================================================================================//

    /// @inheritdoc IPeriodicTask
    /// @dev Called by the Heart on each beat. Wraps Operator.operate() with budget enforcement.
    ///      Reverts if budget exhausted (which causes the entire beat to revert — this is intentional,
    ///      as the Heart's _executePeriodicTasks expects tasks to revert loudly).
    ///      Use budgetOverride to allow operate() to run without budget checks in emergencies.
    function execute() external override {
        _resetEpochIfNeeded();

        if (address(operator) == address(0)) revert OperatorNotSet();

        // Halt defense spending if circuit breaker is tripped (Bucky depeg)
        if (address(circuitBreaker) != address(0) && circuitBreaker.tripped())
            revert CircuitBreakerTripped();

        if (!budgetOverride && epochSpent >= currentBudget()) {
            emit BudgetExhaustedEvent(epochSpent, currentBudget());
            revert BudgetExhausted();
        }

        // Measure treasury outflow before and after
        uint256 balanceBefore = IERC20(shitToken).balanceOf(treasury);

        // Call Operator.operate() — this contract has the "heart" role granted by RolesAdmin
        operator.operate();

        uint256 balanceAfter = IERC20(shitToken).balanceOf(treasury);
        if (balanceBefore > balanceAfter) {
            epochSpent += (balanceBefore - balanceAfter);
            emit SpendingRecorded(balanceBefore - balanceAfter, epochSpent);
        }
    }

    /// @notice Checks if the contract supports an interface
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IPeriodicTask).interfaceId
            || interfaceId == type(IERC165).interfaceId;
    }

    //============================================================================================//
    //                                   ADMIN FUNCTIONS                                           //
    //============================================================================================//

    function setOperator(address _operator) external onlyMultisig {
        if (_operator == address(0)) revert ZeroAddress();
        operator = IOperator(_operator);
        emit OperatorUpdated(_operator);
    }

    /// @notice Update liquid treasury value (multisig only)
    function updateLiquidTreasuryValue(uint256 _value) external onlyMultisig {
        liquidTreasuryValue = _value;
    }

    /// @notice Set per-epoch budget in bps of liquid treasury
    function setBudgetBps(uint256 _bps) external onlyMultisig {
        if (_bps > 5000) revert InvalidParams(); // Max 50% per epoch
        budgetBps = _bps;
        emit BudgetUpdated(_bps);
    }

    /// @notice Toggle budget enforcement (emergency override)
    function setOverride(bool _override) external onlyMultisig {
        budgetOverride = _override;
        emit OverrideToggled(_override);
    }

    function setCircuitBreaker(address _breaker) external onlyMultisig {
        circuitBreaker = ShitCircuitBreaker(_breaker);
        emit CircuitBreakerSet(_breaker);
    }

    /// @notice Record spending from treasury defense (manual accounting)
    function recordSpending(uint256 amount) external onlyMultisig {
        _resetEpochIfNeeded();
        epochSpent += amount;
        emit SpendingRecorded(amount, epochSpent);
    }

    //============================================================================================//
    //                                   VIEW FUNCTIONS                                            //
    //============================================================================================//

    /// @notice Current epoch spending budget
    function currentBudget() public view returns (uint256) {
        return (liquidTreasuryValue * budgetBps) / BPS_DENOMINATOR;
    }

    /// @notice Check if budget allows spending
    function budgetAvailable() public view returns (bool) {
        if (budgetOverride) return true;
        uint256 effectiveSpent = (block.timestamp >= epochStart + EPOCH_LENGTH) ? 0 : epochSpent;
        return effectiveSpent < currentBudget();
    }

    function _resetEpochIfNeeded() internal {
        if (block.timestamp >= epochStart + EPOCH_LENGTH) {
            epochStart = block.timestamp;
            epochSpent = 0;
            emit EpochReset(epochStart, 0);
        }
    }
}
