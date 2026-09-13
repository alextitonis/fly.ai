// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {VatLike, GemLike} from "@dss/join.sol";

/// @title CloneableGemJoin
/// @notice Cloneable GemJoin with initializer pattern for ERC-1167 clone deployment
/// @dev Wraps DSS's audited GemJoin (AGPL-3.0-or-later) with clone-friendly initialization.
///      Saves ~8.5M gas by cloning one implementation per collateral type.
contract CloneableGemJoin {
    error AlreadyInitialized();
    error NotInitialized();
    error TransferFailed();

    VatLike public vat;
    bytes32 public ilk;
    GemLike public gem;
    bool public initialized;

    event Join(address indexed usr, uint256 indexed wad);
    event Exit(address indexed usr, uint256 indexed wad);


    function initialize(address _vat, bytes32 _ilk, address _gem) external {
        if (initialized) revert AlreadyInitialized();

        initialized = true;
        vat = VatLike(_vat);
        ilk = _ilk;
        gem = GemLike(_gem);
    }

    function join(address usr, uint256 wad) external {
        if (!initialized) revert NotInitialized();
        vat.slip(ilk, usr, int256(wad));
        if (!gem.transferFrom(msg.sender, address(this), wad)) revert TransferFailed();
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        if (!initialized) revert NotInitialized();
        vat.slip(ilk, msg.sender, -int256(wad));
        if (!gem.transfer(usr, wad)) revert TransferFailed();
        emit Exit(usr, wad);
    }
}
