// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {MultisigGuard} from "./MultisigGuard.sol";
import {ITokenPriceFeed} from "./ITokenPriceFeed.sol";

/// @title ShitCircuitBreaker
/// @notice Global circuit breaker that auto-pauses dependent modules when Bucky depegs
/// @dev Addresses the systemic depeg risk: if Bucky loses its peg, perps (Bucky-collateralized),
///      Cooler loans (Bucky-denominated), and the Lending AMO all operate on a broken price
///      assumption. This contract monitors Bucky's peg and allows registered modules to
///      check whether they should halt operations.
///
///      Design:
///      - Monitors Bucky TWAP price vs $1 peg (via price feed)
///      - If deviation > threshold (default 2%), sets `tripped = true`
///      - Registered modules call `isOperational()` in their main functions
///      - Multisig can manually trip/untrip for any reason
///      - Auto-recovery: if price recovers for `recoveryEpochs` consecutive checks, auto-untrips
///      - Permissionless `check()` for keepers to trigger the breaker
///
///      This is a read-only oracle — modules must voluntarily check it.
///      It cannot force-pause arbitrary contracts (that would require external call hooks).
contract ShitCircuitBreaker is MultisigGuard {
    error NotTripped();
    error InvalidThreshold();

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PEG = 1e18; // $1.00
    uint256 public constant EPOCH_LENGTH = 8 hours;

    address public buckyToken;
    ITokenPriceFeed public priceFeed;

    uint256 public deviationThresholdBps = 200; // 2% deviation from $1.00
    uint256 public recoveryEpochs = 21; // 21 consecutive good epochs (7 days) to auto-reset
    uint256 public lastCheckTime;
    uint256 public consecutiveGoodEpochs;

    bool public tripped;
    uint256 public tripTime;
    uint256 public tripEpoch;
    uint256 public epochNumber;

    event Tripped(uint256 indexed price, uint256 indexed deviationBps, uint256 indexed timestamp);
    event Untripped(bool indexed autoReset, uint256 indexed consecutiveGoodEpochs);
    event ThresholdUpdated(uint256 indexed thresholdBps);
    event PriceFeedUpdated(address indexed feed);
    event BuckyTokenUpdated(address indexed token);

    constructor(address _multisig) MultisigGuard(_multisig) {
        if (_multisig == address(0)) revert ZeroAddress();
        lastCheckTime = block.timestamp;
    }

    function setBuckyToken(address _token) external onlyMultisig {
        if (_token == address(0)) revert ZeroAddress();
        buckyToken = _token;
        emit BuckyTokenUpdated(_token);
    }

    function setPriceFeed(address _feed) external onlyMultisig {
        if (_feed == address(0)) revert ZeroAddress();
        priceFeed = ITokenPriceFeed(_feed);
        emit PriceFeedUpdated(_feed);
    }

    function setDeviationThreshold(uint256 _bps) external onlyMultisig {
        if (_bps == 0 || _bps > 5000) revert InvalidThreshold(); // Max 50%
        deviationThresholdBps = _bps;
        emit ThresholdUpdated(_bps);
    }

    /// @notice Permissionless check — any keeper can call at epoch boundaries
    function check() external {
        if (block.timestamp < lastCheckTime + EPOCH_LENGTH) return;
        if (address(priceFeed) == address(0) || buckyToken == address(0)) return;

        lastCheckTime = block.timestamp;
        ++epochNumber;

        uint256 price = _getPrice(buckyToken);
        if (price == 0) return;

        uint256 deviationBps = _deviationBps(price);

        if (!tripped) {
            if (deviationBps >= deviationThresholdBps) {
                tripped = true;
                tripTime = block.timestamp;
                tripEpoch = epochNumber;
                consecutiveGoodEpochs = 0;
                emit Tripped(price, deviationBps, block.timestamp);
            }
        } else {
            if (deviationBps < deviationThresholdBps) {
                ++consecutiveGoodEpochs;
                if (consecutiveGoodEpochs >= recoveryEpochs) {
                    tripped = false;
                    consecutiveGoodEpochs = 0;
                    emit Untripped(true, recoveryEpochs);
                }
            } else {
                consecutiveGoodEpochs = 0;
            }
        }
    }

    /// @notice Manual trip — multisig can trigger for any reason
    function trip() external onlyMultisig {
        tripped = true;
        tripTime = block.timestamp;
        tripEpoch = epochNumber;
        consecutiveGoodEpochs = 0;
        emit Tripped(0, 0, block.timestamp);
    }

    /// @notice Manual untrip — multisig can reset
    function untrip() external onlyMultisig {
        tripped = false;
        consecutiveGoodEpochs = 0;
        emit Untripped(false, 0);
    }

    /// @notice View: should a module allow operations?
    function isOperational() external view returns (bool) {
        return !tripped;
    }

    /// @notice View: current deviation in bps
    function currentDeviationBps() external view returns (uint256) {
        if (address(priceFeed) == address(0) || buckyToken == address(0)) return 0;
        uint256 price = _getPrice(buckyToken);
        if (price == 0) return 0;
        return _deviationBps(price);
    }

    function _deviationBps(uint256 price) internal pure returns (uint256) {
        if (price >= PEG) {
            return ((price - PEG) * BPS_DENOMINATOR) / PEG;
        } else {
            return ((PEG - price) * BPS_DENOMINATOR) / PEG;
        }
    }

    function _getPrice(address token) internal view returns (uint256) {
        if (address(priceFeed) == address(0)) return 0;
        try priceFeed.getTokenPrice(token) returns (uint256 price) {
            return price;
        } catch {
            return 0;
        }
    }
}
