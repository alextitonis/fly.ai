// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

/// @title TokenRegistry
/// @notice Whitelist registry for tokens approved for use in the SHIT Protocol protocol
/// @dev OZ AccessControlEnumerable with WHITELISTED role per token and MANAGER_ROLE for multisig
contract TokenRegistry is AccessControlEnumerable {
    error TokenNotWhitelisted(address token);
    error TokenAlreadyWhitelisted(address token);
    error NotAContract(address token);

    bytes32 public constant WHITELISTED_ROLE = keccak256("WHITELISTED_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// @param admin The Safe multisig that will manage the registry
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
    }

    /// @notice Whitelist a token for protocol use
    /// @param token The ERC20 token address to whitelist
    function whitelist(address token) external onlyRole(MANAGER_ROLE) {
        if (token.code.length == 0) revert NotAContract(token);
        if (hasRole(WHITELISTED_ROLE, token)) revert TokenAlreadyWhitelisted(token);
        _grantRole(WHITELISTED_ROLE, token);
    }

    /// @notice Remove a token from the whitelist
    /// @param token The ERC20 token address to remove
    function remove(address token) external onlyRole(MANAGER_ROLE) {
        if (!hasRole(WHITELISTED_ROLE, token)) revert TokenNotWhitelisted(token);
        _revokeRole(WHITELISTED_ROLE, token);
    }

    /// @notice Check if a token is whitelisted
    /// @param token The token address to check
    /// @return True if the token is whitelisted
    function isWhitelisted(address token) external view returns (bool) {
        return hasRole(WHITELISTED_ROLE, token);
    }
}
