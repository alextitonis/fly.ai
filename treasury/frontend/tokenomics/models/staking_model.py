"""
Staking & Rebasing Model for SHIT Protocol (SHIT)

Mirrors the logic in contracts/src/staking/ShitStaking.sol:
- 8-hour epochs, rebasing stSHIT
- Base yield from POL fees / harvest
- Supplemental emissions when TWAP > NAV (scaled by R_MAX and K_BPS)
- Circuit breaker: 21 consecutive epochs (7 days) below floor → halt supplemental emissions
- 7-day deployment grace period (no circuit breaker during first 21 epochs)
- Auto-reset after 21 consecutive epochs (7 days) above floor
- RFV invariant check on supplemental mint

All parameters are configurable for Streamlit dashboard sliders.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional

# ─── Contract Constants (from ShitStaking.sol) ───
EPOCH_LENGTH = 8 * 3600  # 8 hours in seconds
R_MAX = 55               # 0.55% max rebase per epoch (in bps)
K_BPS = 17500            # 1.75x supplemental emission multiplier
BPS_DENOMINATOR = 10000
CIRCUIT_BREAKER_THRESHOLD = 21   # 7 days at 3 epochs/day
CIRCUIT_BREAKER_AUTO_RESET = 21  # Auto-reset after 7 days above floor
DEPLOYMENT_GRACE_PERIOD_EPOCHS = 21  # 7 days grace period after deployment
PARAM_TIMELOCK = 2 * 24 * 3600  # 2 days
EPOCHS_PER_DAY = 3


@dataclass
class StakingParams:
    """Configurable parameters for staking simulation."""
    # Core staking params
    r_max: float = R_MAX                    # Max rebase rate in bps (0.55% = 55)
    k_bps: float = 14000                    # Supplemental emission threshold (14000 = 1.4x NAV, 40% premium)
    epoch_length_hours: float = 8.0
    circuit_breaker_threshold: int = CIRCUIT_BREAKER_THRESHOLD
    circuit_breaker_auto_reset: int = CIRCUIT_BREAKER_AUTO_RESET
    deployment_grace_epochs: int = DEPLOYMENT_GRACE_PERIOD_EPOCHS

    # Initial conditions
    initial_shit_supply: float = 1_000_000.0   # SHIT in circulation
    initial_staking_ratio: float = 0.65          # % of SHIT staked
    initial_staking_index: float = 1.0           # stSHIT index (1e18 precision)

    # Yield params
    base_yield_per_epoch_bps: float = 40.0       # POL yield per epoch in bps (0.4% — matches SHIT Protocol sustained rate of ~7,457% APY)
    reward_rate_bps: float = 0.0                 # Additional reward rate (governed, timelocked)

    # Market params
    initial_price: float = 10.0                  # SHIT price in USD
    initial_nav_per_shit: float = 0.0           # NAV per SHIT — starts at 0, grows from treasury
    initial_floor_price: float = 0.0             # Floor price per SHIT — starts at 0, grows from treasury

    # Simulation
    num_epochs: int = 90                         # 30 days = 90 epochs
    price_volatility: float = 0.05               # Per-epoch price volatility
    price_drift: float = 0.0                     # Per-epoch price drift
    random_seed: Optional[int] = 42

    # Staking flow params
    stake_elasticity: float = 3.0                # How responsive staking is to APY (higher → closer to SHIT Protocol's 93% staking ratio)
    unstake_threshold_bps: float = -200.0        # Rebase bps that triggers unstaking

    # Price mean-reversion (floor hook + inverse bond provide buy support)
    price_mean_reversion_strength: float = 0.10  # Pull toward NAV per epoch (10% of gap closed — floor hook + inverse bond)
    price_reversion_target: str = 'nav'          # 'nav' or 'floor' — target for reversion


@dataclass
class StakingState:
    """Mutable state during simulation."""
    shit_supply: float
    st_shit_supply: float
    staking_index: float
    staking_ratio: float
    twap_price: float
    nav_per_shit: float
    floor_price: float
    circuit_breaker_count: int = 0
    circuit_breaker_tripped: bool = False
    circuit_breaker_recovery_count: int = 0
    circuit_breaker_trip_epoch: int = 0
    epoch: int = 0
    total_supplemental_minted: float = 0.0
    total_base_yield_distributed: float = 0.0
    total_rebase_minted: float = 0.0
    rebase_rate_bps: float = 0.0
    supplemental_mint: float = 0.0
    base_yield: float = 0.0
    rfv: float = 0.0
    staking_apy: float = 0.0
    supplemental_window_minted: float = 0.0  # Cumulative supplemental mint in current 30-epoch window
    supplemental_window_start: int = 0      # Epoch when current window started


def simulate_staking(params: StakingParams) -> pd.DataFrame:
    """
    Run the staking simulation and return a DataFrame with per-epoch results.

    Implements the rebase() logic from ShitStaking.sol:
    1. Compute base yield from contract SHIT balance (POL fees + harvest)
    2. Check circuit breaker conditions
    3. If TWAP > NAV and circuit breaker not tripped, compute supplemental emissions
    4. Update staking index
    5. Model staker behavior (stake/unstake flows)
    """
    rng = np.random.default_rng(params.random_seed)

    state = StakingState(
        shit_supply=params.initial_shit_supply,
        st_shit_supply=params.initial_shit_supply * params.initial_staking_ratio,
        staking_index=params.initial_staking_index,
        staking_ratio=params.initial_staking_ratio,
        twap_price=params.initial_price,
        nav_per_shit=params.initial_nav_per_shit,
        floor_price=params.initial_floor_price,
        rfv=params.initial_floor_price * params.initial_shit_supply,
    )

    records = []

    for epoch in range(params.num_epochs):
        state.epoch = epoch

        # ─── 1. Update price (exogenous GBM + mean-reversion from floor hook buy pressure) ───
        returns = rng.normal(
            params.price_drift,
            params.price_volatility
        )
        state.twap_price *= (1 + returns)

        # Mean-reversion: floor hook absorbs sells, inverse bond provides buyback
        # This pulls price toward NAV over time (floor hook + inverse bond = natural buy support)
        reversion_target = state.nav_per_shit if params.price_reversion_target == 'nav' else state.floor_price
        if reversion_target > 0:
            gap = reversion_target - state.twap_price
            state.twap_price += gap * params.price_mean_reversion_strength

        state.twap_price = max(state.twap_price, 0.01)

        # Update NAV and floor (would come from treasury model in integrated sim)
        # NAV grows slowly from yield, floor = RFV / supply
        nav_growth = 0.001  # 0.1% per epoch from Morpho yield
        state.nav_per_shit *= (1 + nav_growth)
        state.rfv = state.nav_per_shit * state.shit_supply * 0.75  # RFV ~75% of NAV
        state.floor_price = state.rfv / state.shit_supply if state.shit_supply > 0 else 0

        # ─── 2. Compute base yield ───
        # Yield is based on TOTAL supply (SHIT Protocol pattern: SHIT_stakers = totalSupply * rewardRate)
        # Not staked supply — so yield_per_token = base_yield / staking_ratio
        # This means APY is high when few stakers (early protocol) and decreases as ratio rises
        contract_balance = state.shit_supply * params.base_yield_per_epoch_bps / BPS_DENOMINATOR
        if state.st_shit_supply > 0:
            base_yield_per_token = (contract_balance * 1e18) / state.st_shit_supply
        else:
            base_yield_per_token = 0.0

        state.base_yield = contract_balance
        yield_fraction = base_yield_per_token / 1e18 if base_yield_per_token > 0 else 0
        new_index = state.staking_index + yield_fraction  # Additive: index grows by yield per epoch

        # ─── 3. Circuit breaker check (with grace period + auto-reset + gradual softening + forced reset) ───
        in_grace_period = epoch < params.deployment_grace_epochs
        # Forced reset check first — triggers regardless of price
        if state.circuit_breaker_tripped:
            epochs_tripped = epoch - state.circuit_breaker_trip_epoch
            if epochs_tripped >= 55:
                state.circuit_breaker_tripped = False
                state.circuit_breaker_count = 0
                state.circuit_breaker_recovery_count = 0
        if state.floor_price > 0 and state.twap_price < state.floor_price and not in_grace_period:
            state.circuit_breaker_count += 1
            state.circuit_breaker_recovery_count = 0
            if state.circuit_breaker_count >= params.circuit_breaker_threshold and not state.circuit_breaker_tripped:
                state.circuit_breaker_tripped = True
                state.circuit_breaker_trip_epoch = epoch
        elif state.circuit_breaker_tripped:
            # Recovery logic only (forced reset already checked above)
            if state.twap_price >= state.floor_price:
                state.circuit_breaker_recovery_count += 1
                # Gradual softening: after 60 epochs tripped, reduce reset threshold from 21 to 7
                effective_reset = params.circuit_breaker_auto_reset
                if epochs_tripped > 60:
                    effective_reset = 7
                if state.circuit_breaker_recovery_count >= effective_reset:
                    state.circuit_breaker_tripped = False
                    state.circuit_breaker_count = 0
                    state.circuit_breaker_recovery_count = 0
            else:
                state.circuit_breaker_recovery_count = 0
        else:
            state.circuit_breaker_count = 0

        # ─── 4. Supplemental emissions (with rate limiter) ───
        state.supplemental_mint = 0.0
        # Rate limiter: reset window every 30 epochs, cap at 5% of st_shit_supply per window
        # Warmup: exempt first 30 epochs (1 month) to allow higher initial APY
        supp_warmup_end = 30
        rate_limiter_active = epoch >= supp_warmup_end
        if rate_limiter_active and epoch - state.supplemental_window_start >= 30:
            state.supplemental_window_start = epoch
            state.supplemental_window_minted = 0.0
        supplemental_window_cap = state.st_shit_supply * 0.05
        if state.nav_per_shit > 0 and state.twap_price > state.nav_per_shit and not state.circuit_breaker_tripped and state.staking_ratio > 0.50:
            premium_bps = (state.twap_price * BPS_DENOMINATOR) / state.nav_per_shit

            if premium_bps >= params.k_bps:
                # Max supplemental emission
                state.supplemental_mint = (state.st_shit_supply * params.r_max) / BPS_DENOMINATOR
            else:
                # Linear scaling between 1x and K_BPS
                excess_bps = premium_bps - BPS_DENOMINATOR
                range_bps = params.k_bps - BPS_DENOMINATOR
                if range_bps > 0:
                    state.supplemental_mint = (
                        state.st_shit_supply * params.r_max * excess_bps
                    ) / (range_bps * BPS_DENOMINATOR)

            # RFV invariant — allow supplemental if backing ratio > 90%, scale proportionally
            new_shit_supply = state.shit_supply + state.supplemental_mint
            required_rfv = (new_shit_supply * state.floor_price)
            if state.rfv > 0 and required_rfv > 0:
                backing_ratio = state.rfv / required_rfv
                if backing_ratio < 0.90:
                    state.supplemental_mint = 0.0
                elif backing_ratio < 1.0:
                    state.supplemental_mint *= (backing_ratio - 0.90) / 0.10
            else:
                state.supplemental_mint = 0.0

            # Rate limiter: cap cumulative supplemental per 30-epoch window at 5% of st_shit_supply
            # Only enforce after warmup period
            if rate_limiter_active:
                remaining_cap = supplemental_window_cap - state.supplemental_window_minted
                if state.supplemental_mint > remaining_cap:
                    state.supplemental_mint = max(0.0, remaining_cap)

            if state.supplemental_mint > 0:
                supp_yield = (state.supplemental_mint * 1e18) / state.st_shit_supply / 1e18
                new_index += supp_yield  # Add supplemental yield on top of base yield
                # NOTE: supplemental does NOT add to rebase_rate_bps — it's a separate mint, not a rebase
                state.total_supplemental_minted += state.supplemental_mint
                state.supplemental_window_minted += state.supplemental_mint

        # ─── 5. Update staking index ───
        old_index = state.staking_index
        state.staking_index = new_index if new_index > 0 else state.staking_index
        # Rebase rate = yield fraction per epoch (not index ratio, which dilutes over time)
        state.rebase_rate_bps = yield_fraction * BPS_DENOMINATOR if yield_fraction > 0 else 0
        state.rebase_rate_bps = min(state.rebase_rate_bps, 70.0)  # Cap rebase at 0.7% per epoch (matches SHIT Protocol peak ~180K% APY)

        # Track rebase-minted tokens for supply reconciliation
        state.total_rebase_minted += yield_fraction * state.st_shit_supply if state.st_shit_supply > 0 else 0

        # Update SHIT supply from supplemental mint
        state.shit_supply += state.supplemental_mint

        # ─── 6. Staker behavior (stake/unstake flows) ───
        # APY = rebase_rate * 3 epochs/day * 365 days
        state.staking_apy = ((1 + state.rebase_rate_bps / BPS_DENOMINATOR) ** (EPOCHS_PER_DAY * 365) - 1) * 100
        state.staking_apy = min(state.staking_apy, 220000.0)  # Cap at 220,000% (SHIT Protocol peak was 180,724%)

        # Market yield alternative (e.g., Morpho ~5% APY)
        market_yield = 5.0

        # Staking ratio adjusts based on APY premium/discount
        apy_premium = state.staking_apy - market_yield
        target_staking_ratio = min(0.95, max(0.05,
            state.staking_ratio + apy_premium / 100 * params.stake_elasticity * 0.01
        ))

        # If circuit breaker tripped, stakers gradually unstake (but can return on auto-reset)
        if state.circuit_breaker_tripped:
            target_staking_ratio = max(0.05, state.staking_ratio * 0.9)

        # Gradual adjustment
        adjustment_speed = 0.1
        state.staking_ratio = state.staking_ratio + (target_staking_ratio - state.staking_ratio) * adjustment_speed
        state.st_shit_supply = state.shit_supply * state.staking_ratio

        # Premium/discount
        premium_discount = ((state.twap_price / state.nav_per_shit) - 1) * 100 if state.nav_per_shit > 0 else 0

        records.append({
            'epoch': epoch,
            'day': epoch / EPOCHS_PER_DAY,
            'shit_supply': state.shit_supply,
            'st_shit_supply': state.st_shit_supply,
            'staking_index': state.staking_index,
            'staking_ratio': state.staking_ratio,
            'twap_price': state.twap_price,
            'nav_per_shit': state.nav_per_shit,
            'floor_price': state.floor_price,
            'rfv': state.rfv,
            'rebase_rate_bps': state.rebase_rate_bps,
            'staking_apy': state.staking_apy,
            'supplemental_mint': state.supplemental_mint,
            'rebase_minted': state.rebase_rate_bps / BPS_DENOMINATOR * state.st_shit_supply if state.st_shit_supply > 0 else 0,
            'total_rebase_minted': state.total_rebase_minted,
            'base_yield': state.base_yield,
            'total_supplemental_minted': state.total_supplemental_minted,
            'circuit_breaker_count': state.circuit_breaker_count,
            'circuit_breaker_tripped': state.circuit_breaker_tripped,
            'circuit_breaker_recovery_count': state.circuit_breaker_recovery_count,
            'premium_discount_pct': premium_discount,
        })

    return pd.DataFrame(records)


def reset_circuit_breaker(df: pd.DataFrame, at_epoch: int) -> pd.DataFrame:
    """Simulate multisig resetting the circuit breaker at a specific epoch."""
    df = df.copy()
    df.loc[df['epoch'] >= at_epoch, 'circuit_breaker_tripped'] = False
    df.loc[df['epoch'] >= at_epoch, 'circuit_breaker_count'] = 0
    return df
