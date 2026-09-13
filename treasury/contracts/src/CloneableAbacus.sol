// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Abacus} from "@dss/abaci.sol";

/// @title CloneableAbacus
/// @notice Cloneable wrapper around DSS Abacus (price calculator for Dutch auctions)
/// @dev Delegates price() to DSS's audited LinearDecrease or ExponentialDecrease.
///      ERC-1167 clone with initializer — one instance per collateral type.
contract CloneableAbacus {
    error AlreadyInitialized();
    error NotInitialized();

    bytes32 public ilk;
    bool public initialized;

    Abacus public abacus;     // DSS abacus implementation (LinearDecrease, ExponentialDecrease, etc.)
    uint256 public chop;      // Liquidation penalty (bps)

    function initialize(bytes32 _ilk, address _abacus, uint256 _chop) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        ilk = _ilk;
        abacus = Abacus(_abacus);
        chop = _chop;
    }

    /// @notice Current auction price — delegates to DSS Abacus
    /// @param top Initial price [ray]
    /// @param dur Seconds since auction start
    function price(uint256 top, uint256 dur) external view returns (uint256) {
        if (!initialized) revert NotInitialized();
        return abacus.price(top, dur);
    }

    /// @notice Liquidation penalty applied to debt
    function chopAmount(uint256 wad) external view returns (uint256) {
        return wad * (10000 + chop) / 10000;
    }
}
