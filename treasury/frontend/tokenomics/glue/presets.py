"""
Scenario presets — dict of param overrides for simulation runs.
Maps SHIT scenarios to actual SHIT Protocol/cadCAD ModelParams.
SHIT has strong defenses: circuit breaker, floor hook, defense budget, RBS.
Even in bad scenarios, price should decline but stabilize, not crash to zero.
Key: bid/ask factors are % of reserves deployed per epoch.
With 150M reserves and 100M supply at $1, 0.01 = 1.5M USD = 1.5M tokens (1.5% supply).
"""

BEAR_MARKET = {
    'T': 365,
    # SHIT Protocol demand/supply factors — bear = net selling pressure
    'demand_factor': 0.03,          # Lower buy demand
    'supply_factor': -0.05,         # Moderate sell pressure (reduced from -0.08)
    'panic_sell_on': False,
    'panic_param': 0.4,
    # RBS — SHIT defends with treasury, but controlled outflow
    'lower_wall': 0.15,
    'upper_wall': 0.15,
    'lower_cushion': 0.075,
    'upper_cushion': 0.075,
    'bid_factor': 0.015,            # 1.5% of reserves per epoch = ~2.25M USD defense
    'ask_factor': 0.008,            # 0.8% for ceiling
    'max_outflow_rate': 0.03,       # 3% max outflow — controlled defense
    'cushion_factor': 0.30,
    'liq_stables_safety_ratio': 0.8,
    'max_liq_ratio': 0.55,          # 55% of treasury in AMM (prevents weekly rebalance dump)
    # SHIT params
    'rMax': 55,
    'kBps': 14000,
    'rebaseRateCapBps': 45,  # Protocol hard cap: 0.45% max rebase per epoch
    'stakingRatioGateBps': 5000,
    'circuitBreakerThreshold': 21,
    'buckyShock': -0.01,
}

BULL_MARKET = {
    'T': 365,
    # SHIT Protocol demand/supply factors — bull = moderate buying, stable growth
    'demand_factor': 0.05,          # Moderate buy demand (not too high to avoid spike)
    'supply_factor': -0.02,         # Very low sell pressure
    'panic_sell_on': False,
    'panic_param': 0.4,
    # RBS — moderate bands for controlled growth
    'lower_wall': 0.12,
    'upper_wall': 0.12,
    'lower_cushion': 0.06,
    'upper_cushion': 0.06,
    'bid_factor': 0.010,            # 1% floor defense
    'ask_factor': 0.015,            # 1.5% ceiling — higher to control upward spikes
    'max_outflow_rate': 0.02,       # 2% max outflow
    'cushion_factor': 0.30,
    'max_liq_ratio': 0.55,          # 55% of treasury in AMM (prevents weekly rebalance dump)
    # SHIT params — conservative emissions for sustainable growth
    # kBps must be >= 10000 (1.0x NAV) since it represents the price/NAV ratio
    # at which supplemental emissions reach maximum (r_max). A value below
    # 10000 would make premium_bps >= k_bps always true whenever price > NAV,
    # instantly maxing out emissions and causing unrealistic vertical spikes.
    'rMax': 35,
    'kBps': 12000,
    'rebaseRateCapBps': 45,  # Protocol hard cap: 0.45% max rebase per epoch
    'stakingRatioGateBps': 5000,
    'circuitBreakerThreshold': 21,
    'buckyShock': 0.01,
}

STRESS_TEST = {
    'T': 90,
    # SHIT Protocol — extreme sell pressure + panic
    'demand_factor': 0.02,          # Very low demand
    'supply_factor': -0.07,         # Heavy selling (reduced from -0.10)
    'panic_sell_on': True,          # Panic sell triggered
    'panic_param': 0.4,             # Moderate panic (reduced from 0.5)
    # RBS — SHIT deploys strong defense but controlled
    'lower_wall': 0.20,
    'upper_wall': 0.20,
    'lower_cushion': 0.10,
    'upper_cushion': 0.10,
    'bid_factor': 0.020,            # 2% of reserves per epoch = ~3M USD defense
    'ask_factor': 0.005,            # Minimal ask (don't sell into crash)
    'max_outflow_rate': 0.03,       # 3% max outflow — controlled defense
    'cushion_factor': 0.35,         # Larger cushions
    'liq_stables_safety_ratio': 0.9,
    'max_liq_ratio': 0.55,          # 55% of treasury in AMM
    # SHIT params — tight circuit breaker
    'rMax': 55,
    'kBps': 14000,
    'rebaseRateCapBps': 45,  # Protocol hard cap: 0.45% max rebase per epoch
    'stakingRatioGateBps': 5000,
    'circuitBreakerThreshold': 10,
    'depegThreshold': 0.015,
    'defenseBudgetPct': 0.01,
    'suppRateLimitCapBps': 200,
    'buckyShock': -0.05,
    'buckyCollateralShock': -0.15,
    'stressCollateralShock': -0.20,
    'stressLiquidityShock': -0.30,
}

DEPEG_SCENARIO = {
    'T': 30,
    # SHIT Protocol — moderate pressure but short timeframe
    'demand_factor': 0.05,
    'supply_factor': -0.06,
    'panic_sell_on': False,
    # RBS — strong defense
    'lower_wall': 0.15,
    'upper_wall': 0.15,
    'bid_factor': 0.015,
    'ask_factor': 0.008,
    'max_outflow_rate': 0.03,
    'max_liq_ratio': 0.55,
    # SHIT params — stablecoin focus
    'depegThreshold': 0.02,
    'circuitBreakerThreshold': 15,
    'defenseBudgetPct': 0.05,
    'buckyShock': -0.03,
    'buckyCollateralShock': -0.10,
    'stressCollateralShock': -0.15,
}

GOVERNANCE_ATTACK = {
    'T': 60,
    # SHIT Protocol — moderate market conditions, attack is governance-level
    'demand_factor': 0.05,
    'supply_factor': -0.05,
    'panic_sell_on': False,
    # RBS — normal defense
    'lower_wall': 0.15,
    'upper_wall': 0.15,
    'bid_factor': 0.012,
    'ask_factor': 0.008,
    'max_outflow_rate': 0.025,
    'max_liq_ratio': 0.55,
    # SHIT params — governance vulnerability
    'onboardingMinLiquidity': 1000e18,
    'defenseBudgetPct': 0.001,
    'suppRateLimitCapBps': 1000,
    'circuitBreakerThreshold': 21,
}

PRESETS = {
    'bear': BEAR_MARKET,
    'bull': BULL_MARKET,
    'stress': STRESS_TEST,
    'depeg': DEPEG_SCENARIO,
    'governance_attack': GOVERNANCE_ATTACK,
}
