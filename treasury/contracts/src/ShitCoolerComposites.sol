// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {IERC20} from "@shit-v3/interfaces/IERC20.sol";
import {IMonoCooler} from "@shit-v3/policies/interfaces/cooler/IMonoCooler.sol";
import {ICoolerComposites} from "@shit-v3/periphery/interfaces/ICoolerComposites.sol";
import {IDLGTEv1} from "@shit-v3/modules/DLGTE/IDLGTE.v1.sol";
import {IEnabler} from "@shit-v3/periphery/interfaces/IEnabler.sol";

import {ERC20} from "solmate/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";
import {Owned} from "solmate/auth/Owned.sol";

/// @title ShitCoolerComposites
/// @notice Fork of CoolerComposites that handles 6-decimal AZUSD.
///         MonoCooler works in 18dp (wad); the debt token (AZUSD) is 6dp.
///         The original Composites pulls `repayAmount` (18dp) of debt token,
///         which fails for 6dp tokens. This contract converts to 6dp before pulling.
contract ShitCoolerComposites is ICoolerComposites, Owned, IEnabler {
    using SafeTransferLib for ERC20;

    bool public isEnabled;

    IMonoCooler public immutable COOLER;

    ERC20 internal immutable _COLLATERAL_TOKEN;
    ERC20 internal immutable _DEBT_TOKEN;

    /// @dev Decimal scaling factor: 18 - 6 = 12
    uint256 internal constant _DEBT_DECIMALS_OFFSET = 1e12;

    constructor(IMonoCooler cooler_, address owner_) Owned(owner_) {
        COOLER = cooler_;

        _COLLATERAL_TOKEN = ERC20(address(cooler_.collateralToken()));
        _COLLATERAL_TOKEN.approve(address(cooler_), type(uint256).max);

        _DEBT_TOKEN = ERC20(address(cooler_.debtToken()));
        _DEBT_TOKEN.approve(address(cooler_), type(uint256).max);
    }

    function addCollateralAndBorrow(
        IMonoCooler.Authorization memory authorization,
        IMonoCooler.Signature calldata signature,
        uint128 collateralAmount,
        uint128 borrowAmount,
        IDLGTEv1.DelegationRequest[] calldata delegationRequests
    ) external onlyEnabled {
        if (authorization.account != address(0)) {
            COOLER.setAuthorizationWithSig(authorization, signature);
        }

        _COLLATERAL_TOKEN.safeTransferFrom(msg.sender, address(this), collateralAmount);
        COOLER.addCollateral(collateralAmount, msg.sender, delegationRequests);
        COOLER.borrow(borrowAmount, msg.sender, msg.sender);
    }

    function repayAndRemoveCollateral(
        IMonoCooler.Authorization memory authorization,
        IMonoCooler.Signature calldata signature,
        uint128 repayAmount,
        uint128 collateralAmount,
        IDLGTEv1.DelegationRequest[] calldata delegationRequests
    ) external onlyEnabled {
        if (authorization.account != address(0)) {
            COOLER.setAuthorizationWithSig(authorization, signature);
        }

        // Convert repayAmount from 18dp (wad) to 6dp for AZUSD transfer
        uint256 debtTokenAmount = uint256(repayAmount) / _DEBT_DECIMALS_OFFSET;
        _DEBT_TOKEN.safeTransferFrom(msg.sender, address(this), debtTokenAmount);
        COOLER.repay(repayAmount, msg.sender);
        COOLER.withdrawCollateral(collateralAmount, msg.sender, msg.sender, delegationRequests);

        uint256 debtTokenBalance = _DEBT_TOKEN.balanceOf(address(this));
        if (debtTokenBalance > 0) {
            _DEBT_TOKEN.safeTransfer(msg.sender, debtTokenBalance);
            emit TokenRefunded(address(_DEBT_TOKEN), msg.sender, debtTokenBalance);
        }
    }

    function collateralToken() external view returns (IERC20) {
        return IERC20(address(_COLLATERAL_TOKEN));
    }

    function debtToken() external view returns (IERC20) {
        return IERC20(address(_DEBT_TOKEN));
    }

    modifier onlyEnabled() {
        if (!isEnabled) revert NotEnabled();
        _;
    }

    function enable(bytes calldata) external onlyOwner {
        if (isEnabled) revert NotDisabled();
        isEnabled = true;
        emit Enabled();
    }

    function disable(bytes calldata) external onlyEnabled onlyOwner {
        isEnabled = false;
        emit Disabled();
    }
}
