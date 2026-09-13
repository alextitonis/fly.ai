"""
Yield routing, bribe harvesting, Pendle markets, and AMO detail simulation.

Models:
- Meta-vault adapters: StSHITAdapter (Morpho), BribeHarvestAdapter, CoolerLoanAdapter,
  ExternalLPAdapter, shitSwapLPAdapter
- Vote market bribes: Aerodrome, HiddenHand, Paladin, StakeDao, Votium, YBribe
- Pendle V2: StSHITSY yield tokenization (PT/YT markets)
- Stablecoin AMOs: shitLendingAMO (Morpho/Aave), shitUniswapV4AMO (V4 liquidity)

Contract sources:
- contracts/src/meta-vaults/StSHITAdapter.sol
- contracts/src/meta-vaults/BribeHarvestAdapter.sol
- contracts/src/votemarkets/*.sol
- contracts/src/yield/StSHITSY.sol
- contracts/src/stablecoin/shitLendingAMO.sol
- contracts/src/stablecoin/shitUniswapV4AMO.sol
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field

EPOCHS_PER_DAY = 3


@dataclass
class YieldRevenueParams:
    # Meta-vault adapter allocations (% of stSHIT)
    stshit_morpho_alloc_pct: float = 0.40  # 40% to Morpho
    stshit_cooler_alloc_pct: float = 0.20  # 20% to Cooler loans
    stshit_external_lp_alloc_pct: float = 0.20  # 20% to external LP
    stshit_shitswap_lp_alloc_pct: float = 0.15  # 15% to shitSwap LP
    stshit_idle_pct: float = 0.05  # 5% idle

    # Adapter yields (APY)
    morpho_apy: float = 0.08
    cooler_apy: float = 0.12
    external_lp_apy: float = 0.25
    shitswap_lp_apy: float = 0.30
    idle_apy: float = 0.0

    # Vote market bribes
    bribe_venues: int = 7  # Aerodrome, HiddenHand, Paladin, StakeDao, Votium, YBribe, VoteMarket
    pol_for_bribes: float = 0.0  # POL staked to gauges — starts at 0, grows from treasury
    base_bribe_apy: float = 0.35  # 35% APY on POL from bribes
    bribe_volatility: float = 0.15  # Bribe market volatility
    bribe_to_stakers_pct: float = 0.90  # 90% of bribes go to stakers, 10% to treasury

    # Pendle V2
    pendle_enabled: bool = True
    pendle_implied_apy_premium: float = 0.02  # PT trades at 2% below actual APY
    pendle_yt_notional: float = 0.0  # YT notional — starts at 0, grows with stSHIT supply
    pendle_volatility: float = 0.10

    # Stablecoin AMOs
    lending_amo_enabled: bool = True
    lending_amo_deployed: float = 0.0  # Bucky deployed to Morpho/Aave — starts at 0
    lending_amo_apy: float = 0.06
    lending_amo_hack_probability: float = 0.001  # Per-epoch hack probability

    v4_amo_enabled: bool = True
    v4_amo_deployed: float = 0.0  # Bucky deployed to V4 pool — starts at 0
    v4_amo_apy: float = 0.15
    v4_amo_il_risk: float = 0.02  # IL risk per epoch

    initial_stshit_supply: float = 0.0  # Derived from staking ratio * shit supply in protocol model
    num_epochs: int = 90
    random_seed: int = 42


def simulate_yield_revenue(params: YieldRevenueParams) -> pd.DataFrame:
    """
    Simulate yield routing through meta-vault adapters, bribe harvesting,
    Pendle markets, and stablecoin AMOs.
    """
    rng = np.random.default_rng(params.random_seed)
    records = []

    stshit_supply = params.initial_stshit_supply
    cumulative_bribes = 0.0
    cumulative_treasury_bribes = 0.0
    cumulative_staker_bribes = 0.0
    cumulative_adapter_yield = 0.0
    cumulative_amo_yield = 0.0
    cumulative_pendle_pnl = 0.0
    lending_amo_balance = params.lending_amo_deployed
    v4_amo_balance = params.v4_amo_deployed

    for epoch in range(params.num_epochs):
        # ─── Meta-vault adapter yields ───
        morpho_yield = stshit_supply * params.stshit_morpho_alloc_pct * params.morpho_apy / 365 / EPOCHS_PER_DAY
        cooler_yield = stshit_supply * params.stshit_cooler_alloc_pct * params.cooler_apy / 365 / EPOCHS_PER_DAY
        ext_lp_yield = stshit_supply * params.stshit_external_lp_alloc_pct * params.external_lp_apy / 365 / EPOCHS_PER_DAY
        rswap_lp_yield = stshit_supply * params.stshit_shitswap_lp_alloc_pct * params.shitswap_lp_apy / 365 / EPOCHS_PER_DAY
        idle_yield = stshit_supply * params.stshit_idle_pct * params.idle_apy / 365 / EPOCHS_PER_DAY

        total_adapter_yield = morpho_yield + cooler_yield + ext_lp_yield + rswap_lp_yield + idle_yield
        cumulative_adapter_yield += total_adapter_yield

        # stSHIT supply grows from yield reinvestment
        stshit_supply += total_adapter_yield * 0.5  # 50% reinvested

        # ─── Bribe harvesting ───
        bribe_rate = params.base_bribe_apy * (1 + rng.normal(0, params.bribe_volatility) * 0.1)
        bribe_rate = max(bribe_rate, 0.0)
        epoch_bribes = params.pol_for_bribes * bribe_rate / 365 / EPOCHS_PER_DAY
        cumulative_bribes += epoch_bribes

        staker_bribes = epoch_bribes * params.bribe_to_stakers_pct
        treasury_bribes = epoch_bribes * (1 - params.bribe_to_stakers_pct)
        cumulative_staker_bribes += staker_bribes
        cumulative_treasury_bribes += treasury_bribes

        # ─── Pendle V2 ───
        pendle_pnl = 0.0
        if params.pendle_enabled:
            # PT yield fixed, YT receives variable yield
            implied_apy = (params.morpho_apy + params.cooler_apy) / 2 - params.pendle_implied_apy_premium
            actual_apy = (params.morpho_apy + params.cooler_apy) / 2 + rng.normal(0, params.pendle_volatility) * 0.05
            # YT holders profit/loss from yield differential
            pendle_pnl = params.pendle_yt_notional * (actual_apy - implied_apy) / 365 / EPOCHS_PER_DAY
            cumulative_pendle_pnl += pendle_pnl

        # ─── Stablecoin AMOs ───
        amo_yield = 0.0
        lending_hack = False
        v4_il_loss = 0.0

        if params.lending_amo_enabled:
            lending_yield = lending_amo_balance * params.lending_amo_apy / 365 / EPOCHS_PER_DAY
            amo_yield += lending_yield

            # Hack risk
            if rng.random() < params.lending_amo_hack_probability:
                lending_hack = True
                hack_loss = lending_amo_balance * rng.uniform(0.10, 0.50)
                lending_amo_balance -= hack_loss
                amo_yield -= hack_loss

        if params.v4_amo_enabled:
            v4_yield = v4_amo_balance * params.v4_amo_apy / 365 / EPOCHS_PER_DAY
            v4_il = v4_amo_balance * params.v4_amo_il_risk * abs(rng.normal(0, 1)) / EPOCHS_PER_DAY
            v4_amo_balance -= v4_il
            v4_il_loss = v4_il
            amo_yield += v4_yield - v4_il

        cumulative_amo_yield += amo_yield

        records.append({
            'epoch': epoch,
            'day': epoch / EPOCHS_PER_DAY,
            'stshit_supply': stshit_supply,
            'morpho_yield': morpho_yield,
            'cooler_yield': cooler_yield,
            'ext_lp_yield': ext_lp_yield,
            'rswap_lp_yield': rswap_lp_yield,
            'total_adapter_yield': total_adapter_yield,
            'bribe_rate_apy': bribe_rate,
            'epoch_bribes': epoch_bribes,
            'staker_bribes': staker_bribes,
            'treasury_bribes': treasury_bribes,
            'cum_bribes': cumulative_bribes,
            'pendle_pnl': pendle_pnl,
            'cum_pendle_pnl': cumulative_pendle_pnl,
            'lending_amo_balance': lending_amo_balance,
            'v4_amo_balance': v4_amo_balance,
            'amo_yield': amo_yield,
            'lending_hack': lending_hack,
            'v4_il_loss': v4_il_loss,
            'cum_adapter_yield': cumulative_adapter_yield,
            'cum_amo_yield': cumulative_amo_yield,
            'cum_treasury_bribes': cumulative_treasury_bribes,
            'cum_staker_bribes': cumulative_staker_bribes,
        })

    return pd.DataFrame(records)


def yield_revenue_summary(df: pd.DataFrame) -> dict:
    return {
        'final_stshit': df['stshit_supply'].iloc[-1],
        'total_adapter_yield': df['cum_adapter_yield'].iloc[-1],
        'total_bribes': df['cum_bribes'].iloc[-1],
        'total_staker_bribes': df['cum_staker_bribes'].iloc[-1],
        'total_treasury_bribes': df['cum_treasury_bribes'].iloc[-1],
        'avg_bribe_apy': df['bribe_rate_apy'].mean(),
        'total_amo_yield': df['cum_amo_yield'].iloc[-1],
        'lending_hacks': df['lending_hack'].sum(),
        'total_v4_il': df['v4_il_loss'].sum(),
        'total_pendle_pnl': df['cum_pendle_pnl'].iloc[-1],
        'final_lending_amo': df['lending_amo_balance'].iloc[-1],
        'final_v4_amo': df['v4_amo_balance'].iloc[-1],
    }
