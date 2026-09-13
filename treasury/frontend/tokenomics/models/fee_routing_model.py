"""
Fee routing, fee decay, and burner simulation.

Models:
- FeeSplitter: 50/50 split between treasury and staking rewards
- FeeDecaySplitter: 30-day linear decay from 80% mgmt / 20% treasury to 0% / 100%
- shitBurner: Burns SHIT sent to treasury (deflationary mechanism)

Contract sources:
- contracts/src/dex/FeeSplitter.sol
- contracts/src/dex/FeeDecaySplitter.sol
- contracts/src/treasury/shitBurner.sol
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field

BPS = 10000
SECONDS_PER_DAY = 86400
EPOCHS_PER_DAY = 3  # 8-hour epochs


@dataclass
class FeeRoutingParams:
    # FeeSplitter — DEX swap fees
    treasury_ratio_bps: int = 5000  # 50% to treasury
    staking_ratio_bps: int = 5000  # 50% to staking rewards
    daily_swap_fee_usdc: float = 5_000.0  # DEX fees generated per day (starts low, grows with activity)

    # FeeDecaySplitter — management fee with 30-day decay
    total_fee_bps: int = 5000       # 50% of hook fees go to FeeDecaySplitter
    initial_mgmt_bps: int = 4000    # 80% of total_fee = 4000/5000
    initial_treasury_bps: int = 1000  # 20% of total_fee = 1000/5000
    decay_duration_days: int = 30

    # shitBurner
    burn_enabled: bool = True
    burn_threshold_usdc: float = 10_000.0  # Burn SHIT when treasury holds > threshold
    burn_pct_per_epoch: float = 0.05  # Burn 5% of unwanted SHIT per epoch

    # Hook fees (floor hook redemption fees + swap fees)
    daily_hook_fee_usdc: float = 1_000.0

    num_epochs: int = 90


@dataclass
class FeeRoutingState:
    treasury_fee_accumulated: float = 0.0
    staking_fee_accumulated: float = 0.0
    management_fee_accumulated: float = 0.0
    treasury_from_decay_accumulated: float = 0.0
    shit_burned: float = 0.0
    total_fees_collected: float = 0.0


def compute_mgmt_bps(epoch: int, params: FeeRoutingParams) -> int:
    """Compute current management BPS based on 30-day linear decay."""
    days_elapsed = epoch / EPOCHS_PER_DAY
    if days_elapsed >= params.decay_duration_days:
        return 0
    elapsed_fraction = days_elapsed / params.decay_duration_days
    return int(params.initial_mgmt_bps * (1 - elapsed_fraction))


def simulate_fee_routing(params: FeeRoutingParams) -> pd.DataFrame:
    """
    Simulate fee routing through FeeSplitter, FeeDecaySplitter, and Burner.
    Returns DataFrame with per-epoch fee flows.
    """
    state = FeeRoutingState()
    records = []

    for epoch in range(params.num_epochs):
        # ─── FeeSplitter: DEX swap fees ───
        swap_fees = params.daily_swap_fee_usdc / EPOCHS_PER_DAY
        treasury_share = swap_fees * params.treasury_ratio_bps / BPS
        staking_share = swap_fees * params.staking_ratio_bps / BPS

        state.treasury_fee_accumulated += treasury_share
        state.staking_fee_accumulated += staking_share

        # ─── FeeDecaySplitter: Hook fees with management decay ───
        hook_fees = params.daily_hook_fee_usdc / EPOCHS_PER_DAY
        decay_pool = hook_fees * params.total_fee_bps / BPS  # Portion going to decay splitter

        mgmt_bps = compute_mgmt_bps(epoch, params)
        treasury_bps = params.total_fee_bps - mgmt_bps

        mgmt_amount = decay_pool * mgmt_bps / params.total_fee_bps
        treasury_decay_amount = decay_pool * treasury_bps / params.total_fee_bps

        state.management_fee_accumulated += mgmt_amount
        state.treasury_from_decay_accumulated += treasury_decay_amount

        # Remaining hook fees (not in decay splitter) go directly to treasury
        direct_treasury = hook_fees - decay_pool
        state.treasury_fee_accumulated += direct_treasury

        # ─── shitBurner ───
        shit_burned = 0.0
        if params.burn_enabled:
            # Burn a fraction of unwanted SHIT each epoch
            shit_burned = params.burn_pct_per_epoch * (params.daily_swap_fee_usdc / 10)  # Proxy
            state.shit_burned += shit_burned

        total_fees = swap_fees + hook_fees
        state.total_fees_collected += total_fees

        records.append({
            'epoch': epoch,
            'day': epoch / EPOCHS_PER_DAY,
            'swap_fees': swap_fees,
            'treasury_from_splitter': treasury_share,
            'staking_from_splitter': staking_share,
            'hook_fees': hook_fees,
            'management_fee': mgmt_amount,
            'treasury_from_decay': treasury_decay_amount,
            'direct_treasury': direct_treasury,
            'mgmt_bps': mgmt_bps,
            'shit_burned': shit_burned,
            'cumulative_treasury_fees': state.treasury_fee_accumulated + state.treasury_from_decay_accumulated,
            'cumulative_staking_fees': state.staking_fee_accumulated,
            'cumulative_management_fees': state.management_fee_accumulated,
            'cumulative_shit_burned': state.shit_burned,
            'total_fees_this_epoch': total_fees,
        })

    return pd.DataFrame(records)


def fee_routing_summary(df: pd.DataFrame) -> dict:
    """Extract summary stats from fee routing simulation."""
    return {
        'total_treasury_fees': df['cumulative_treasury_fees'].iloc[-1],
        'total_staking_fees': df['cumulative_staking_fees'].iloc[-1],
        'total_management_fees': df['cumulative_management_fees'].iloc[-1],
        'total_shit_burned': df['cumulative_shit_burned'].iloc[-1],
        'peak_mgmt_bps': df['mgmt_bps'].iloc[0],
        'final_mgmt_bps': df['mgmt_bps'].iloc[-1],
        'decay_complete_epoch': df.loc[df['mgmt_bps'] == 0, 'epoch'].min() if (df['mgmt_bps'] == 0).any() else -1,
    }
