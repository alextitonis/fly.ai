// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ReferralRegistry} from "../src/ReferralRegistry.sol";

/// @notice Registers protocol contracts as fee sources on the ReferralRegistry.
///         Must be run by the multisig owner.
///         Usage:
///           forge script script/SetupReferralFeeSources.s.sol \
///             --rpc-url base-sepolia \
///             --private-key $MULTISIG_PK \
///             --broadcast
contract SetupReferralFeeSources is Script {
    // ReferralRegistry proxy on Base Sepolia
    address constant REFERRAL_REGISTRY = 0x646C549764f9A90aE55e3c58417b16246FFE6554;

    // Protocol contracts that collect fees and should call recordFee
    address constant SHIT_BONDING = 0x28Fd809B13F62DD94518a13c8E009A41fce97C67;
    address constant SHIT_PSM = 0xC51e42922975934F7abC8196F3a017A2BcB48CB1;
    address constant SWAP_LIQUIDATOR = 0xbfdC188165c7327Af028a8546E5f719833CEdBAa;
    address constant SHIT_SWAP_LP_ADAPTER = 0x25A1b43f7e104AaE801C6cA93ED52FeEB1f601eA;

    function run() external {
        ReferralRegistry registry = ReferralRegistry(REFERRAL_REGISTRY);

        vm.startBroadcast();

        // Register fee sources
        registry.setFeeSource(SHIT_BONDING, true);
        console2.log("Registered SHIT_BONDING as fee source:", SHIT_BONDING);

        registry.setFeeSource(SHIT_PSM, true);
        console2.log("Registered SHIT_PSM as fee source:", SHIT_PSM);

        registry.setFeeSource(SWAP_LIQUIDATOR, true);
        console2.log("Registered SWAP_LIQUIDATOR as fee source:", SWAP_LIQUIDATOR);

        registry.setFeeSource(SHIT_SWAP_LP_ADAPTER, true);
        console2.log("Registered SHIT_SWAP_LP_ADAPTER as fee source:", SHIT_SWAP_LP_ADAPTER);

        vm.stopBroadcast();

        console2.log("All fee sources registered successfully.");
    }
}
