// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title MultisigGuard
/// @notice Shared multisig enforcement for all SHIT Protocol contracts
/// @dev Inherited by contracts that require multisig control for privileged operations.
///      Fortress DAO lesson: a single individual controlling treasury = catastrophic.
///      Minotaur lesson: single admin key compromise = total loss.
///      Wonderland lesson: hidden team backgrounds destroy trust.
///      This contract enforces that all admin/manager actions go through a multisig
///      (e.g. Gnosis Safe), preventing single-key compromise from draining treasury
///      or changing critical parameters.
///
///      Usage: inherit and apply `onlyMultisig` to admin/manager functions.
///      The multisig address is set in the constructor and can only be changed
///      by the current multisig (or via a 2-step ownership transfer).
abstract contract MultisigGuard {
    error NotMultisig();
    error ZeroAddress();
    error PendingTransferNotReady();

    address public multisig;
    address public pendingMultisig;
    uint256 public constant MULTISIG_TRANSFER_TIMELOCK = 3 days;
    uint256 public pendingMultisigTime;

    event MultisigTransferProposed(address indexed pendingMultisig, uint256 indexed timestamp);
    event MultisigTransferCompleted(address indexed oldMultisig, address indexed newMultisig);


    modifier onlyMultisig() {
        if (msg.sender != multisig) revert NotMultisig();
        _;
    }

    /// @dev Pass address(0) for Initializable contracts that set multisig via _initializeMultisig()
    constructor(address _multisig) {
        if (_multisig != address(0)) {
            multisig = _multisig;
        }
    }

    /// @notice Propose a new multisig address — starts a 3-day timelock
    /// @dev Only the current multisig can propose a transfer. This prevents
    ///      a compromised admin from instantly changing the multisig.
    function proposeMultisigTransfer(address _newMultisig) external onlyMultisig {
        if (_newMultisig == address(0)) revert ZeroAddress();
        pendingMultisig = _newMultisig;
        pendingMultisigTime = block.timestamp + MULTISIG_TRANSFER_TIMELOCK;
        emit MultisigTransferProposed(_newMultisig, block.timestamp);
    }

    /// @notice Complete a multisig transfer after the timelock expires
    /// @dev Anyone can call this after the timelock — the proposal is the gate.
    function completeMultisigTransfer() external {
        if (pendingMultisig == address(0)) revert ZeroAddress();
        if (block.timestamp < pendingMultisigTime) revert PendingTransferNotReady();

        address old = multisig;
        multisig = pendingMultisig;
        pendingMultisig = address(0);
        pendingMultisigTime = 0;

        emit MultisigTransferCompleted(old, multisig);
    }

    /// @notice Cancel a pending multisig transfer
    function cancelMultisigTransfer() external onlyMultisig {
        pendingMultisig = address(0);
        pendingMultisigTime = 0;
    }

    /// @dev Internal function to initialize multisig for contracts that use
    ///      initialize() pattern (e.g. ERC-1167 clones)
    function _initializeMultisig(address _multisig) internal {
        if (_multisig == address(0)) revert ZeroAddress();
        if (multisig != address(0)) revert NotMultisig(); // already initialized
        multisig = _multisig;
    }
}
