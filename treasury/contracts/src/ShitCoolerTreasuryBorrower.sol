// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Kernel, Policy, Keycode, Permissions, toKeycode} from "@shit-v3/Kernel.sol";
import {PolicyEnabler} from "@shit-v3/policies/utils/PolicyEnabler.sol";
import {ROLESv1} from "@shit-v3/modules/ROLES/SHIT ProtocolRoles.sol";
import {IERC20} from "@shit-v3/interfaces/IERC20.sol";
import {ERC20} from "solmate/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";
import {ICoolerTreasuryBorrower} from "@shit-v3/policies/interfaces/cooler/ICoolerTreasuryBorrower.sol";

/// @title ShitCoolerTreasuryBorrower
/// @notice Minimal TreasuryBorrower for AZUSD (6 decimals).
///         MonoCooler works in 18dp (wad); this contract converts to 6dp on borrow/repay.
///         Pre-funded with AZUSD — no mint authority required.
contract ShitCoolerTreasuryBorrower is ICoolerTreasuryBorrower, Policy, PolicyEnabler {
    using SafeTransferLib for ERC20;

    uint8 public constant override DECIMALS = 18;

    IERC20 public immutable debtToken;

    bytes32 public constant COOLER_ROLE = bytes32("treasuryborrower_cooler");

    constructor(address kernel_, address debtToken_) Policy(Kernel(kernel_)) {
        debtToken = IERC20(debtToken_);
    }

    function configureDependencies() external override returns (Keycode[] memory dependencies) {
        dependencies = new Keycode[](1);
        dependencies[0] = toKeycode("ROLES");
        ROLES = ROLESv1(getModuleAddress(dependencies[0]));
        (uint8 ROLES_MAJOR, ) = ROLES.VERSION();
        if (ROLES_MAJOR != 1) revert Policy_WrongModuleVersion(abi.encode([1]));
    }

    function requestPermissions() external pure override returns (Permissions[] memory requests) {
        requests = new Permissions[](0);
    }

    function borrow(uint256 amountInWad, address recipient) external override onlyEnabled onlyRole(COOLER_ROLE) {
        if (amountInWad == 0) revert ExpectedNonZero();
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amountIn6dp = amountInWad / 1e12;
        ERC20(address(debtToken)).safeTransfer(recipient, amountIn6dp);
    }

    function repay() external override onlyEnabled onlyRole(COOLER_ROLE) {
        // AZUSD stays in this contract; no external treasury to repay
    }

    function writeOffDebt(uint256) external override onlyEnabled onlyRole(COOLER_ROLE) {
        // No-op: no external treasury debt to write off
    }

    function setDebt(uint256) external override onlyEnabled onlyAdminRole {
        // No-op: no external treasury debt to set
    }

    function convertToDebtTokenAmount(
        uint256 amountInWad
    ) external view override returns (IERC20 dToken, uint256 dTokenAmount) {
        dToken = IERC20(address(debtToken));
        dTokenAmount = amountInWad / 1e12;
    }
}
