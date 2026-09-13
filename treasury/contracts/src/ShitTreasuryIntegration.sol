// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title ShitTreasuryIntegration
/// @notice Treasury spell executor using OZ TimelockController (MIT)
/// @dev Replaces custom spell execution with audited OZ TimelockController.
///      Safe multisig holds PROPOSER_ROLE, EXECUTOR_ROLE, and CANCELLER_ROLE.
///      Spells are scheduled and executed via TimelockController's operation hash for replay protection.
///      Backward-compatible executeSpell() wraps schedule+execute for 0-delay immediate execution.
contract ShitTreasuryIntegration is TimelockController {
    error ZeroAddress();
    error SpellAlreadyExecuted(bytes32 spellId);

    mapping(bytes32 => bool) public executedSpells;

    event SpellExecuted(bytes32 indexed spellId, address indexed target, string description);

    constructor(address _multisig) TimelockController(0, _makeArray(_multisig), _makeArray(_multisig), _multisig) {
        if (_multisig == address(0)) revert ZeroAddress();
    }

    /// @notice Execute a treasury spell with arbitrary calldata (0-delay backward compatible)
    /// @param spellId Unique identifier for the spell (used as salt)
    /// @param target Target contract address
    /// @param data Calldata to execute
    /// @param description Human-readable description
    function executeSpell(bytes32 spellId, address target, bytes calldata data, string calldata description) external onlyRole(EXECUTOR_ROLE) {
        if (executedSpells[spellId]) revert SpellAlreadyExecuted(spellId);
        executedSpells[spellId] = true;

        bytes32 predecessor = bytes32(0);
        uint256 value = 0;

        schedule(target, value, data, predecessor, spellId, 0);
        execute(target, value, data, predecessor, spellId);

        emit SpellExecuted(spellId, target, description);
    }

    function _makeArray(address addr) private pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = addr;
    }
}
