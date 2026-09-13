// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

// Core tokens (already deployed in Phase 1)
import {ShitToken} from "../src/ShitToken.sol";
import {Bucky} from "../src/Bucky.sol";

// Kernel (SHIT Protocol V3)
import {Kernel, Actions} from "@shit-v3/Kernel.sol";
import {TreasuryValuation} from "../src/TreasuryValuation.sol";

// Staking
import {WstSHIT} from "../src/wstSHIT.sol";
import {ShitStaking} from "../src/ShitStaking.sol";
import {StakingAdapter} from "../src/StakingAdapter.sol";

// Bonding
import {ShitInverseBond} from "../src/ShitInverseBond.sol";

// Oracle
import {ShitPriceFeed} from "../src/ShitPriceFeed.sol";
import {StablecoinPriceFeed} from "../src/StablecoinPriceFeed.sol";

// System Safety
import {ShitCircuitBreaker} from "../src/ShitCircuitBreaker.sol";
import {ShitDefenseBudget} from "../src/ShitDefenseBudget.sol";
import {ShitBondPricer} from "../src/ShitBondPricer.sol";

// Stablecoin - Multi-collateral DSS
import {FixedRateProvider} from "../src/FixedRateProvider.sol";
import {Vat} from "@dss/vat.sol";
import {Spotter} from "@dss/spot.sol";
import {Dog} from "@dss/dog.sol";
import {DaiJoin} from "@dss/join.sol";
import {LinearDecrease} from "@dss/abaci.sol";
import {ShitCollateralManager} from "../src/ShitCollateralManager.sol";
import {ImpactOracleAdapter} from "../src/ImpactOracleAdapter.sol";

// SHIT Protocol V3 Modules & Policies
import {SHIT ProtocolRoles} from "@shit-v3/modules/ROLES/SHIT ProtocolRoles.sol";
import {SHIT ProtocolMinter} from "@shit-v3/modules/MINTR/SHIT ProtocolMinter.sol";
import {SHIT ProtocolTreasury} from "@shit-v3/modules/TRSRY/SHIT ProtocolTreasury.sol";
import {SHIT ProtocolRange} from "@shit-v3/modules/RANGE/SHIT ProtocolRange.sol";
import {ShitPrice} from "../src/ShitPrice.sol";
import {ShitDistributor} from "../src/ShitDistributor.sol";
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

/// @title DeployShitPhase2
/// @notice Phase 2 - deploy SHIT Protocol V3 fork, staking, oracle, DSS stablecoin, and system safety.
/// @dev Requires Phase 1 (DeployShitToken) to be complete. Reads deployed token addresses from env.
///      On Base mainnet (chain ID 8453), requires non-zero UNISWAP_V3_SHIT_POOL and BOND_AGGREGATOR_ADDRESS.
contract DeployShitPhase2 is Script {
    /// @dev Base mainnet chain ID
    uint256 internal constant BASE_MAINNET = 8453;

    /// @dev Bond Protocol Aggregator on Base mainnet
    address internal constant BOND_AGGREGATOR_BASE = 0x007A6621A9997A633Cb1B757f2f7ffb51310704A;

    error MissingRequiredEnvVar(string name);
    error ZeroAddressDetected(string name);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address safe = vm.envOr("SAFE_MULTISIG_ADDRESS", msg.sender);
        address treasury = vm.envOr("TREASURY_ADDRESS", safe);

        // Read Phase 1 deployed addresses
        address shitTokenAddr = vm.envAddress("SHIT_TOKEN_ADDRESS");
        if (shitTokenAddr == address(0)) revert MissingRequiredEnvVar("SHIT_TOKEN_ADDRESS");
        address buckyTokenAddr = vm.envAddress("BUCKY_TOKEN_ADDRESS");
        if (buckyTokenAddr == address(0)) revert MissingRequiredEnvVar("BUCKY_TOKEN_ADDRESS");

        // External protocol addresses
        address azusdTokenAddr = vm.envAddress("AZUSD_TOKEN");
        if (azusdTokenAddr == address(0)) revert MissingRequiredEnvVar("AZUSD_TOKEN");

        // On Base mainnet, require real Uniswap pool and Bond aggregator
        address uniswapV3Pool = vm.envOr("UNISWAP_V3_SHIT_POOL", address(0));
        address bondAggregator = vm.envOr("BOND_AGGREGATOR_ADDRESS", BOND_AGGREGATOR_BASE);

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
        Bucky buckyToken = Bucky(buckyTokenAddr);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== Phase 2: Kernel & Treasury ===");

        // 1. Kernel - executor stays as deployer until end of deployment
        Kernel kernel = new Kernel();
        console2.log("Kernel:", address(kernel));

        // 2. TreasuryValuation - multisig-gated RFV/floor-price oracle
        TreasuryValuation treasuryPolicy = new TreasuryValuation(safe);
        console2.log("TreasuryValuation:", address(treasuryPolicy));

        console2.log("=== Phase 2: Oracle & Staking ===");

        // 3. ShitPriceFeed (Uniswap V3 TWAP)
        ShitPriceFeed priceFeed = new ShitPriceFeed(uniswapV3Pool, shitTokenAddr, address(treasuryPolicy), safe);
        console2.log("ShitPriceFeed:", address(priceFeed));

        // 4. ShitStaking (stSHIT)
        ShitStaking staking = new ShitStaking(shitTokenAddr, address(priceFeed), address(treasuryPolicy), safe);
        console2.log("ShitStaking (stSHIT):", address(staking));

        // 5. WstSHIT (non-rebasing wrapper)
        WstSHIT wstShit = new WstSHIT(address(staking));
        console2.log("WstSHIT:", address(wstShit));

        // 6. StakingAdapter - implements IStaking for SHIT Protocol Heart compatibility
        StakingAdapter stakingAdapter = new StakingAdapter(shitTokenAddr, address(staking), address(wstShit));
        console2.log("StakingAdapter:", address(stakingAdapter));

        console2.log("=== Phase 2: Bonding ===");

        // 7. ShitInverseBond - NAV-discount buyback that burns SHIT
        ShitInverseBond inverseBond = new ShitInverseBond(shitTokenAddr, azusdTokenAddr, treasury, safe);
        console2.log("ShitInverseBond:", address(inverseBond));

        // 8. ShitBondPricer - dynamic bond discount tied to treasury/RFV growth ratio
        ShitBondPricer bondPricer = new ShitBondPricer(address(treasuryPolicy), safe);
        console2.log("ShitBondPricer:", address(bondPricer));

        console2.log("=== Phase 2: Stablecoin (Multi-Collateral DSS) ===");

        // 9. DSS core
        Vat vat = new Vat();
        console2.log("Vat:", address(vat));

        Spotter spotter = new Spotter(address(vat));
        console2.log("Spotter:", address(spotter));

        Dog dog = new Dog(address(vat));
        console2.log("Dog:", address(dog));

        DaiJoin daiJoin = new DaiJoin(address(vat), address(buckyToken));
        console2.log("DaiJoin:", address(daiJoin));

        // Authorize DSS modules
        buckyToken.rely(address(daiJoin));
        vat.rely(address(daiJoin));
        vat.rely(address(spotter));
        vat.rely(address(dog));

        // 10. Abacus for liquidation pricing
        LinearDecrease abacus = new LinearDecrease();
        abacus.file("tau", 3600); // 1 hour linear decrease
        console2.log("LinearDecrease:", address(abacus));

        // 11. ImpactOracleAdapter for impact token pricing
        ImpactOracleAdapter impactOracle = new ImpactOracleAdapter(safe);
        console2.log("ImpactOracleAdapter:", address(impactOracle));

        // 11b. Register AZUSD on ImpactOracleAdapter for real price (not fixed $1)
        address azusdPool = vm.envOr("AZUSD_UNI_V3_POOL", address(0));
        if (azusdPool != address(0)) {
            impactOracle.addToken(azusdTokenAddr, azusdPool, false);
            console2.log("AZUSD registered on ImpactOracleAdapter");
        } else {
            console2.log("WARNING: AZUSD_UNI_V3_POOL not set - register AZUSD on ImpactOracleAdapter post-deploy");
        }

        // 11c. Register Bucky on ImpactOracleAdapter for CircuitBreaker peg monitoring
        address buckyPool = vm.envOr("BUCKY_UNI_V3_POOL", address(0));
        if (buckyPool != address(0)) {
            impactOracle.addToken(buckyTokenAddr, buckyPool, false);
            console2.log("Bucky registered on ImpactOracleAdapter");
        } else {
            console2.log("WARNING: BUCKY_UNI_V3_POOL not set - register Bucky on ImpactOracleAdapter post-deploy");
        }

        // 12. Multi-collateral manager
        ShitCollateralManager collateralManager = new ShitCollateralManager(
            address(vat),
            address(spotter),
            address(dog),
            address(daiJoin),
            address(buckyToken),
            safe,           // vow (surplus/auction destination)
            address(abacus),
            safe            // admin
        );
        console2.log("ShitCollateralManager:", address(collateralManager));

        // Authorize manager in DSS
        vat.rely(address(collateralManager));
        spotter.rely(address(collateralManager));

        // 13. Register AZUSD as stablecoin collateral (100% ratio, PSM behavior)
        StablecoinPriceFeed stablecoinOracle = new StablecoinPriceFeed();
        collateralManager.addCollateral(
            address(azusdToken),        // AZUSD
            address(stablecoinOracle),  // Fixed $1 price for stablecoin
            1e27,                       // 100% ratio
            10_000_000 * 1e45,          // 10M debt ceiling [rad]
            true                        // isStablecoin (no liquidation)
        );
        console2.log("AZUSD collateral registered");

        console2.log("=== Phase 2: System Safety ===");

        // 14. Global Bucky depeg circuit breaker
        ShitCircuitBreaker circuitBreaker = new ShitCircuitBreaker(safe);
        circuitBreaker.setBuckyToken(address(buckyToken));
        circuitBreaker.setPriceFeed(address(impactOracle));
        console2.log("ShitCircuitBreaker:", address(circuitBreaker));

        console2.log("=== Phase 2: SHIT Protocol V3 Modules ===");

        // 15. Install SHIT Protocol modules into Kernel
        SHIT ProtocolRoles roles = new SHIT ProtocolRoles(kernel);
        kernel.executeAction(Actions.InstallModule, address(roles));
        console2.log("SHIT ProtocolRoles:", address(roles));

        SHIT ProtocolMinter minter = new SHIT ProtocolMinter(kernel, shitTokenAddr);
        kernel.executeAction(Actions.InstallModule, address(minter));
        console2.log("SHIT ProtocolMinter:", address(minter));

        SHIT ProtocolTreasury shitTreasury = new SHIT ProtocolTreasury(kernel);
        kernel.executeAction(Actions.InstallModule, address(shitTreasury));
        console2.log("SHIT ProtocolTreasury:", address(shitTreasury));

        // Wire TreasuryValuation to read reserve balances from SHIT ProtocolTreasury
        treasuryPolicy.setReserveTreasury(address(shitTreasury));
        console2.log("TreasuryValuation wired to SHIT ProtocolTreasury");

        // 16. ShitPrice (fork of SHIT ProtocolPrice with TWAP)
        ShitPrice shitPrice = new ShitPrice(
            kernel,
            address(priceFeed),
            8 hours,               // observationFrequency = staking epoch length
            7 days,                // movingAverageDuration = 7 days
            1e18,                  // minimumTargetPrice = 1.0 SHIT
            safe                   // multisig
        );
        kernel.executeAction(Actions.InstallModule, address(shitPrice));
        console2.log("ShitPrice:", address(shitPrice));

        // 17. SHIT ProtocolRange
        SHIT ProtocolRange range = new SHIT ProtocolRange(
            kernel,
            shitToken,
            azusdToken,
            5000,                  // thresholdFactor = 50%
            [uint256(200), uint256(600)],   // lowSpreads [cushion=2%, wall=6%]
            [uint256(200), uint256(600)]    // highSpreads [cushion=2%, wall=6%]
        );
        kernel.executeAction(Actions.InstallModule, address(range));
        console2.log("SHIT ProtocolRange:", address(range));

        console2.log("=== Phase 2: SHIT Protocol V3 Policies ===");

        // 18. ShitDistributor (bridges Heart -> ShitStaking.rebase)
        ShitDistributor distributor = new ShitDistributor(address(staking), address(stakingAdapter));
        console2.log("ShitDistributor:", address(distributor));

        // 19. SHIT ProtocolHeart
        SHIT ProtocolHeart heart = new SHIT ProtocolHeart(kernel, distributor, 1e18, 4 hours);
        kernel.executeAction(Actions.ActivatePolicy, address(heart));
        console2.log("SHIT ProtocolHeart:", address(heart));

        // 20. BondCallback
        BondCallback bondCallback = new BondCallback(kernel, IBondAggregator(bondAggregator), shitToken);
        kernel.executeAction(Actions.ActivatePolicy, address(bondCallback));
        console2.log("BondCallback:", address(bondCallback));

        // 21. Operator
        Operator operator = new Operator(
            kernel,
            IBondSDA(bondAggregator),
            IBondCallback(address(bondCallback)),
            [
                shitTokenAddr,
                azusdTokenAddr,
                address(0),             // sReserve (no ERC4626 wrapper)
                address(0)              // oldReserve (none)
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
        kernel.executeAction(Actions.ActivatePolicy, address(operator));
        console2.log("Operator:", address(operator));

        // 22. ShitDefenseBudget - per-epoch treasury spending cap wrapping Operator.operate()
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

        // 23. Register DefenseBudget as periodic task on Heart
        heart.addPeriodicTask(address(defenseBudget));
        console2.log("DefenseBudget registered as periodic task on Heart");

        // 24. Set authorized minter to SHIT ProtocolMinter
        if (safe == msg.sender) {
            ShitToken(shitTokenAddr).setAuthorizedMinter(address(minter));
        } else {
            console2.log("POST-DEPLOY REQUIRED: call shitToken.setAuthorizedMinter(minter) via Safe");
        }

        // 25. RolesAdmin
        RolesAdmin rolesAdmin = new RolesAdmin(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(rolesAdmin));
        console2.log("RolesAdmin:", address(rolesAdmin));

        // 26. Emergency
        Emergency emergency = new Emergency(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(emergency));
        console2.log("Emergency:", address(emergency));

        // 27. TreasuryCustodian
        TreasuryCustodian treasuryCustodian = new TreasuryCustodian(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(treasuryCustodian));
        console2.log("TreasuryCustodian:", address(treasuryCustodian));

        // 28. Grant roles via RolesAdmin
        rolesAdmin.grantRole("admin", safe);
        rolesAdmin.grantRole("emergency_shutdown", safe);
        rolesAdmin.grantRole("emergency_restart", safe);
        rolesAdmin.grantRole("custodian", safe);
        rolesAdmin.grantRole("operator_admin", safe);
        rolesAdmin.grantRole("operator_policy", safe);
        rolesAdmin.grantRole("operator_reporter", address(bondCallback));
        rolesAdmin.grantRole("heart", address(defenseBudget));
        console2.log("Roles granted via RolesAdmin");

        // 29. Transfer RolesAdmin admin to Safe
        rolesAdmin.pushNewAdmin(safe);
        if (safe != msg.sender) {
            console2.log("POST-DEPLOY REQUIRED: call rolesAdmin.pullNewAdmin() via Safe");
        } else {
            rolesAdmin.pullNewAdmin();
        }

        // 30. Transfer Kernel executor to Safe - must be last kernel action by deployer
        kernel.executeAction(Actions.ChangeExecutor, safe);
        console2.log("Kernel executor transferred to Safe");

        vm.stopBroadcast();

        console2.log("=== PHASE 2 COMPLETE ===");
        console2.log("Governance (Safe):", safe);
        console2.log("Treasury:", treasury);
        console2.log("");
        console2.log("POST-DEPLOY CHECKLIST (via Safe multisig):");
        if (safe != msg.sender) {
            console2.log("  1. call shitToken.setAuthorizedMinter(address(minter))");
            console2.log("  2. call rolesAdmin.pullNewAdmin()");
        }
        console2.log("  3. call treasuryPolicy.setValuations(rfv, nav, shitSupply)");
        console2.log("  4. call impactOracle.addToken(token, pool, tokenIsToken1) for each impact token");
        console2.log("  5. Initialize ShitPrice with start observations via Heart beat");
        console2.log("  6. Run: npx ts-node scripts/setup-gelato-tasks.ts");
        console2.log("  7. Set bond duration via operator.setCushionParams(duration, debtBuffer, depositInterval)");
    }
}
