// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStaking} from "@shit-v3/interfaces/IStaking.sol";
import {WstSHIT} from "./wstSHIT.sol";
import {ShitStaking} from "./ShitStaking.sol";

/// @title StakingAdapter
/// @notice Implements SHIT Protocol V3 IStaking by bridging to SHIT Protocol's real staking contracts.
/// @dev MonoCooler calls IStaking.unstake() to unwrap WSTSHIT → stSHIT → SHIT.
///      This adapter delegates to WstSHIT.unwrap() and ShitStaking.unstake().
contract StakingAdapter is IStaking {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InsufficientAmount();

    address public immutable SHIT;
    address public immutable sSHIT;
    address public immutable gSHIT;

    WstSHIT public immutable wstShit;
    ShitStaking public immutable staking;

    constructor(address shit_, address stShit_, address wstShit_) {
        if (shit_ == address(0) || stShit_ == address(0) || wstShit_ == address(0)) revert ZeroAddress();
        SHIT = shit_;
        sSHIT = stShit_;
        gSHIT = wstShit_;
        wstShit = WstSHIT(wstShit_);
        staking = ShitStaking(stShit_);
    }

    function index() external view override returns (uint256) {
        return staking.index();
    }

    function supplyInWarmup() external pure override returns (uint256) {
        return 0;
    }

    function rebase() external override returns (uint256) {
        return 0;
    }

    /// @notice Stake SHIT → stSHIT (rebasing=true) or wstSHIT (rebasing=false)
    function stake(address to_, uint256 amount_, bool rebasing_, bool) external override returns (uint256) {
        if (amount_ == 0) revert InsufficientAmount();
        IERC20(SHIT).safeTransferFrom(msg.sender, address(this), amount_);
        IERC20(SHIT).forceApprove(address(staking), amount_);
        uint256 stShitAmount = staking.stake(amount_);
        if (rebasing_) {
            IERC20(sSHIT).safeTransfer(to_, stShitAmount);
            return stShitAmount;
        } else {
            IERC20(sSHIT).forceApprove(address(wstShit), stShitAmount);
            uint256 wstShitAmount = wstShit.wrap(stShitAmount);
            IERC20(gSHIT).safeTransfer(to_, wstShitAmount);
            return wstShitAmount;
        }
    }

    /// @notice Unstake stSHIT (rebasing=true) or wstSHIT (rebasing=false) → SHIT
    function unstake(address to_, uint256 amount_, bool, bool rebasing_) external override returns (uint256) {
        if (amount_ == 0) revert InsufficientAmount();
        uint256 stShitAmount;
        if (rebasing_) {
            IERC20(sSHIT).safeTransferFrom(msg.sender, address(this), amount_);
            stShitAmount = amount_;
        } else {
            IERC20(gSHIT).safeTransferFrom(msg.sender, address(this), amount_);
            stShitAmount = wstShit.unwrap(amount_);
        }
        uint256 shitAmount = staking.unstake(stShitAmount);
        IERC20(SHIT).safeTransfer(to_, shitAmount);
        return shitAmount;
    }

    /// @notice Wrap stSHIT → wstSHIT
    function wrap(address to_, uint256 amount_) external returns (uint256) {
        if (amount_ == 0) revert InsufficientAmount();
        IERC20(sSHIT).safeTransferFrom(msg.sender, address(this), amount_);
        IERC20(sSHIT).forceApprove(address(wstShit), amount_);
        uint256 wstShitAmount = wstShit.wrap(amount_);
        IERC20(gSHIT).safeTransfer(to_, wstShitAmount);
        return wstShitAmount;
    }

    /// @notice Unwrap wstSHIT → stSHIT (not to SHIT)
    function unwrap(address to_, uint256 amount_) external returns (uint256) {
        if (amount_ == 0) revert InsufficientAmount();
        IERC20(gSHIT).safeTransferFrom(msg.sender, address(this), amount_);
        uint256 stShitAmount = wstShit.unwrap(amount_);
        IERC20(sSHIT).safeTransfer(to_, stShitAmount);
        return stShitAmount;
    }

    function setDistributor(address) external override {}

    function secondsToNextEpoch() external view override returns (uint256) {
        return staking.secondsToNextEpoch();
    }

    function epoch() external view override returns (uint256, uint256, uint256, uint256) {
        return staking.epoch();
    }
}
