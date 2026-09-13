// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {Kernel, Actions} from "@shit-v3/Kernel.sol";
import {SHIT ProtocolRoles} from "@shit-v3/modules/ROLES/SHIT ProtocolRoles.sol";
import {SHIT ProtocolMinter} from "@shit-v3/modules/MINTR/SHIT ProtocolMinter.sol";
import {SHIT ProtocolTreasury} from "@shit-v3/modules/TRSRY/SHIT ProtocolTreasury.sol";
import {SHIT ProtocolGovDelegation} from "@shit-v3/modules/DLGTE/SHIT ProtocolGovDelegation.sol";
import {DelegateEscrowFactory} from "@shit-v3/external/cooler/DelegateEscrowFactory.sol";

import {RolesAdmin} from "@shit-v3/policies/RolesAdmin.sol";
import {CoolerLtvOracle} from "@shit-v3/policies/cooler/CoolerLtvOracle.sol";
import {MonoCooler} from "@shit-v3/policies/cooler/MonoCooler.sol";
import {CoolerComposites} from "@shit-v3/periphery/CoolerComposites.sol";

import {ShitCoolerTreasuryBorrower} from "../src/ShitCoolerTreasuryBorrower.sol";

import {ERC20} from "solmate/tokens/ERC20.sol";

/// @title DeployMonoCooler
/// @notice Deploys the full MonoCooler ecosystem on Base Sepolia using existing SHIT Protocol V3 contracts.
///         Requires: PRIVATE_KEY, and existing deployed tokens (SHIT, wstSHIT, AZUSD, Staking, Kernel).
contract DeployMonoCooler is Script {
    // Existing deployed addresses on Base Sepolia
    address constant KERNEL = 0x25D98fa2e827227243108Ac111F084cdfeE020be;
    address constant SHIT = 0x823d5d44F9E647402c949376E54f709Ab3a9015b;
    address constant WSTSHIT = 0x933E4B8e744733FAaFD67aC99eD8987C9Aa5E533;
    address constant AZUSD = 0xb6a1BC3D383f8751eF0CC216943290740E4D1493;
    address constant STAKING = 0x395f6Cc9aAEE56f292dBE5dcc76fF3b30637cd4e;
    address constant SAFE = 0x47bB7d3048c0aB38aEb4075FB5116307d39f68F1;

    // LTV Oracle params: 50% origination LTV, 10% max delta, 1 day min time delta,
    // 1% per day rate of change, 20% max liq premium, 10% liq premium
    uint96 constant INITIAL_OLTV = 0.5e18; // 50%
    uint96 constant MAX_OLTV_DELTA = 0.1e18; // 10%
    uint32 constant MIN_OLTV_TIME_DELTA = 1 days;
    uint96 constant MAX_OLTV_RATE = 0.01e18; // 1% per day
    uint16 constant MAX_LIQ_PREMIUM_BPS = 2000; // 20%
    uint16 constant LIQ_PREMIUM_BPS = 1000; // 10%

    // MonoCooler params
    uint96 constant INTEREST_RATE_WAD = 0.02e18; // 2% interest rate
    uint256 constant MIN_DEBT_REQUIRED = 1e18; // 1 wstSHIT minimum debt

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== Deploying MonoCooler Ecosystem ===");
        console2.log("Deployer:", deployer);
        console2.log("Kernel:", KERNEL);

        // ── Phase 1: Install SHIT Protocol V3 Modules ──
        console2.log("\n--- Phase 1: Install Modules ---");

        Kernel kernel = Kernel(KERNEL);

        // 1a. SHIT ProtocolRoles (ROLES)
        SHIT ProtocolRoles roles = new SHIT ProtocolRoles(kernel);
        kernel.executeAction(Actions.InstallModule, address(roles));
        console2.log("SHIT ProtocolRoles (ROLES):", address(roles));

        // 1b. SHIT ProtocolMinter (MINTR)
        SHIT ProtocolMinter minter = new SHIT ProtocolMinter(kernel, SHIT);
        kernel.executeAction(Actions.InstallModule, address(minter));
        console2.log("SHIT ProtocolMinter (MINTR):", address(minter));

        // 1c. SHIT ProtocolTreasury (TRSRY)
        SHIT ProtocolTreasury treasury = new SHIT ProtocolTreasury(kernel);
        kernel.executeAction(Actions.InstallModule, address(treasury));
        console2.log("SHIT ProtocolTreasury (TRSRY):", address(treasury));

        // 1d. DelegateEscrowFactory + SHIT ProtocolGovDelegation (DLGTE)
        DelegateEscrowFactory escrowFactory = new DelegateEscrowFactory(WSTSHIT);
        console2.log("DelegateEscrowFactory:", address(escrowFactory));

        SHIT ProtocolGovDelegation dlgte = new SHIT ProtocolGovDelegation(kernel, WSTSHIT, escrowFactory);
        kernel.executeAction(Actions.InstallModule, address(dlgte));
        console2.log("SHIT ProtocolGovDelegation (DLGTE):", address(dlgte));

        // ── Phase 2: Activate RolesAdmin Policy ──
        console2.log("\n--- Phase 2: Activate RolesAdmin ---");

        RolesAdmin rolesAdmin = new RolesAdmin(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(rolesAdmin));
        console2.log("RolesAdmin:", address(rolesAdmin));

        // Grant ADMIN_ROLE to deployer (RolesAdmin admin is msg.sender = deployer)
        rolesAdmin.grantRole("admin", deployer);
        console2.log("Granted ADMIN_ROLE to deployer");

        // ── Phase 3: Deploy & Activate CoolerLtvOracle ──
        console2.log("\n--- Phase 3: CoolerLtvOracle ---");
        // Note: LtvOracle requires 18dp debt token. We pass WSTSHIT (18dp) to satisfy
        // the constructor check. The actual debt token (AZUSD) is handled by TreasuryBorrower.
        CoolerLtvOracle ltvOracle = new CoolerLtvOracle(
            KERNEL,
            WSTSHIT, // collateralToken (18dp)
            WSTSHIT, // debtToken (18dp, just for the check — actual debt is AZUSD)
            INITIAL_OLTV,
            MAX_OLTV_DELTA,
            MIN_OLTV_TIME_DELTA,
            MAX_OLTV_RATE,
            MAX_LIQ_PREMIUM_BPS,
            LIQ_PREMIUM_BPS
        );
        kernel.executeAction(Actions.ActivatePolicy, address(ltvOracle));
        console2.log("CoolerLtvOracle:", address(ltvOracle));

        // ── Phase 4: Deploy & Activate ShitCoolerTreasuryBorrower ──
        console2.log("\n--- Phase 4: ShitCoolerTreasuryBorrower ---");

        ShitCoolerTreasuryBorrower treasuryBorrower = new ShitCoolerTreasuryBorrower(KERNEL, AZUSD);
        kernel.executeAction(Actions.ActivatePolicy, address(treasuryBorrower));
        console2.log("ShitCoolerTreasuryBorrower:", address(treasuryBorrower));

        // Fund TreasuryBorrower with AZUSD (transfer from deployer)
        // Transfer 900,000 AZUSD (6dp) to the treasury borrower
        ERC20(AZUSD).transfer(address(treasuryBorrower), 900_000e6);
        console2.log("Funded TreasuryBorrower with 900,000 AZUSD");

        // Enable the TreasuryBorrower
        treasuryBorrower.enable("");
        console2.log("TreasuryBorrower enabled");

        // ── Phase 5: Deploy & Activate MonoCooler ──
        console2.log("\n--- Phase 5: MonoCooler ---");

        MonoCooler cooler = new MonoCooler(
            SHIT, // shit (used for burn in liquidations)
            WSTSHIT, // gshit (collateral token)
            STAKING, // staking
            KERNEL, // kernel
            address(ltvOracle), // ltvOracle
            INTEREST_RATE_WAD, // interestRateWad
            MIN_DEBT_REQUIRED // minDebtRequired
        );
        kernel.executeAction(Actions.ActivatePolicy, address(cooler));
        console2.log("MonoCooler:", address(cooler));

        // Set treasuryBorrower on MonoCooler (permissionless if uninitialized)
        cooler.setTreasuryBorrower(address(treasuryBorrower));
        console2.log("Set treasuryBorrower on MonoCooler");

        // Grant COOLER_ROLE to MonoCooler on TreasuryBorrower
        rolesAdmin.grantRole("treasuryborrower_cooler", address(cooler));
        console2.log("Granted COOLER_ROLE to MonoCooler");

        // ── Phase 6: Deploy CoolerComposites ──
        console2.log("\n--- Phase 6: CoolerComposites ---");

        CoolerComposites composites = new CoolerComposites(cooler, deployer);
        console2.log("CoolerComposites:", address(composites));

        // Enable Composites
        composites.enable("");
        console2.log("Composites enabled");

        // ── Phase 7: Set authorized minter on SHIT ──
        console2.log("\n--- Phase 7: Configure SHIT minter ---");
        // Call SHIT.setAuthorizedMinter(address(minter)) so MINTR can mint SHIT
        // This requires the deployer to be the multisig (SAFE)
        // On testnet, deployer == SAFE, so this should work
        (bool success,) = SHIT.call(
            abi.encodeWithSignature("setAuthorizedMinter(address)", address(minter))
        );
        if (success) {
            console2.log("Set MINTR as authorized minter on SHIT");
        } else {
            console2.log("WARNING: Could not set authorized minter on SHIT");
        }

        // ── Summary ──
        console2.log("\n=== Deployment Summary ===");
        console2.log("ROLES module:", address(roles));
        console2.log("MINTR module:", address(minter));
        console2.log("TRSRY module:", address(treasury));
        console2.log("DLGTE module:", address(dlgte));
        console2.log("RolesAdmin:", address(rolesAdmin));
        console2.log("CoolerLtvOracle:", address(ltvOracle));
        console2.log("ShitCoolerTreasuryBorrower:", address(treasuryBorrower));
        console2.log("MonoCooler:", address(cooler));
        console2.log("CoolerComposites:", address(composites));

        vm.stopBroadcast();
    }
}
