// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {Kernel, Actions} from "@shit-v3/Kernel.sol";
import {RolesAdmin} from "@shit-v3/policies/RolesAdmin.sol";
import {MonoCooler} from "@shit-v3/policies/cooler/MonoCooler.sol";
import {CoolerComposites} from "@shit-v3/periphery/CoolerComposites.sol";

import {ShitCoolerComposites} from "../src/ShitCoolerComposites.sol";

/// @title RedeployMonoCoolerNoMinDebt
/// @notice Deploys a new MonoCooler with minDebtRequired=0 and a new Composites,
///         reusing existing Kernel, LTV Oracle, TreasuryBorrower, and RolesAdmin.
contract RedeployMonoCoolerNoMinDebt is Script {
    // Existing deployed addresses on Base Sepolia
    address constant KERNEL = 0x25D98fa2e827227243108Ac111F084cdfeE020be;
    address constant SHIT = 0x823d5d44F9E647402c949376E54f709Ab3a9015b;
    address constant WSTSHIT = 0x933E4B8e744733FAaFD67aC99eD8987C9Aa5E533;
    address constant STAKING = 0x395f6Cc9aAEE56f292dBE5dcc76fF3b30637cd4e;
    address constant LTV_ORACLE = 0xccffA7541D15454a2C95f453c8957B7D6Ffb95A4;
    address constant TREASURY_BORROWER = 0xde56efbc39A7a2d4bad62834E453f5636ec423E7;
    address constant ROLES_ADMIN = 0x7479b17b39eFF3465482B4aa8B2E7776CB663D8E;

    // MonoCooler params — same as before except minDebtRequired = 0
    uint96 constant INTEREST_RATE_WAD = 0.02e18; // 2% interest rate
    uint256 constant MIN_DEBT_REQUIRED = 0; // No minimum debt

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== Redeploying MonoCooler with minDebtRequired=0 ===");
        console2.log("Deployer:", deployer);
        console2.log("Kernel:", KERNEL);
        console2.log("LTV Oracle:", LTV_ORACLE);
        console2.log("TreasuryBorrower:", TREASURY_BORROWER);

        // ── Phase 1: Deploy & Activate new MonoCooler ──
        console2.log("\n--- Phase 1: Deploy MonoCooler ---");

        MonoCooler cooler = new MonoCooler(
            SHIT, // shit (used for burn in liquidations)
            WSTSHIT, // gshit (collateral token)
            STAKING, // staking
            KERNEL, // kernel
            LTV_ORACLE, // ltvOracle
            INTEREST_RATE_WAD, // interestRateWad
            MIN_DEBT_REQUIRED // minDebtRequired = 0
        );
        console2.log("New MonoCooler:", address(cooler));

        // Activate the MonoCooler policy on the Kernel
        Kernel kernel = Kernel(KERNEL);
        kernel.executeAction(Actions.ActivatePolicy, address(cooler));
        console2.log("MonoCooler activated on Kernel");

        // Set treasuryBorrower on MonoCooler (permissionless if uninitialized)
        cooler.setTreasuryBorrower(TREASURY_BORROWER);
        console2.log("Set treasuryBorrower on MonoCooler");

        // Grant COOLER_ROLE to MonoCooler on TreasuryBorrower via RolesAdmin
        RolesAdmin rolesAdmin = RolesAdmin(ROLES_ADMIN);
        rolesAdmin.grantRole("treasuryborrower_cooler", address(cooler));
        console2.log("Granted COOLER_ROLE to new MonoCooler");

        // ── Phase 2: Deploy new Composites ──
        console2.log("\n--- Phase 2: Deploy Composites ---");

        ShitCoolerComposites composites = new ShitCoolerComposites(cooler, deployer);
        console2.log("New Composites:", address(composites));

        // Enable Composites
        composites.enable("");
        console2.log("Composites enabled");

        // ── Summary ──
        console2.log("\n=== Deployment Summary ===");
        console2.log("New MonoCooler:", address(cooler));
        console2.log("New Composites:", address(composites));
        console2.log("minDebtRequired: 0");

        vm.stopBroadcast();
    }
}
