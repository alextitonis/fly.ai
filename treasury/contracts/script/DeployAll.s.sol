// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

// Core
import {ShitToken} from "../src/ShitToken.sol";
import {ShitDeployer} from "../src/ShitDeployer.sol";
// Team vesting handled via Hedgey Finance (https://app.hedgey.finance/)
import {TokenRegistry} from "../src/TokenRegistry.sol";
import {TokenOnboardingManager} from "../src/TokenOnboardingManager.sol";
import {ImpactTokens} from "../src/ImpactTokens.sol";

// Kernel (SHIT Protocol V3)
import {Kernel, Actions} from "@shit-v3/Kernel.sol";
import {TreasuryValuation} from "../src/TreasuryValuation.sol";
// POL is manually handled — no custom POL contracts deployed

// Staking
import {WstSHIT} from "../src/wstSHIT.sol";
import {ShitStaking} from "../src/ShitStaking.sol";
import {StakingAdapter} from "../src/StakingAdapter.sol";

// Integrations with Aegis, Gamma, Pendle, Steer are handled via their frontends — no custom contracts deployed

// Bonding — Bond Protocol integration handled manually via Safe, no custom contracts
import {ShitInverseBond} from "../src/ShitInverseBond.sol";

// Treasury — burns handled manually via Safe

// Oracle
import {ShitPriceFeed} from "../src/ShitPriceFeed.sol";
import {StablecoinPriceFeed} from "../src/StablecoinPriceFeed.sol";

// System Safety
import {ShitCircuitBreaker} from "../src/ShitCircuitBreaker.sol";
import {ShitDefenseBudget} from "../src/ShitDefenseBudget.sol";
import {ShitBondPricer} from "../src/ShitBondPricer.sol";

// Stablecoin — Multi-collateral DSS-based PSM
import {FixedRateProvider} from "../src/FixedRateProvider.sol";
import {Vat} from "@dss/vat.sol";
import {Spotter} from "@dss/spot.sol";
import {Dog} from "@dss/dog.sol";
import {Bucky} from "../src/Bucky.sol";
import {DaiJoin} from "@dss/join.sol";
import {LinearDecrease} from "@dss/abaci.sol";
import {ShitCollateralManager} from "../src/ShitCollateralManager.sol";
import {ImpactOracleAdapter} from "../src/ImpactOracleAdapter.sol";

// Vaults — use Yearn V3 / Morpho V2 directly, no custom vault contracts

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

// Index — use Reserve Index DTFs / Set Protocol / Alvara directly, no custom index contracts
// Lending — use Morpho directly, no custom lending contracts
// Perps — use GMX V1 directly, no custom perp contracts
// Meta-Vaults — use Morpho Vault V2 directly, no custom meta-vault contracts

/// @title DeployAll
/// @notice Unified deployment of all SHIT Protocol contracts on Base
/// @dev Deploys every contract in the codebase in dependency order.
///      External protocol addresses (Uniswap V4, Bond Aggregator, Morpho, etc.)
///      are read from env vars with fallback to deployer address for testnet.
///      Admin = SAFE_MULTISIG_ADDRESS (use deployer EOA for testnet).
contract DeployAll is Script {
    /// @dev Base mainnet chain ID
    uint256 internal constant BASE_MAINNET = 8453;

    /// @dev Bond Protocol Aggregator on Base mainnet
    address internal constant BOND_AGGREGATOR_BASE = 0x007A6621A9997A633Cb1B757f2f7ffb51310704A;

    error MissingRequiredEnvVar(string name);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address safe = vm.envOr("SAFE_MULTISIG_ADDRESS", msg.sender);
        address treasury = vm.envOr("TREASURY_ADDRESS", safe);
        // External protocol addresses — fallback to deployer for testnet
        address bondAggregator = vm.envOr("BOND_AGGREGATOR_ADDRESS", BOND_AGGREGATOR_BASE);
        address uniswapV3Pool = vm.envOr("UNISWAP_V3_SHIT_POOL", address(0));

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

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== Phase 1: Core Tokens & Registry ===");

        // 1. ShitDeployer
        ShitDeployer deployer = new ShitDeployer();
        console2.log("ShitDeployer:", address(deployer));

        // 2. ShitToken (SHIT) — multisig-gated
        ShitToken shitToken = new ShitToken(safe);
        console2.log("ShitToken:", address(shitToken));

        // 3. stSHIT (ShitStaking) and WstSHIT deployed in Phase 3 after priceFeed/treasuryPolicy

        // 6. AZUSD — already deployed via azos.finance, reference via env var
        ERC20 azusdToken = ERC20(vm.envAddress("AZUSD_TOKEN"));
        console2.log("AZUSD (existing):", address(azusdToken));

        // 7. Bucky — DSS-based stablecoin (auth-gated mint/burn via wards)
        Bucky buckyToken = new Bucky("Bucky", "BUCKY", block.chainid);
        console2.log("Bucky:", address(buckyToken));

        // 9. FixedRateProvider (for PSM)
        FixedRateProvider rateProvider = new FixedRateProvider();
        console2.log("FixedRateProvider:", address(rateProvider));

        // 10. SHIT multisig is set in constructor — no role transfers needed

        // 11. TokenRegistry — deployer is initial admin, transfers to Safe after whitelisting
        TokenRegistry tokenRegistry = new TokenRegistry(msg.sender);
        console2.log("TokenRegistry:", address(tokenRegistry));

        // 12. TokenOnboardingManager
        TokenOnboardingManager onboardingManager = new TokenOnboardingManager(tokenRegistry, safe);
        console2.log("TokenOnboardingManager:", address(onboardingManager));

        // 13. Grant onboarding manager MANAGER_ROLE on registry
        tokenRegistry.grantRole(tokenRegistry.MANAGER_ROLE(), address(onboardingManager));

        // 14. Whitelist initial impact tokens (skip if not contracts on this chain)
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

        // 15. Transfer TokenRegistry admin to Safe
        tokenRegistry.grantRole(tokenRegistry.DEFAULT_ADMIN_ROLE(), safe);
        tokenRegistry.grantRole(tokenRegistry.MANAGER_ROLE(), safe);
        tokenRegistry.renounceRole(tokenRegistry.DEFAULT_ADMIN_ROLE(), msg.sender);
        tokenRegistry.renounceRole(tokenRegistry.MANAGER_ROLE(), msg.sender);

        console2.log("=== Phase 2: Kernel & Policies ===");

        // 16. Kernel (SHIT Protocol V3) — executor stays as deployer until end of deployment
        Kernel kernel = new Kernel();
        console2.log("Kernel:", address(kernel));

        // 17. TreasuryValuation — minimal RFV/floor-price oracle, multisig-gated
        TreasuryValuation treasuryPolicy = new TreasuryValuation(safe);
        console2.log("TreasuryValuation:", address(treasuryPolicy));
        // Multisig sets valuations via setValuations() post-deployment
        if (safe != msg.sender) {
            console2.log("POST-DEPLOY REQUIRED: call treasuryPolicy.setValuations() via Safe");
        }

        // 17b. Register FLYAI as treasury reserve asset (50% haircut for RFV)
        // FLYAI = fly.ai connectome token — the fly brain project we use for trading
        address flyai = vm.envOr("FLYAI_TOKEN_ADDRESS", address(0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C));
        if (flyai != address(0)) {
            // AssetType.RAW = 0 (raw ERC20 balance), haircutBps = 5000 (50%)
            // Only multisig can register — deployer skips on testnet
            if (safe == msg.sender) {
                treasuryPolicy.registerAsset(flyai, TreasuryValuation.AssetType.ERC20, address(0), 5000);
                console2.log("FLYAI registered as treasury asset (50% haircut):", flyai);
            } else {
                console2.log("POST-DEPLOY REQUIRED: register FLYAI via treasuryPolicy.registerAsset() via Safe");
            }
        }

        // 18. POL — manually handled, no custom contracts deployed


        console2.log("=== Phase 3: Oracle & Treasury ===");

        // 20. ShitPriceFeed (Uniswap V3 TWAP) — implements IPriceFeed + ITwapPriceFeed
        ShitPriceFeed priceFeed = new ShitPriceFeed(uniswapV3Pool, address(shitToken), address(treasuryPolicy), safe);
        console2.log("ShitPriceFeed:", address(priceFeed));

        // 20b. ShitStaking (stSHIT) — needs priceFeed and treasuryPolicy
        ShitStaking staking = new ShitStaking(
            address(shitToken),
            address(priceFeed),
            address(treasuryPolicy),
            safe
        );
        console2.log("ShitStaking (stSHIT):", address(staking));

        // 20c. WstSHIT (non-rebasing wrapper around stSHIT)
        WstSHIT wstShit = new WstSHIT(address(staking));
        console2.log("WstSHIT:", address(wstShit));

        // 20d. StakingAdapter — implements IStaking for SHIT Protocol Heart compatibility
        StakingAdapter stakingAdapter = new StakingAdapter(
            address(shitToken),
            address(staking),
            address(wstShit)
        );
        console2.log("StakingAdapter:", address(stakingAdapter));

        // Fee splitting — handled off-chain via Safe multisig, no custom contracts

        console2.log("=== Phase 4: Bonding ===");

        // ShitInverseBond is protocol-specific (NAV-discount buyback)
        ShitInverseBond inverseBond = new ShitInverseBond(address(shitToken), address(azusdToken), treasury, safe);
        console2.log("ShitInverseBond:", address(inverseBond));

        // Team vesting — handled via Hedgey Finance app (https://app.hedgey.finance/)
        // No on-chain deployment needed; team creates vesting plans through Hedgey's UI.


        console2.log("=== Phase 7: Stablecoin (Multi-Collateral DSS) ===");

        // Deploy DSS core
        Vat vat = new Vat();
        console2.log("Vat:", address(vat));

        Spotter spotter = new Spotter(address(vat));
        console2.log("Spotter:", address(spotter));

        Dog dog = new Dog(address(vat));
        console2.log("Dog:", address(dog));

        // Bucky mint/burn controlled by DSS via wards
        // Deployer is initial ward, authorize DaiJoin to mint/burn

        DaiJoin daiJoin = new DaiJoin(address(vat), address(buckyToken));
        console2.log("DaiJoin:", address(daiJoin));

        // Authorize DSS modules
        buckyToken.rely(address(daiJoin));
        vat.rely(address(daiJoin));
        vat.rely(address(spotter));
        vat.rely(address(dog));

        // Deploy abacus for liquidation pricing
        LinearDecrease abacus = new LinearDecrease();
        abacus.file("tau", 3600); // 1 hour linear decrease
        console2.log("LinearDecrease:", address(abacus));

        // Deploy ImpactOracleAdapter for impact token pricing
        ImpactOracleAdapter impactOracle = new ImpactOracleAdapter(safe);
        console2.log("ImpactOracleAdapter:", address(impactOracle));

        // Deploy multi-collateral manager
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

        // Register AZUSD as stablecoin collateral (100% ratio, PSM behavior)
        StablecoinPriceFeed stablecoinOracle = new StablecoinPriceFeed();
        collateralManager.addCollateral(
            address(azusdToken),    // AZUSD
            address(stablecoinOracle),  // Fixed $1 price for stablecoin
            1e27,                   // 100% ratio
            10_000_000 * 1e45,      // 10M debt ceiling [rad]
            true                    // isStablecoin (no liquidation)
        );
        console2.log("AZUSD collateral registered");

        // Register impact tokens as collateral (150% ratio, with liquidation)
        // Note: Each impact token needs its own Uni V3 pool configured in ImpactOracleAdapter
        // This is done post-deployment via impactOracle.addToken(token, pool, tokenIsToken1)
        console2.log("Impact token collateral registration: post-deployment via multisig");

        console2.log("=== Phase 7b: System Safety ===");

        // Global Bucky depeg circuit breaker
        ShitCircuitBreaker circuitBreaker = new ShitCircuitBreaker(safe);
        circuitBreaker.setBuckyToken(address(buckyToken));
        circuitBreaker.setPriceFeed(address(priceFeed));
        console2.log("ShitCircuitBreaker:", address(circuitBreaker));

        // RBS wall defense budget — deployed in Phase 8 after Kernel and Operator
        // Dynamic bond pricer (ties discount to treasury growth ratio)
        ShitBondPricer bondPricer = new ShitBondPricer(address(treasuryPolicy), safe);
        console2.log("ShitBondPricer:", address(bondPricer));

        console2.log("=== Phase 8: SHIT Protocol V3 Modules & Policies ===");

        // 40. Install SHIT Protocol modules into Kernel
        SHIT ProtocolRoles roles = new SHIT ProtocolRoles(kernel);
        kernel.executeAction(Actions.InstallModule, address(roles));
        console2.log("SHIT ProtocolRoles:", address(roles));

        SHIT ProtocolMinter minter = new SHIT ProtocolMinter(kernel, address(shitToken));
        kernel.executeAction(Actions.InstallModule, address(minter));
        console2.log("SHIT ProtocolMinter:", address(minter));

        SHIT ProtocolTreasury shitTreasury = new SHIT ProtocolTreasury(kernel);
        kernel.executeAction(Actions.InstallModule, address(shitTreasury));
        console2.log("SHIT ProtocolTreasury:", address(shitTreasury));

        // Wire TreasuryValuation to read reserve balances from SHIT ProtocolTreasury
        treasuryPolicy.setReserveTreasury(address(shitTreasury));
        console2.log("TreasuryValuation wired to SHIT ProtocolTreasury");

        // 40b. ShitPrice (fork of SHIT ProtocolPrice with TWAP)
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

        // 40c. SHIT ProtocolRange
        SHIT ProtocolRange range = new SHIT ProtocolRange(
            kernel,
            ERC20(address(shitToken)),
            azusdToken,
            5000,                  // thresholdFactor = 50%
            [uint256(200), uint256(600)],   // lowSpreads [cushion=2%, wall=6%]
            [uint256(200), uint256(600)]    // highSpreads [cushion=2%, wall=6%]
        );
        kernel.executeAction(Actions.InstallModule, address(range));
        console2.log("SHIT ProtocolRange:", address(range));

        // 40d. ShitDistributor (bridges Heart → ShitStaking.rebase)
        ShitDistributor distributor = new ShitDistributor(
            address(staking),      // ShitStaking address (deployed in Phase 2 or separately)
            address(stakingAdapter) // StakingAdapter implementing IStaking
        );
        console2.log("ShitDistributor:", address(distributor));

        // 40e. SHIT ProtocolHeart
        SHIT ProtocolHeart heart = new SHIT ProtocolHeart(
            kernel,
            distributor,
            1e18,                  // maxReward = 1 SHIT per beat
            4 hours                // auctionDuration
        );
        kernel.executeAction(Actions.ActivatePolicy, address(heart));
        console2.log("SHIT ProtocolHeart:", address(heart));

        // 40f. BondCallback
        BondCallback bondCallback = new BondCallback(
            kernel,
            IBondAggregator(bondAggregator),
            ERC20(address(shitToken))
        );
        kernel.executeAction(Actions.ActivatePolicy, address(bondCallback));
        console2.log("BondCallback:", address(bondCallback));

        // 40g. Operator
        Operator operator = new Operator(
            kernel,
            IBondSDA(bondAggregator),  // auctioneer = bond SDA
            IBondCallback(address(bondCallback)),
            [
                address(shitToken),    // shit
                address(azusdToken),    // reserve
                address(0),             // sReserve (no ERC4626 wrapper — use reserve directly)
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

        // 40h. ShitDefenseBudget — Kernel Policy + IPeriodicTask wrapping Operator.operate()
        //      with per-epoch treasury spending limits
        ShitDefenseBudget defenseBudget = new ShitDefenseBudget(
            kernel,
            address(operator),    // Operator — now available
            safe,                  // treasury
            address(shitToken),
            safe                   // multisig
        );
        defenseBudget.updateLiquidTreasuryValue(1_000_000e18); // Initial, update post-deployment
        kernel.executeAction(Actions.ActivatePolicy, address(defenseBudget));
        console2.log("ShitDefenseBudget:", address(defenseBudget));

        // 40i. Register DefenseBudget as periodic task on Heart and grant "heart" role
        //      The Heart calls execute() on each beat, which calls Operator.operate() with budget checks
        heart.addPeriodicTask(address(defenseBudget));
        console2.log("DefenseBudget registered as periodic task on Heart");

        // 40j. Set authorized minter to SHIT ProtocolMinter (for MINTR.mintShit calls)
        if (safe == msg.sender) {
            shitToken.setAuthorizedMinter(address(minter));
        } else {
            console2.log("POST-DEPLOY REQUIRED: call shitToken.setAuthorizedMinter(minter) via Safe");
        }

        // 40i. RolesAdmin — standard SHIT Protocol policy for granting/revoking roles
        RolesAdmin rolesAdmin = new RolesAdmin(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(rolesAdmin));
        console2.log("RolesAdmin:", address(rolesAdmin));

        // 40j. Emergency — standard SHIT Protocol emergency shutdown policy for MINTR/TRSRY
        Emergency emergency = new Emergency(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(emergency));
        console2.log("Emergency:", address(emergency));

        // 40k. TreasuryCustodian — standard SHIT Protocol treasury management policy
        TreasuryCustodian treasuryCustodian = new TreasuryCustodian(kernel);
        kernel.executeAction(Actions.ActivatePolicy, address(treasuryCustodian));
        console2.log("TreasuryCustodian:", address(treasuryCustodian));

        // 40l. Grant roles via RolesAdmin (deployer is admin during deployment)
        rolesAdmin.grantRole("admin", safe);
        rolesAdmin.grantRole("emergency_shutdown", safe);
        rolesAdmin.grantRole("emergency_restart", safe);
        rolesAdmin.grantRole("custodian", safe);
        rolesAdmin.grantRole("operator_admin", safe);
        rolesAdmin.grantRole("operator_policy", safe);
        rolesAdmin.grantRole("operator_reporter", address(bondCallback));
        rolesAdmin.grantRole("heart", address(defenseBudget));
        console2.log("Roles granted via RolesAdmin");

        // 40m. Transfer RolesAdmin admin to Safe
        rolesAdmin.pushNewAdmin(safe);
        if (safe != msg.sender) {
            console2.log("POST-DEPLOY REQUIRED: call rolesAdmin.pullNewAdmin() via Safe");
        } else {
            // Testnet mode: safe is deployer, but pushNewAdmin requires pull from new admin
            // Since deployer == safe, we can call pullNewAdmin directly
            rolesAdmin.pullNewAdmin();
        }

        // 40n. Transfer Kernel executor to Safe (multisig) — must be last kernel action by deployer
        kernel.executeAction(Actions.ChangeExecutor, safe);
        console2.log("Kernel executor transferred to Safe");

        // Index — use Reserve Index DTFs / Set Protocol / Alvara directly, no custom contracts deployed

        // Vaults — use Yearn V3 / Morpho V2 directly via their frontends
        // No custom vault contracts deployed

        console2.log("=== Phase 9: Perps ===");

        // Perps — use GMX V1 directly, no custom perp contracts deployed

        console2.log("=== Phase 10: Yield ===");

        // 46. StSHITSY — handled via Pendle frontend (https://app.pendle.finance/)
        // Meta-vaults — use Morpho Vault V2 directly via their frontend (https://app.morpho.org/)
        // Lending — use Morpho markets directly via their frontend
        // No custom meta-vault, adapter, or lending contracts deployed

        vm.stopBroadcast();

        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("Governance (Safe):", safe);
        console2.log("Treasury:", treasury);
    }
}
