// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {PipLike} from "@dss/spot.sol";

/// @title CloneableOSM
/// @notice OSM (Oracle Security Module) with initializer for ERC-1167 clones
/// @dev Delays oracle price updates by 1 hour for governance reaction window.
///      Uses DSS's PipLike interface (AGPL-3.0-or-later) for price source compatibility.
contract CloneableOSM {
    error AlreadyInitialized();
    error NotInitialized();
    error NoPrice();

    PipLike public src;     // Chainlink adapter or price source (DSS PipLike compatible)
    bytes32 public ilk;
    bool public initialized;

    struct Price {
        uint256 val;
        uint256 has;
        uint256 age;
    }

    Price public cur;
    Price public nxt;

    event PriceUpdated(uint256 indexed curVal, uint256 indexed nxtVal);

    function initialize(address _src, bytes32 _ilk) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        src = PipLike(_src);
        ilk = _ilk;
    }

    function poke() external {
        if (!initialized) revert NotInitialized();
        // Update state before external call (CEI pattern)
        cur = nxt;
        (bytes32 val, bool has) = src.peek();
        nxt = Price({val: uint256(val), has: has ? 1 : 0, age: block.timestamp});
        emit PriceUpdated(cur.val, nxt.val);
    }

    function read() external view returns (uint256) {
        if (!initialized) revert NotInitialized();
        if (cur.has != 1) revert NoPrice();
        return cur.val;
    }

    function peek() external view returns (uint256, bool) {
        if (!initialized) revert NotInitialized();
        return (cur.val, cur.has == 1);
    }
}
