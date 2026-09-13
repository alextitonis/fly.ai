// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";


/// @title ShitDeployer
/// @notice Deterministic CREATE2 deployment with vanity salts using OZ Create2 (MIT)
/// @dev Vanity address mining happens off-chain in scripts/mine-vanity-salt.ts
contract ShitDeployer is AccessControl {
    error DeploymentFailed();
    error ZeroAddress();

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender);
    }

    /// @notice Deploy a contract via CREATE2 with a vanity salt
    /// @param initCode The creation bytecode (constructor args appended)
    /// @param salt The vanity salt (mined off-chain to produce desired address suffix)
    /// @return deployedAddress The address of the deployed contract
    function deployCreate2(bytes memory initCode, bytes32 salt) external onlyRole(MANAGER_ROLE) returns (address) {
        address deployed = Create2.deploy(0, salt, initCode);
        if (deployed == address(0)) revert DeploymentFailed();
        return deployed;
    }

    /// @notice Deploy a contract via CREATE2 with init and transfer
    /// @param initCode The creation bytecode
    /// @param salt The vanity salt
    /// @param initData Initialization calldata to call on the deployed contract
    function deployCreate2AndInit(
        bytes memory initCode,
        bytes32 salt,
        bytes memory initData
    ) external onlyRole(MANAGER_ROLE) returns (address) {
        address deployed = Create2.deploy(0, salt, initCode);
        if (deployed == address(0)) revert DeploymentFailed();
        if (initData.length > 0) {
            (bool success,) = deployed.call(initData);
            if (!success) revert DeploymentFailed();
        }
        return deployed;
    }

    /// @notice Compute the CREATE2 address for a given salt and initCode
    function computeCreate2Address(bytes32 salt, bytes32 initCodeHash) external view returns (address) {
        return Create2.computeAddress(salt, initCodeHash);
    }
}
