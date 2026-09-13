// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {MultisigGuard} from "./MultisigGuard.sol";
import {ShitCircuitBreaker} from "./ShitCircuitBreaker.sol";

/// @title ShitInverseBond
/// @notice Standing buyback bid for SHIT at NAV × (1 - spread), all received SHIT burned
/// @dev Direct buyback contract — users sell SHIT and receive AZUSD at a discount to NAV.
///      Received SHIT are burned via ERC20Burnable.burn().
///      Epoch capacity limits protect treasury outflows.
///      Circuit breaker integration: sells halt when Bucky depegs (ShitCircuitBreaker).
///      All admin operations via multisig (Fortress/Minotaur lesson).
contract ShitInverseBond is MultisigGuard {
    using SafeERC20 for IERC20;

    error InvalidParams();
    error CapacityExceeded();
    error NothingToBurn();
    error CircuitBreakerTripped();

    IERC20 public immutable shitToken;
    IERC20 public payoutToken; // Payout token (AZUSD initially, switchable to Bucky via setPayoutToken)
    uint256 public constant INVERSE_SPREAD_BPS = 150;
    uint256 public constant EPOCH_LENGTH = 8 hours;
    uint256 public constant BASIS_POINTS = 10000;

    // Configurable per-epoch capacity (bps of liquid treasury). Default 1% (100 bps).
    uint256 public maxCapacityBps = 100;

    // Circuit breaker integration — when set, sells halt if Bucky depegs
    ShitCircuitBreaker public circuitBreaker;

    address public treasury;
    uint256 public navPerShit;
    uint256 public liquidTreasuryValue;
    uint256 public epochStartTime;
    uint256 public epochUsedCapacity;

    event InverseBondBurned(address indexed seller, uint256 indexed shitIn, uint256 indexed payout);

    event EpochReset(uint256 indexed startTime);
    event PayoutTokenUpdated(address indexed oldToken, address indexed newToken);
    event NavUpdated(uint256 indexed _navPerShit, uint256 indexed _liquidTreasuryValue);
    event CapacityUpdated(uint256 indexed oldBps, uint256 indexed newBps);
    event CircuitBreakerSet(address indexed breaker);

    constructor(
        address _shitToken,
        address _payoutToken,
        address _treasury,
        address _multisig
    ) MultisigGuard(_multisig) {
        if (_shitToken == address(0) || _treasury == address(0) || _payoutToken == address(0))
            revert ZeroAddress();
        shitToken = IERC20(_shitToken);
        payoutToken = IERC20(_payoutToken);
        treasury = _treasury;
        epochStartTime = block.timestamp;
    }

    function updateNav(uint256 _navPerShit, uint256 _liquidTreasuryValue) external onlyMultisig {
        navPerShit = _navPerShit;
        liquidTreasuryValue = _liquidTreasuryValue;
        emit NavUpdated(_navPerShit, _liquidTreasuryValue);
    }

    /// @notice Switch payout token (e.g., AZUSD → Bucky after Bucky launch)
    /// @dev Multisig-gated. Ensure treasury has sufficient new token before switching.
    function setPayoutToken(address _newPayoutToken) external onlyMultisig {
        if (_newPayoutToken == address(0)) revert ZeroAddress();
        emit PayoutTokenUpdated(address(payoutToken), _newPayoutToken);
        payoutToken = IERC20(_newPayoutToken);
    }

    function bondPrice() public view returns (uint256) {
        return (navPerShit * (BASIS_POINTS - INVERSE_SPREAD_BPS)) / BASIS_POINTS;
    }

    function epochCapacity() public view returns (uint256) {
        return (liquidTreasuryValue * maxCapacityBps) / BASIS_POINTS;
    }

    function sell(uint256 shitAmount) external returns (uint256 payout) {
        _resetEpochIfNeeded();

        // Halt sells if circuit breaker is tripped (Bucky depeg)
        if (address(circuitBreaker) != address(0) && circuitBreaker.tripped())
            revert CircuitBreakerTripped();

        payout = (shitAmount * bondPrice()) / 1e18;
        if (payout == 0) revert NothingToBurn();
        if (epochUsedCapacity + payout > epochCapacity()) revert CapacityExceeded();

        // Update state before external calls (CEI pattern)
        epochUsedCapacity += payout;

        shitToken.safeTransferFrom(msg.sender, address(this), shitAmount);
        ERC20Burnable(address(shitToken)).burn(shitAmount);

        // slither-disable-next-line arbitrary-send-erc20: treasury is a fixed address set by multisig, not arbitrary. This is the core inverse bond mechanism — seller burns SHIT, receives AZUSD from treasury. Capacity limits protect outflows.
        payoutToken.safeTransferFrom(treasury, msg.sender, payout);

        emit InverseBondBurned(msg.sender, shitAmount, payout);
    }

    function resetEpoch() external {
        _resetEpochIfNeeded();
    }

    function _resetEpochIfNeeded() internal {
        if (block.timestamp >= epochStartTime + EPOCH_LENGTH) {
            epochStartTime = block.timestamp;
            epochUsedCapacity = 0;
            emit EpochReset(epochStartTime);
        }
    }

    function setTreasury(address _treasury) external onlyMultisig {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
    }

    function setMaxCapacityBps(uint256 _bps) external onlyMultisig {
        if (_bps == 0 || _bps > 5000) revert InvalidParams(); // Max 50%
        emit CapacityUpdated(maxCapacityBps, _bps);
        maxCapacityBps = _bps;
    }

    function setCircuitBreaker(address _breaker) external onlyMultisig {
        circuitBreaker = ShitCircuitBreaker(_breaker);
        emit CircuitBreakerSet(_breaker);
    }
}
