// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {MultisigGuard} from "./MultisigGuard.sol";

/// @title ShitToken
/// @notice Main protocol token for SHIT Protocol (SHIT) — SHIT Protocol fork pattern
/// @dev All protocol control is via multisig (Gnosis Safe). No single-key access.
///      Fortress DAO lesson: single individual controlling treasury = catastrophic.
///      Minotaur lesson: single admin key compromise = total loss.
///      Uses OZ ERC20Burnable (MIT) for burn functionality.
contract ShitToken is ERC20Permit, ERC20Burnable, MultisigGuard {
    error MaxSupplyExceeded();
    error NotAuthorized();
    error NotAuthorizedMinter();

    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18; // 100M cap

    /// @notice Authorized minter (SHIT Protocol MINTR module) — can mint without multisig
    address public authorizedMinter;

    event AuthorizedMinterSet(address indexed minter);

    constructor(address _multisig) ERC20("SHIT Protocol", "SHIT") ERC20Permit("SHIT Protocol") MultisigGuard(_multisig) {
        if (_multisig == address(0)) revert ZeroAddress();
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != multisig && msg.sender != authorizedMinter) revert NotAuthorizedMinter();
        if (to == address(0)) revert ZeroAddress();
        if (totalSupply() + amount > MAX_SUPPLY) revert MaxSupplyExceeded();
        _mint(to, amount);
    }

    /// @notice Set authorized minter (SHIT Protocol MINTR module) — only multisig
    function setAuthorizedMinter(address _minter) external onlyMultisig {
        authorizedMinter = _minter;
        emit AuthorizedMinterSet(_minter);
    }

}
