// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {ShitToken} from "../src/ShitToken.sol";
import {ShitDeployer} from "../src/ShitDeployer.sol";
import {TokenRegistry} from "../src/TokenRegistry.sol";
import {TokenOnboardingManager} from "../src/TokenOnboardingManager.sol";
import {ImpactTokens} from "../src/ImpactTokens.sol";
import {Bucky} from "../src/Bucky.sol";
import {FixedRateProvider} from "../src/FixedRateProvider.sol";

/// @title DeployShitToken
/// @notice Phase 1 — deploy core tokens and registries with no external protocol dependencies.
/// @dev This is safe to run first. No Uniswap pool, Bond aggregator, or AZUSD needed.
///      After this completes:
///        1. Set SHIT_TOKEN_ADDRESS and BUCKY_TOKEN_ADDRESS in .env
///        2. Create the Uniswap V3 SHIT pool and seed initial liquidity
///        3. Call increaseObservationCardinalityNext on the pool
///        4. Wait for TWAP warmup (at least 30 minutes)
///        5. Run DeployShitPhase2.s.sol
contract DeployShitToken is Script {
    /// @dev Base mainnet chain ID — used to enforce non-testnet guards
    uint256 internal constant BASE_MAINNET = 8453;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address safe = vm.envOr("SAFE_MULTISIG_ADDRESS", msg.sender);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== Phase 1: Core Tokens & Registries ===");

        // 1. ShitDeployer — CREATE2 deployment utility
        ShitDeployer deployer = new ShitDeployer();
        console2.log("ShitDeployer:", address(deployer));

        // 2. ShitToken (SHIT) — multisig-gated ERC20
        ShitToken shitToken = new ShitToken(safe);
        console2.log("ShitToken:", address(shitToken));

        // 3. Bucky — DSS-based stablecoin
        Bucky buckyToken = new Bucky("Bucky", "BUCKY", block.chainid);
        console2.log("Bucky:", address(buckyToken));

        // 4. FixedRateProvider (for PSM)
        FixedRateProvider rateProvider = new FixedRateProvider();
        console2.log("FixedRateProvider:", address(rateProvider));

        // 5. TokenRegistry — deployer is initial admin, transfers to Safe after setup
        TokenRegistry tokenRegistry = new TokenRegistry(msg.sender);
        console2.log("TokenRegistry:", address(tokenRegistry));

        // 6. TokenOnboardingManager
        TokenOnboardingManager onboardingManager = new TokenOnboardingManager(tokenRegistry, safe);
        console2.log("TokenOnboardingManager:", address(onboardingManager));

        // 7. Grant onboarding manager MANAGER_ROLE on registry
        tokenRegistry.grantRole(tokenRegistry.MANAGER_ROLE(), address(onboardingManager));

        // 8. Whitelist initial impact tokens (skip if not deployed on this chain)
        address[] memory impactTokenAddresses = ImpactTokens.getAddresses();
        for (uint256 i = 0; i < impactTokenAddresses.length; i++) {
            if (impactTokenAddresses[i].code.length > 0) {
                tokenRegistry.whitelist(impactTokenAddresses[i]);
                ImpactTokens.TokenInfo memory info = ImpactTokens.getToken(i);
                console2.log("Whitelisted impact token:", info.name, impactTokenAddresses[i]);
            } else {
                ImpactTokens.TokenInfo memory info = ImpactTokens.getToken(i);
                console2.log("Skipped impact token (not on this chain):", info.name);
            }
        }

        // 9. Transfer TokenRegistry admin to Safe
        tokenRegistry.grantRole(tokenRegistry.DEFAULT_ADMIN_ROLE(), safe);
        tokenRegistry.grantRole(tokenRegistry.MANAGER_ROLE(), safe);
        tokenRegistry.renounceRole(tokenRegistry.DEFAULT_ADMIN_ROLE(), msg.sender);
        tokenRegistry.renounceRole(tokenRegistry.MANAGER_ROLE(), msg.sender);

        vm.stopBroadcast();

        console2.log("=== PHASE 1 COMPLETE ===");
        console2.log("SHIT_TOKEN_ADDRESS=", address(shitToken));
        console2.log("BUCKY_TOKEN_ADDRESS=", address(buckyToken));
        console2.log("Governance (Safe):", safe);
        console2.log("");
        console2.log("NEXT STEPS:");
        console2.log("1. Set SHIT_TOKEN_ADDRESS and BUCKY_TOKEN_ADDRESS in .env");
        console2.log("2. Create Uniswap V3 SHIT pool and seed initial liquidity");
        console2.log("3. Call increaseObservationCardinalityNext on the pool");
        console2.log("4. Wait for TWAP warmup (at least 30 minutes)");
        console2.log("5. Run: forge script script/DeployShitPhase2.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify");
    }
}
