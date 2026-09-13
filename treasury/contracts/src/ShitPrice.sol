// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {PRICEv1} from "@shit-v3/modules/PRICE/PRICE.v1.sol";
import {Kernel, Module, Keycode, toKeycode} from "@shit-v3/Kernel.sol";
import {ITwapPriceFeed} from "./ITwapPriceFeed.sol";
import {MultisigGuard} from "./MultisigGuard.sol";

/// @title ShitPrice
/// @notice Fork of SHIT ProtocolPrice that uses a TWAP price feed instead of Chainlink dual-oracle.
/// @dev Replaces the two Chainlink feeds (SHIT/ETH and Reserve/ETH) with a single TWAP source
///      that directly returns the SHIT/Reserve price in 1e18 decimals.
///      All moving average and observation logic is inherited from PRICEv1/SHIT ProtocolPrice.

contract ShitPrice is PRICEv1, MultisigGuard {
    /// @notice TWAP price feed that returns SHIT/Reserve price in 1e18
    ITwapPriceFeed public twapPriceFeed;

    event TwapPriceFeedUpdated(address indexed newFeed);

    constructor(
        Kernel kernel_,
        address priceFeed_,
        uint48 observationFrequency_,
        uint48 movingAverageDuration_,
        uint256 minimumTargetPrice_,
        address _multisig
    ) Module(kernel_) MultisigGuard(_multisig) {
        if (movingAverageDuration_ == 0 || movingAverageDuration_ % observationFrequency_ != 0)
            revert Price_InvalidParams();

        twapPriceFeed = ITwapPriceFeed(priceFeed_);

        observationFrequency = observationFrequency_;
        movingAverageDuration = movingAverageDuration_;

        /// forge-lint: disable-next-line(unsafe-typecast)
        numObservations = uint32(movingAverageDuration_ / observationFrequency_);
        observations = new uint256[](numObservations);

        minimumTargetPrice = minimumTargetPrice_;

        emit MovingAverageDurationChanged(movingAverageDuration_);
        emit ObservationFrequencyChanged(observationFrequency_);
        emit MinimumTargetPriceChanged(minimumTargetPrice_);
    }

    function setTwapPriceFeed(address _newFeed) external onlyMultisig {
        if (_newFeed == address(0)) revert ZeroAddress();
        twapPriceFeed = ITwapPriceFeed(_newFeed);
        initialized = false;
        lastObservationTime = 0;
        cumulativeObs = 0;
        nextObsIndex = 0;
        emit TwapPriceFeedUpdated(_newFeed);
    }

    /// @inheritdoc Module
    function KEYCODE() public pure override returns (Keycode) {
        return toKeycode("PRICE");
    }

    /// @inheritdoc Module
    function VERSION() external pure override returns (uint8 major, uint8 minor) {
        major = 1;
        minor = 1;
    }

    //============================================================================================//
    //                                       CORE FUNCTIONS                                       //
    //============================================================================================//

    /// @inheritdoc PRICEv1
    function updateMovingAverage() external override permissioned {
        if (!initialized) revert Price_NotInitialized();

        uint32 numObs = numObservations;
        uint256 earliestPrice = observations[nextObsIndex];
        uint256 currentPrice = getCurrentPrice();

        cumulativeObs = cumulativeObs + currentPrice - earliestPrice;
        observations[nextObsIndex] = currentPrice;
        lastObservationTime = uint48(block.timestamp);
        nextObsIndex = (nextObsIndex + 1) % numObs;

        emit NewObservation(block.timestamp, currentPrice, getMovingAverage());
    }

    /// @inheritdoc PRICEv1
    function initialize(
        uint256[] memory startObservations_,
        uint48 lastObservationTime_
    ) external override permissioned {
        if (initialized) revert Price_AlreadyInitialized();

        uint256 numObs = observations.length;
        if (startObservations_.length != numObs || lastObservationTime_ > uint48(block.timestamp))
            revert Price_InvalidParams();

        uint256 total;
        for (uint256 i; i < numObs; ) {
            if (startObservations_[i] == 0) revert Price_InvalidParams();
            total += startObservations_[i];
            observations[i] = startObservations_[i];
            unchecked {
                ++i;
            }
        }

        cumulativeObs = total;
        lastObservationTime = lastObservationTime_;
        initialized = true;
    }

    /// @inheritdoc PRICEv1
    function changeMovingAverageDuration(
        uint48 movingAverageDuration_
    ) external override permissioned {
        if (movingAverageDuration_ == 0 || movingAverageDuration_ % observationFrequency != 0)
            revert Price_InvalidParams();

        uint256 newObservations = uint256(movingAverageDuration_ / observationFrequency);
        observations = new uint256[](newObservations);
        initialized = false;
        lastObservationTime = 0;
        cumulativeObs = 0;
        nextObsIndex = 0;
        movingAverageDuration = movingAverageDuration_;
        /// forge-lint: disable-next-line(unsafe-typecast)
        numObservations = uint32(newObservations);

        emit MovingAverageDurationChanged(movingAverageDuration_);
    }

    /// @inheritdoc PRICEv1
    function changeObservationFrequency(
        uint48 observationFrequency_
    ) external override permissioned {
        if (observationFrequency_ == 0 || movingAverageDuration % observationFrequency_ != 0)
            revert Price_InvalidParams();

        uint256 newObservations = uint256(movingAverageDuration / observationFrequency_);
        observations = new uint256[](newObservations);
        initialized = false;
        lastObservationTime = 0;
        cumulativeObs = 0;
        nextObsIndex = 0;
        observationFrequency = observationFrequency_;
        /// forge-lint: disable-next-line(unsafe-typecast)
        numObservations = uint32(newObservations);

        emit ObservationFrequencyChanged(observationFrequency_);
    }

    /// @inheritdoc PRICEv1
    /// @dev No-op: TWAP price feed does not have Chainlink-style update thresholds.
    function changeUpdateThresholds(
        uint48 shitEthUpdateThreshold_,
        uint48 reserveEthUpdateThreshold_
    ) external override permissioned {
        shitEthUpdateThreshold = shitEthUpdateThreshold_;
        reserveEthUpdateThreshold = reserveEthUpdateThreshold_;
        emit UpdateThresholdsChanged(shitEthUpdateThreshold_, reserveEthUpdateThreshold_);
    }

    /// @inheritdoc PRICEv1
    function changeMinimumTargetPrice(uint256 minimumTargetPrice_) external override permissioned {
        minimumTargetPrice = minimumTargetPrice_;
        emit MinimumTargetPriceChanged(minimumTargetPrice_);
    }

    //============================================================================================//
    //                                      VIEW FUNCTIONS                                        //
    //============================================================================================//

    /// @inheritdoc PRICEv1
    function getCurrentPrice() public view override returns (uint256) {
        if (!initialized) revert Price_NotInitialized();
        return twapPriceFeed.latestPrice();
    }

    /// @inheritdoc PRICEv1
    function getLastPrice() external view override returns (uint256) {
        if (!initialized) revert Price_NotInitialized();
        uint32 lastIndex = nextObsIndex == 0 ? numObservations - 1 : nextObsIndex - 1;
        return observations[lastIndex];
    }

    /// @inheritdoc PRICEv1
    function getMovingAverage() public view override returns (uint256) {
        if (!initialized) revert Price_NotInitialized();
        return cumulativeObs / numObservations;
    }

    /// @inheritdoc PRICEv1
    function getTargetPrice() external view override returns (uint256) {
        uint256 movingAverage = getMovingAverage();
        return movingAverage > minimumTargetPrice ? movingAverage : minimumTargetPrice;
    }
}
