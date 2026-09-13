"""
SHIT protocol parameter mapping → OSS ModelParams.
Maps all SHIT Finance contract parameters to the SHIT Protocol/cadCAD ModelParams format.
~80 lines — pure configuration, no logic.
"""

import numpy as np

def get_shit_params():
    """Return ModelParams dict with all SHIT-specific parameter overrides."""
    return {
        # === STAKING (ShitStaking.sol) ===
        'rMax': 55,                       # 55 bps max supplemental per epoch
        'kBps': 14000,                    # 1.4x premium threshold
        'rebaseRateCapBps': 45,           # 45 bps (0.45%) cap per rebase (per whitepaper)
        'circuitBreakerThreshold': 21,    # 21 consecutive epochs below floor → trip
        'stakingRatioGateBps': 5000,      # 50% — no supplemental below this staking ratio
        'rfvInvariantMin': 0.90,          # 90% backing → proportional supplemental scaling
        'deploymentGracePeriod': 504,     # 7 days in 8h epochs (CB disabled during grace)

        # Rate limiter (ShitStaking.sol:397-409)
        'suppRateLimitWindow': 30,        # 30-epoch rolling window
        'suppRateLimitCapBps': 500,       # 5% max supplemental per window
        'suppWarmupEpochs': 30,           # 30-epoch warmup after deploy
        'navWarmupEpochs': 50,            # 50-epoch linear ramp for supplemental at launch

        # Reward smoothing buffer (ShitStaking.sol:412-449)
        'smoothingDivertBps': 3000,       # 30% divert to buffer during high premium
        'smoothingFloorBps': 10,          # 0.1% floor draw during low premium
        'smoothingBufferCapBps': 5000,    # 50% cap on buffer size

        # Circuit breaker auto-reset (ShitStaking.sol:314-355)
        'cbAutoReset': 21,                # 21 epochs stable → auto-reset (normal)
        'cbSoftResetThreshold': 7,        # 7 epochs stable → reset (after 60 epochs tripped)
        'cbSoftResetEpochs': 60,          # After 60 epochs tripped, use soft reset
        'cbForcedResetEpochs': 55,        # Forced reset after 55 epochs tripped
        'cbRecoveryEpochs': 21,            # 21 epochs (7 days) stable → auto-reset (matches contract)

        # === TREASURY (TreasuryValuation.sol) ===
        'assetHaircuts': {
            'MANUAL': 1.0,
            'ERC20': 0.95,
            'ERC4626': 0.90,
            'LP_TOKEN': 0.80,
        },
        'reserveTreasuryEnabled': True,

        # === BONDING (ShitInverseBond.sol + ShitBondPricer.sol) ===
        'inverseBondSpread': 150,         # 150 bps spread over NAV
        'inverseBondEpochLength': 8,      # 8 hours
        'inverseBondMaxCapacityBps': 100, # 100 bps (1%) max capacity per epoch — adjustable via multisig
        'bondPricerMinDiscount': 50,      # 50 bps min
        'bondPricerMaxDiscount': 1000,    # 1000 bps max
        'bondPricerFullBacking': 15000,   # 15000 bps (1.5x) → 0 discount

        # === STABLECOIN (Bucky.sol — DSS fork) ===
        'dssCollateralTypes': {
            'USDC': {'ilk': 'USDC', 'debtCeiling': 1e24, 'liquidationRatio': 1.0},
            'IMPACT': {'ilk': 'IMPACT', 'debtCeiling': 5e23, 'liquidationRatio': 1.5},
        },
        'osmDelay': 3600,
        'dutchAuctionStep': 0.01,

        # === CIRCUIT BREAKER (ShitCircuitBreaker.sol) ===
        'depegThreshold': 0.02,           # 2% deviation from $1.00
        'depegDeviationThresholdBps': 200, # 200 bps

        # === DEFENSE BUDGET (ShitDefenseBudget.sol) ===
        'defenseBudgetPct': 0.02,         # 2% of liquid treasury per epoch
        'defenseBudgetBps': 200,          # 200 bps
        'defenseEpochLength': 8,          # 8 hours

        # === PEG KEEPER (Curve PegKeeper) ===
        'pegKeeperTolerance': 0.005,
        'pegKeeperDelay': 600,
        'buckyShock': 0.0,                # Peg shock for stress scenarios

        # === FLOOR HOOK (Uniswap V4) ===
        'floorFeeSplit': 0.70,
        'floorBandSplit': 0.50,

        # === BAMM/PERP ===
        'bammMaxLeverage': 3.0,
        'perpFundingRate': 0.001,
        'partialLiquidationStep': 0.50,
        'maxLiquidationSteps': 2,

        # === FEE ROUTING ===
        'feeSplitTreasury': 0.60,
        'feeSplitStaking': 0.40,
        'burnRate': 0.10,

        # === YIELD (Pendle PY index) ===
        'wstShitWrapRatio': 1.0,
        'morphoAllocation': 0.40,
        'gammaAllocation': 0.30,
        'steerAllocation': 0.30,
        'morphoApy': 0.05,
        'gammaApy': 0.08,
        'steerApy': 0.06,
        'pendleInitialSyRate': 1.0,
        'pendleTotalPt': 5e6,
        'pendleTotalAsset': 5e6,
        'pendleRateScalar': 10.0,
        'pendleRateAnchor': 1.0,
        'pendleTimeToExpiry': 365 * 24 * 3600,

        # === BUCKY CDP (Liquity economic model) ===
        'buckyCollateralPrice': 2000.0,
        'buckyCollateralShock': 0.0,

        # === BUCKY STRESS (crvUSD risk model) ===
        'buckyInitialSupply': 1e6,
        'buckyInitialCollateral': 1.5e6,
        'buckyInitialLiquidity': 1e6,
        'stressCollateralShock': 0.0,
        'stressLiquidityShock': 0.0,

        # === MARKET STRUCTURE ===
        'lbpDuration': 14,
        'impactTokenAllocations': {
            'SLR': 0.25, 'TREE': 0.20, 'REGEN': 0.20,
            'DOVU': 0.15, 'KVCM': 0.20,
        },

        # === TOKEN ONBOARDING ===
        'onboardingTimelock': 2 * 24 * 3600,
        'onboardingExpiry': 14 * 24 * 3600,
        'onboardingMinLiquidity': 10000e18,

        # === SIMULATION ===
        'T': 365,
        'N': 1,
        'seed': 42,
    }
