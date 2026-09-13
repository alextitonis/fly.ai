// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {Kernel, Actions} from "@shit-v3/Kernel.sol";
import {SHIT ProtocolRoles} from "@shit-v3/modules/ROLES/SHIT ProtocolRoles.sol";
import {SHIT ProtocolMinter} from "@shit-v3/modules/MINTR/SHIT ProtocolMinter.sol";
import {SHIT ProtocolTreasury} from "@shit-v3/modules/TRSRY/SHIT ProtocolTreasury.sol";
import {SHIT ProtocolRange} from "@shit-v3/modules/RANGE/SHIT ProtocolRange.sol";
import {SHIT ProtocolHeart} from "@shit-v3/policies/Heart.sol";
import {BondCallback} from "@shit-v3/policies/BondCallback.sol";
import {Operator} from "@shit-v3/policies/Operator.sol";
import {RolesAdmin} from "@shit-v3/policies/RolesAdmin.sol";
import {Emergency} from "@shit-v3/policies/Emergency.sol";
import {TreasuryCustodian} from "@shit-v3/policies/TreasuryCustodian.sol";
import {IBondSDA} from "@shit-v3/interfaces/IBondSDA.sol";
import {IBondAggregator} from "@shit-v3/interfaces/IBondAggregator.sol";
import {IBondCallback} from "@shit-v3/interfaces/IBondCallback.sol";
import {ERC20} from "@solmate-6.2.0/tokens/ERC20.sol";

import {TreasuryValuation} from "../src/TreasuryValuation.sol";
import {ShitPriceFeed} from "../src/ShitPriceFeed.sol";
import {ShitStaking} from "../src/ShitStaking.sol";
import {WstSHIT} from "../src/wstSHIT.sol";
import {StakingAdapter} from "../src/StakingAdapter.sol";
import {ShitDistributor} from "../src/ShitDistributor.sol";
import {ShitPrice} from "../src/ShitPrice.sol";
import {ShitDefenseBudget} from "../src/ShitDefenseBudget.sol";
import {ShitBondPricer} from "../src/ShitBondPricer.sol";
import {ShitInverseBond} from "../src/ShitInverseBond.sol";

/// @title DeployShitFork
/// @notice Deploys the SHIT Protocol V3 Kernel system and all SHIT Protocol policies/modules
///         that integrate with it. Assumes core tokens (SHIT, AZUSD) are already deployed.
/// @dev Run after DeployShitCore (or DeployAll Phase 1). Reads deployed addresses from env vars.
contract DeployShitFork is Script {
    /// @dev Base mainnet chain ID
    uint256 internal constant BASE_MAINNET = 8453;

    /// @dev Bond Protocol Aggregator on Base mainnet
    address internal constant BOND_AGGREGATOR_BASE = 0x007A6621A9997A633Cb1B757f2f7ffb51310704A;

    error MissingRequiredEnvVar(string name);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address safe = vm.envOr("SAFE_MULTISIG_ADDRESS", msg.sender);
        address treasury = vm.envOr("TREASURY_ADDRESS", safe);
        address shitTokenAddr = vm.envAddress("SHIT_TOKEN_ADDRESS");
        address azusdTokenAddr = vm.envAddress("AZUSD_TOKEN_ADDRESS");
        address uniswapV3Pool = vm.envOr("UNISWAP_V3_SHIT_POOL", address(0));
        address bondAggregator = vm.envOr("BOND_AGGREGATOR_ADDRESS", BOND_AGGREGATOR_BASE);

        // On Base mainnet, require real Uniswap pool and Bond aggregator
        if (block.chainid == BASE_MAINNET) {
            if (uniswapV3Pool == address(0)) {
                revert MissingRequiredEnvVar("UNISWAP_V3_SHIT_POOL");
            }
            if (bondAggregator == address(0)) {
                revert MissingRequiredEnvVar("BOND_AGGREGATOR_ADDRESS");
            }
        } else {
            // Testnet fallbacks
            if (uniswapV3Pool == address(0)) uniswapV3Pool = msg.sender;
            if (bondAggregator == address(0)) bondAggregator = msg.sender;
        }

        ERC20 shitToken = ERC20(shitTokenAddr);
        ERC20 azusdToken = ERC20(azusdTokenAddr);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== SHIT Fork: Kernel ===");

        // 1. Kernel — executor stays as deployer until end of deployment
        Kernel kernel = new Kernel();
        console2.log("Kernel:", address(kernel));

        // 2. TreasuryValuation — multisig-gated RFV/floor-price oracle
        TreasuryValuation treasuryPolicy = new TreasuryValuation(safe);
        console2.log("TreasuryValuation:", address(treasuryPolicy));

        console2.log("=== SHIT Fork: Oracle & Staking ===");

        // 3. ShitPriceFeed (Uniswap V3 TWAP)
        ShitPriceFeed priceFeed = new ShitPriceFeed(uniswapV3Pool, shitTokenAddr, address(treasuryPolicy), safe);
        console2.log("ShitPriceFeed:", address(priceFeed));

        // 4. ShitStaking (stSHIT)
        ShitStaking staking = new ShitStaking(shitTokenAddr, address(priceFeed), address(treasuryPolicy), safe);
        console2.log("ShitStaking (stSHIT):", address(staking));

        // 5. WstSHIT (non-rebasing wrapper)
        WstSHIT wstShit = new WstSHIT(address(staking));
        console2.log("WstSHIT:", address(wstShit));

        // 6. StakingAdapter — implements IStaking for SHIT Protocol Heart compatibility
        StakingAdapter stakingAdapter = new StakingAdapter(shitTokenAddr, address(staking), address(wstShit));
        console2.log("StakingAdapter:", address(stakingAdapter));

        console2.log("=== SHIT Fork: Bonding ===");

        // 7. ShitInverseBond — NAV-discount buyback that burns SHIT
        ShitInverseBond inverseBond = new ShitInverseBond(shitTokenAddr, azusdTokenAddr, treasury, safe);
        console2.log("ShitInverseBond:", address(inverseBond));

        // 8. ShitBondPricer — dynamic bond discount tied to treasury/RFV growth ratio
        ShitBondPricer bondPricer = new ShitBondPricer(address(treasuryPolicy), safe);
        console2.log("ShitBondPricer:", address(bondPricer));

        console2.log("=== SHIT Fork: SHIT Protocol V3 Modules ===");

        // 9. SHIT ProtocolRoles
        SHIT ProtocolRoles roles = new SHIT ProtocolRoles(kernel);
        kernel.executeAction(Actions.InstallModule, address(roles));
        console2.log("SHIT ProtocolRoles:", address(roles));

        // 10. SHIT ProtocolMinter
        SHIT ProtocolMinter minter = new SHIT ProtocolMinter(kernel, shitTokenAddr);
        kernel.executeAction(Actions.InstallModule, address(minter));
        console2.log("SHIT ProtocolMinter:", address(minter));

        // 11. SHIT ProtocolTreasury
        SHIT ProtocolTreasury shitTreasury = new SHIT ProtocolTreasury(kernel);
        kernel.executeAction(Actions.InstallModule, address(shitTreasury));
        console2.log("SHIT ProtocolTreasury:", address(shitTreasury));

        // 12. Wire TreasuryValuation to read reserve balances from SHIT ProtocolTreasury
        treasuryPolicy.setReserveTreasury(address(shitTreasury));
        console2.log("TreasuryValuation wired to SHIT ProtocolTreasury");

        // 13. ShitPrice (fork of SHIT ProtocolPrice with TWAP)
        ShitPrice shitPrice = new ShitPrice(
            kernel,
            address(priceFeed),
            8 hours,
            7 days,
            1e18,
            safe
        );
        kernel.executeAction(Actions.InstallModule, address(shitPrice));
        console2.log("ShitPrice:", address(shitPrice));

        // 14. SHIT ProtocolRange
        SHIT ProtocolRange range = new SHIT ProtocolRange(
            kernel,
            shitToken,
            azusdToken,
            5000,
            [uint256(200), uint256(600)],
            [uint256(200), uint256(600)]
        );
        kernel.executeAction(Actions.InstallModule, address(range));
        console2.log("SHIT ProtocolRange:", address(range));

        console2.log("=== SHIT Fork: SHIT Protocol V3 Policies ===");

        // 15. ShitDistributor (bridges Heart → ShitStaking.rebase)
        ShitDistributor distributor = new ShitDistributor(address(staking), address(stakingAdapter));
        console2.log("ShitDistributor:", address(distributor));

        // 16. SHIT ProtocolHeart
        SHIT ProtocolHeart heart = new SHIT ProtocolHeart(kernel, distributor, 1e18, 4 hours);
        kernel.executeAction(Actions.ActivatePolicy, address(heart));
        console2.log("SHIT ProtocolHeart:", address(heart));

        // 17. BondCallback
        BondCallback bondCallback = new BondCallback(kernel, IBondAggregator(bondAggregator), shitToken);
        kernel.executeAction(Actions.ActivatePolicy, address(bondCallback));
        console2.log("BondCallback:", address(bondCallback));

        // 18. Operator
        Operator operator = new Operator(
            kernel,
            IBondSDA(bondAggregator),
            IBondCallback(address(bondCallback)),
            [
                shitTokenAddr,
                azusdTokenAddr,
                address(0),
                address(0)
            ],
            [
                uint32(5000),
                uint32(3 days),
                uint32(15000),
                uint32(12 hours),
                uint32(5000),
                uint32(24 hours),
                uint32(3),
                uint32(5)
            ]
        );
        kernel.executeAction(Actions.ActivatePolicy, address(operator));
        console2.log("Operator:", address(operator));

        // 19. ShitDefenseBudget — per-epoch treasury spending cap wrapping Operator.operate()
        ShitDefenseBudget defenseBudget = new ShitDefenseBudget(
            kernel,
            address(operator),
            treasury,
            shitTokenAddr,
            safe
        );
        defenseBudget.updateLiquidTreasuryValue(1_000_000e18);
        kernel.executeAction(Actions.ActivatePolicy, address(defenseBudget));
        console2.log("ShitDefenseBudget:", address(defenseBudget));

        // 20. Register DefenseBudget as periodic task on Heart
        heart.addPeriodicTask(address(defenseBudget));
        console2.log("DefenseBudget registered as periodic task on Heart");

        // 21. Set authorized minter to SHIT ProtocolMinter
        if (safe == msg.sender) {
            // solmate ERC20 doesn't have setAuthorizedMinter, use ShitToken interface
            (bool success,) = shitTokenAddr.call(
                abi.encodeWithSignature("setAuthorizedMinter(address)", address(minter))
            );
            require(success, "setAuthorizedMinter failed");
        } else {
            console2.log("POST-DEPLOY REQUIRED: call shitToken.setAuthorizedMinter(minter) via Safe");
        }

        // 22. RolesAdmin
        RolesAdmin rolesAdmin = new RolesAdmin(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(rolesAdmin));
        console2.log("RolesAdmin:", address(rolesAdmin));

        // 23. Emergency
        Emergency emergency = new Emergency(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(emergency));
        console2.log("Emergency:", address(emergency));

        // 24. TreasuryCustodian
        TreasuryCustodian treasuryCustodian = new TreasuryCustodian(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(treasuryCustodian));
        console2.log("TreasuryCustodian:", address(treasuryCustodian));

        // 25. Grant roles via RolesAdmin
        rolesAdmin.grantRole("admin", safe);
        rolesAdmin.grantRole("emergency_shutdown", safe);
        rolesAdmin.grantRole("emergency_restart", safe);
        rolesAdmin.grantRole("custodian", safe);
        rolesAdmin.grantRole("operator_admin", safe);
        rolesAdmin.grantRole("operator_policy", safe);
        rolesAdmin.grantRole("operator_reporter", address(bondCallback));
        rolesAdmin.grantRole("heart", address(defenseBudget));
        console2.log("Roles granted via RolesAdmin");

        // 26. Transfer RolesAdmin admin to Safe
        rolesAdmin.pushNewAdmin(safe);
        if (safe != msg.sender) {
            console2.log("POST-DEPLOY REQUIRED: call rolesAdmin.pullNewAdmin() via Safe");
        } else {
            rolesAdmin.pullNewAdmin();
        }

        // 27. Transfer Kernel executor to Safe — must be last kernel action by deployer
        kernel.executeAction(Actions.ChangeExecutor, safe);
        console2.log("Kernel executor transferred to Safe");

        vm.stopBroadcast();

        console2.log("=== SHIT FORK DEPLOYMENT COMPLETE ===");
        console2.log("Governance (Safe):", safe);
    }
}
