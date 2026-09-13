// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {IDistributor} from "@shit-v3/policies/interfaces/IDistributor.sol";
import {IStaking} from "@shit-v3/interfaces/IStaking.sol";
import {ShitStaking} from "./ShitStaking.sol";

/// @title ShitDistributor
/// @notice Minimal distributor that bridges SHIT Protocol Heart to ShitStaking's rebase.
/// @dev The SHIT Protocol Heart calls `distributor.triggerRebase()` on each beat.
///      ShitStaking handles its own reward distribution (harvest yield + supplemental emissions),
///      so this distributor simply delegates the rebase call. No MINTR or TRSRY dependencies needed.
///      The `staking()` getter returns the StakingAdapter (IStaking) so the Heart can sync
///      beat frequency with the staking epoch.
contract ShitDistributor is IDistributor {
    /// @notice ShitStaking contract that performs the actual rebase
    ShitStaking public immutable shitStaking;

    /// @notice StakingAdapter implementing IStaking for Heart epoch sync
    IStaking public immutable stakingAdapter;

    constructor(address shitStaking_, address stakingAdapter_) {
        if (shitStaking_ == address(0) || stakingAdapter_ == address(0))
            revert("ZeroAddress");
        shitStaking = ShitStaking(shitStaking_);
        stakingAdapter = IStaking(stakingAdapter_);
    }

    /// @inheritdoc IDistributor
    /// @dev Calls ShitStaking.rebase() which reverts if not at epoch end.
    ///      The Heart's beat frequency must match the staking epoch length (8 hours).
    function triggerRebase() external override {
        shitStaking.rebase();
    }

    /// @inheritdoc IDistributor
    /// @dev No-op: ShitStaking handles reward distribution internally via its rebase logic.
    function distribute() external override {}

    /// @inheritdoc IDistributor
    /// @dev Returns 0 — no bounty system in SHIT Protocol.
    function retrieveBounty() external override returns (uint256) {
        return 0;
    }

    /// @inheritdoc IDistributor
    function staking() external view override returns (IStaking) {
        return stakingAdapter;
    }
}
