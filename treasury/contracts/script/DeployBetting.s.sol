// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

// Existing protocol
import {ShitToken} from "../src/ShitToken.sol";

// Vendored OSS contracts (all MIT licensed)
// Agent ledger — nathcortez/agent-ledger
import {AgentLedger} from "@agent-ledger/AgentLedger.sol";

// De-Fi Strategy Arena — Pradyuman-aviator/De-Fi
import {ArenaCore} from "@defi-arena/ArenaCore.sol";
import {Leaderboard} from "@defi-arena/Leaderboard.sol";
import {PortfolioManager} from "@defi-arena/PortfolioManager.sol";
import {PriceOracle} from "@defi-arena/PriceOracle.sol";

// Monad copytrade — w1th0ut/monad-copytrade
import {CopyTradeRegistry} from "@monad-copytrade/CopyTradeRegistry.sol";
import {TradingEngine} from "@monad-copytrade/TradingEngine.sol";
import {Vault} from "@monad-copytrade/Vault.sol";
import {VUSD} from "@monad-copytrade/VUSD.sol";

// Profit sharing vaults — JoseMiguelHerrera/profitSharingVault
import {ProfitSharingVault} from "@profitSharingVault/ProfitSharingVault.sol";

/// @title DeployBetting
/// @notice Deploys all vendored OSS betting contracts and wires them to SHIT token
/// @dev All contracts are MIT-licensed OSS. This script is ~90 lines of glue.
contract DeployBetting is Script {
    string[16] CONNECTOMES = [
        "celegans", "drosophila", "human", "macaque", "macaque_modha", "mouse", "rat",
        "malecns", "hemibrain", "medulla", "mouse_retina", "platynereis",
        "ciona", "larva", "celegans_herm", "celegans_male"
    ];

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        address shitToken = vm.envAddress("SHIT_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);

        // === 1. Agent Ledger (nathcortez/agent-ledger, MIT) ===
        AgentLedger agentLedger = new AgentLedger();
        console2.log("AgentLedger:", address(agentLedger));

        // === 2. De-Fi Strategy Arena (Pradyuman-aviator/De-Fi, MIT) ===
        PriceOracle priceOracle = new PriceOracle(1_000_000); // initial price 1M (placeholder)
        PortfolioManager portfolioManager = new PortfolioManager(1_000); // 1000 default capital per agent
        Leaderboard leaderboard = new Leaderboard(address(portfolioManager));
        ArenaCore arenaCore = new ArenaCore();
        console2.log("ArenaCore:", address(arenaCore));

        // === 3. Monad Copytrade (w1th0ut/monad-copytrade, MIT) ===
        // Deploy VUSD receipt token first
        VUSD vusd = new VUSD(deployer);
        // Deploy Vault with SHIT as collateral and VUSD as receipt
        Vault copyVault = new Vault(shitToken, address(vusd), multisig);
        // Deploy TradingEngine
        TradingEngine tradingEngine = new TradingEngine(
            shitToken,    // usdc_ (using SHIT as collateral)
            address(copyVault), // vault_
            multisig,     // keeper_
            multisig,     // treasury_
            multisig      // initialOwner
        );
        CopyTradeRegistry copyRegistry = new CopyTradeRegistry(address(tradingEngine), multisig);
        console2.log("CopyTradeRegistry:", address(copyRegistry));

        // Register 16 connectomes as copy-trade leaders
        // Note: registerLeader uses msg.sender as the leader address
        // In production, each connectome would call this from its own wallet
        for (uint256 i = 0; i < CONNECTOMES.length; i++) {
            copyRegistry.registerLeader(CONNECTOMES[i]);
        }

        // === 4. Profit Sharing Vaults (JoseMiguelHerrera/profitSharingVault, MIT) ===
        // Deploy 16 vault instances — one per connectome
        address[] memory vaults = new address[](16);
        for (uint256 i = 0; i < CONNECTOMES.length; i++) {
            ProfitSharingVault vault = new ProfitSharingVault(
                shitToken,     // _asset (SHIT token)
                deployer,      // strategyAddress (connectome's wallet — placeholder)
                "",            // strategyUri
                CONNECTOMES[i],// strategyName (connectome ID)
                false,         // strategyIsSmartWallet
                multisig,      // defaultProfitDistributor
                multisig       // defaultWithDrawAdmin
            );
            vaults[i] = address(vault);
        }
        console2.log("Deployed 16 ProfitSharingVault instances");

        vm.stopBroadcast();

        // Log all addresses for configuration
        console2.log("=== Deployed Betting Contracts ===");
        console2.log("AgentLedger:", address(agentLedger));
        console2.log("ArenaCore:", address(arenaCore));
        console2.log("PriceOracle:", address(priceOracle));
        console2.log("PortfolioManager:", address(portfolioManager));
        console2.log("Leaderboard:", address(leaderboard));
        console2.log("CopyTradeRegistry:", address(copyRegistry));
        console2.log("TradingEngine:", address(tradingEngine));
        console2.log("CopyVault:", address(copyVault));
        console2.log("VUSD:", address(vusd));
        for (uint256 i = 0; i < 16; i++) {
            console2.log("Vault", i, CONNECTOMES[i], vaults[i]);
        }
    }
}
