// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {Kernel, Actions} from "@shit-v3/Kernel.sol";
import {SHIT ProtocolRange} from "@shit-v3/modules/RANGE/SHIT ProtocolRange.sol";
import {SHIT ProtocolMinter} from "@shit-v3/modules/MINTR/SHIT ProtocolMinter.sol";
import {SHIT ProtocolTreasury} from "@shit-v3/modules/TRSRY/SHIT ProtocolTreasury.sol";
import {ShitPrice} from "../src/ShitPrice.sol";
import {ShitPriceFeed} from "../src/ShitPriceFeed.sol";
import {ShitDefenseBudget} from "../src/ShitDefenseBudget.sol";
import {Operator} from "@shit-v3/policies/Operator.sol";
import {BondCallback} from "@shit-v3/policies/BondCallback.sol";
import {SHIT ProtocolHeart} from "@shit-v3/policies/Heart.sol";
import {IBondSDA} from "@shit-v3/interfaces/IBondSDA.sol";
import {IBondAggregator} from "@shit-v3/interfaces/IBondAggregator.sol";
import {IBondCallback} from "@shit-v3/interfaces/IBondCallback.sol";
import {ERC20} from "@solmate-6.2.0/tokens/ERC20.sol";

/// @title MigrateReserve
/// @notice Migrates the RBS reserve token from AZUSD to Bucky by deploying new modules and policies.
/// @dev The SHIT Protocol V3 Operator, RANGE, and PRICE modules have immutable reserve/shit tokens.
///      Switching the reserve requires deploying new instances and swapping them in via Kernel.
///      This script is NOT run at initial deployment — it is for future use when Bucky is ready
///      to replace AZUSD as the RBS reserve token.
///
///      Prerequisites:
///      - Bucky token is deployed and has sufficient liquidity
///      - SHIT/Bucky Uniswap V3 pool exists with TWAP history
///      - Safe multisig is the Kernel executor
///      - All env vars are set (see .env.example)
///
///      Post-migration steps (via Safe multisig):
///      - Initialize new ShitPrice with start observations
///      - Set cushion params, spreads, and regen params on new Operator
///      - Register Bucky as reserve in SHIT ProtocolTreasury
///      - Update ShitInverseBond.setPayoutToken() to Bucky
///      - Update ShitCircuitBreaker to monitor Bucky directly (if not already)
contract MigrateReserve is Script {
    error MissingRequiredEnvVar(string name);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address safe = vm.envOr("SAFE_MULTISIG_ADDRESS", msg.sender);

        // Existing contract addresses (from Phase 2 deployment)
        address kernelAddr = vm.envAddress("KERNEL_ADDRESS");
        address bondAggregator = vm.envOr("BOND_AGGREGATOR_ADDRESS", address(0x007A6621A9997A633Cb1B757f2f7ffb51310704A));
        address shitTokenAddr = vm.envAddress("SHIT_TOKEN_ADDRESS");
        address treasuryAddr = vm.envOr("TREASURY_ADDRESS", safe);

        // New reserve token (Bucky)
        address buckyTokenAddr = vm.envAddress("BUCKY_TOKEN_ADDRESS");
        if (buckyTokenAddr == address(0)) revert MissingRequiredEnvVar("BUCKY_TOKEN_ADDRESS");

        // New Uniswap V3 pool for SHIT/Bucky TWAP
        address shitBuckyPool = vm.envOr("UNISWAP_V3_SHIT_BUCKY_POOL", address(0));
        if (shitBuckyPool == address(0)) revert MissingRequiredEnvVar("UNISWAP_V3_SHIT_BUCKY_POOL");

        // Existing TreasuryValuation (reused — it's not reserve-specific)
        address treasuryPolicyAddr = vm.envAddress("TREASURY_VALUATION_ADDRESS");

        Kernel kernel = Kernel(kernelAddr);
        ERC20 shitToken = ERC20(shitTokenAddr);
        ERC20 buckyToken = ERC20(buckyTokenAddr);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== Reserve Migration: AZUSD -> Bucky ===");

        // 1. Deploy new ShitPriceFeed pointing to SHIT/Bucky pool
        ShitPriceFeed newPriceFeed = new ShitPriceFeed(
            shitBuckyPool,
            shitTokenAddr,
            treasuryPolicyAddr,
            safe
        );
        console2.log("New ShitPriceFeed (SHIT/Bucky):", address(newPriceFeed));

        // 2. Deploy new ShitPrice module with the new price feed
        ShitPrice newPrice = new ShitPrice(
            kernel,
            address(newPriceFeed),
            8 hours,
            7 days,
            1e18,
            safe
        );
        console2.log("New ShitPrice:", address(newPrice));

        // 3. Deploy new SHIT ProtocolRange with Bucky as reserve
        SHIT ProtocolRange newRange = new SHIT ProtocolRange(
            kernel,
            shitToken,
            buckyToken,
            5000,                       // thresholdFactor = 50%
            [uint256(200), uint256(600)],  // lowSpreads
            [uint256(200), uint256(600)]   // highSpreads
        );
        console2.log("New SHIT ProtocolRange:", address(newRange));

        // 4. Deploy new BondCallback for the new reserve
        BondCallback newBondCallback = new BondCallback(
            kernel,
            IBondAggregator(bondAggregator),
            shitToken
        );
        console2.log("New BondCallback:", address(newBondCallback));

        // 5. Deploy new Operator with Bucky as reserve
        Operator newOperator = new Operator(
            kernel,
            IBondSDA(bondAggregator),
            IBondCallback(address(newBondCallback)),
            [
                shitTokenAddr,
                buckyTokenAddr,
                address(0),             // sReserve (no ERC4626 wrapper)
                address(0)              // oldReserve (AZUSD tracked for migration)
            ],
            [
                uint32(5000),           // cushionFactor = 50%
                uint32(3 days),         // cushionDuration
                uint32(15000),          // cushionDebtBuffer
                uint32(12 hours),       // cushionDepositInterval
                uint32(5000),           // reserveFactor = 50%
                uint32(24 hours),       // regenWait
                uint32(3),              // regenThreshold
                uint32(5)               // regenObserve
            ]
        );
        console2.log("New Operator:", address(newOperator));

        // 6. Deploy new ShitDefenseBudget wrapping the new Operator
        ShitDefenseBudget newDefenseBudget = new ShitDefenseBudget(
            kernel,
            address(newOperator),
            treasuryAddr,
            shitTokenAddr,
            safe
        );
        console2.log("New ShitDefenseBudget:", address(newDefenseBudget));

        // 7. Install new modules in Kernel (replaces old PRICE and RANGE)
        kernel.executeAction(Actions.InstallModule, address(newPrice));
        console2.log("New PRICE module installed");
        kernel.executeAction(Actions.InstallModule, address(newRange));
        console2.log("New RANGE module installed");

        // 8. Activate new policies
        kernel.executeAction(Actions.ActivatePolicy, address(newBondCallback));
        console2.log("New BondCallback activated");
        kernel.executeAction(Actions.ActivatePolicy, address(newOperator));
        console2.log("New Operator activated");
        kernel.executeAction(Actions.ActivatePolicy, address(newDefenseBudget));
        console2.log("New ShitDefenseBudget activated");

        // 9. Register new DefenseBudget as periodic task on Heart
        address heartAddr = vm.envAddress("HEART_ADDRESS");
        SHIT ProtocolHeart heart = SHIT ProtocolHeart(heartAddr);
        heart.addPeriodicTask(address(newDefenseBudget));
        console2.log("New DefenseBudget registered on Heart");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== MIGRATION COMPLETE ===");
        console2.log("");
        console2.log("POST-MIGRATION CHECKLIST (via Safe multisig):");
        console2.log("  1. Initialize new ShitPrice with start observations via Heart beat");
        console2.log("  2. Set cushion params on new Operator: setCushionParams(duration, debtBuffer, depositInterval)");
        console2.log("  3. Set spreads on new Operator: setSpreads(high, cushionSpread, wallSpread)");
        console2.log("  4. Set regen params on new Operator: setRegenParams(wait, threshold, observe)");
        console2.log("  5. Register Bucky as reserve in SHIT ProtocolTreasury");
        console2.log("  6. Update ShitInverseBond.setPayoutToken(buckyTokenAddr)");
        console2.log("  7. Update ShitCircuitBreaker price feed if needed");
        console2.log("  8. Deactivate old Operator, BondCallback, DefenseBudget via Kernel");
        console2.log("  9. Verify new bond markets are creating/closing correctly on next Heart beat");
        console2.log("  10. Update Gelato tasks if any addresses changed");
    }
}
