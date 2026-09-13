"""
Stablecoin (Bucky) & RBS Model for SHIT Protocol

Mirrors:
- contracts/src/stablecoin/shitPsm.sol (1:1 USDC↔Bucky via Spark PSM3)
- contracts/src/stablecoin/shitPegKeeper.sol (Curve PegKeeper wrapper)
- contracts/src/stablecoin/shitLendingAMO.sol (Bucky in lending markets)
- contracts/src/stablecoin/shitUniswapV4AMO.sol (Bucky liquidity in V4 pools)
- contracts/src/rbs/RBSConfig.sol (Range Bound Stability price bands)
- contracts/src/rbs/shitRBSBondMarket.sol (RBS bond markets)
- contracts/src/rbs/shitWallAdjuster.sol (automated wall adjustments)

Adapts patterns from:
- shit-rbs-sims/src/utils.py (RBS wall/cushion logic)
- crvusdsim (PegKeeper patterns)
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional

# ─── Contract Constants ───
ACTION_DELAY = 15 * 60  # 15 minutes (PegKeeper)
BASIS_POINTS = 10000


@dataclass
class StablecoinParams:
    """Configurable parameters for Bucky stablecoin & RBS simulation."""
    # PSM
    psm_fee_bps: float = 0.0             # 1:1 USDC↔Bucky, no fee
    initial_bucky_supply: float = 0.0
    initial_psm_usdc: float = 0.0

    # PegKeeper
    action_delay_minutes: float = 15.0
    peg_tolerance_bps: float = 50        # 0.5% peg tolerance

    # AMO deployments
    lending_amo_pct: float = 0.30        # 30% of Bucky in lending AMO
    liquidity_amo_pct: float = 0.20      # 20% of Bucky in V4 liquidity AMO
    lending_apy: float = 0.06            # 6% APY from lending
    liquidity_fee_apy: float = 0.03      # 3% APY from LP fees

    # RBS configuration (adapted from shit-rbs-sims ModelParams)
    lower_wall: float = 0.02             # 2% below target
    upper_wall: float = 0.02             # 2% above target
    lower_cushion: float = 0.01          # 1% below target
    upper_cushion: float = 0.01          # 1% above target
    bid_factor: float = 0.3              # 30% of reserves for bid
    ask_factor: float = 0.3              # 30% of reserves for ask
    cushion_factor: float = 0.3          # 30% of capacity as cushion
    reinstate_window: int = 7            # 7 days to reinstate
    min_counter_reinstate: int = 3       # 3 days within window
    target_ma_days: int = 30             # 30-day moving average

    # Initial conditions
    initial_price: float = 1.0           # Bucky/USDC price
    initial_target: float = 1.0          # Price target

    # Simulation
    num_epochs: int = 90
    random_seed: Optional[int] = 42
    price_volatility: float = 0.005      # Low volatility for stablecoin
    price_drift: float = 0.0

    # USDC depeg scenario
    usdc_depeg_epoch: int = -1           # -1 = no depeg, else epoch number
    usdc_depeg_severity: float = 0.0     # 0 = no depeg, 0.05 = 5% depeg


@dataclass
class StablecoinState:
    """Mutable stablecoin state."""
    bucky_supply: float
    psm_usdc: float
    peg_price: float
    target_price: float
    ma_target: float
    lending_amo_position: float
    liquidity_amo_position: float
    treasury_usdc: float
    epoch: int = 0
    # RBS state
    lower_target_wall: float = 0.0
    upper_target_wall: float = 0.0
    lower_target_cushion: float = 0.0
    upper_target_cushion: float = 0.0
    bid_capacity: float = 0.0
    ask_capacity: float = 0.0
    bid_capacity_cushion: float = 0.0
    ask_capacity_cushion: float = 0.0
    bid_active: bool = False
    ask_active: bool = False
    bid_counter: list = field(default_factory=list)
    ask_counter: list = field(default_factory=list)
    # PegKeeper
    pegkeeper_active: bool = False
    last_pegkeeper_action: int = -999
    # Metrics
    total_amo_yield: float = 0.0
    total_pegkeeper_actions: int = 0
    peg_deviations: float = 0.0


def simulate_stablecoin(params: StablecoinParams) -> pd.DataFrame:
    """
    Run Bucky stablecoin & RBS simulation.
    Adapts RBS logic from shit-rbs-sims/src/utils.py (Day class).
    """
    rng = np.random.default_rng(params.random_seed)

    state = StablecoinState(
        bucky_supply=params.initial_bucky_supply,
        psm_usdc=params.initial_psm_usdc,
        peg_price=params.initial_price,
        target_price=params.initial_target,
        ma_target=params.initial_target,
        lending_amo_position=params.initial_bucky_supply * params.lending_amo_pct,
        liquidity_amo_position=params.initial_bucky_supply * params.liquidity_amo_pct,
        treasury_usdc=0.0,
        bid_counter=[0] * params.reinstate_window,
        ask_counter=[0] * params.reinstate_window,
    )

    # Initialize RBS bands
    state.lower_target_wall = state.target_price * (1 - params.lower_wall)
    state.upper_target_wall = state.target_price * (1 + params.upper_wall)
    state.lower_target_cushion = state.target_price * (1 - params.lower_cushion)
    state.upper_target_cushion = state.target_price * (1 + params.upper_cushion)
    state.bid_capacity = params.bid_factor * state.psm_usdc
    state.ask_capacity = params.ask_factor * state.psm_usdc
    state.bid_capacity_cushion = state.bid_capacity * params.cushion_factor
    state.ask_capacity_cushion = state.ask_capacity * params.cushion_factor

    epochs_per_year = 3 * 365
    lending_rate = (1 + params.lending_apy) ** (1 / epochs_per_year) - 1
    liquidity_rate = (1 + params.liquidity_fee_apy) ** (1 / epochs_per_year) - 1

    # Price history for MA
    price_history = [state.peg_price] * params.target_ma_days * 3

    records = []

    for epoch in range(params.num_epochs):
        state.epoch = epoch

        # ─── 1. Update peg price (exogenous) ───
        returns = rng.normal(params.price_drift, params.price_volatility)
        state.peg_price *= (1 + returns)
        state.peg_price = max(state.peg_price, 0.5)  # Floor at $0.50

        # USDC depeg scenario
        if epoch == params.usdc_depeg_epoch:
            state.peg_price *= (1 - params.usdc_depeg_severity)

        price_history.append(state.peg_price)

        # ─── 2. Update MA target ───
        ma_window = params.target_ma_days * 3  # Convert days to epochs
        state.ma_target = np.mean(price_history[-ma_window:])
        state.target_price = max(state.ma_target, 1.0)  # Never below $1

        # Update RBS bands
        state.lower_target_wall = state.target_price * (1 - params.lower_wall)
        state.upper_target_wall = state.target_price * (1 + params.upper_wall)
        state.lower_target_cushion = state.target_price * (1 - params.lower_cushion)
        state.upper_target_cushion = state.target_price * (1 + params.upper_cushion)

        # ─── 3. RBS reinstate counters ───
        if state.peg_price > state.target_price:
            state.bid_counter = state.bid_counter[1:] + [1]
        else:
            state.bid_counter = state.bid_counter[1:] + [0]

        if state.peg_price < state.ma_target:
            state.ask_counter = state.ask_counter[1:] + [1]
        else:
            state.ask_counter = state.ask_counter[1:] + [0]

        # ─── 4. RBS bid/ask execution ───
        state.bid_active = False
        state.ask_active = False

        # BID: Buy Bucky when price < lower cushion (defend peg from below)
        if state.peg_price < state.lower_target_cushion:
            if sum(state.bid_counter) >= params.min_counter_reinstate:
                # Refill capacity
                state.bid_capacity_cushion = state.bid_capacity * params.cushion_factor

            if state.bid_capacity_cushion > 0:
                # Treasury buys Bucky with USDC
                buy_amount = min(state.bid_capacity_cushion, state.psm_usdc * 0.05)
                state.psm_usdc -= buy_amount
                state.bucky_supply -= buy_amount / state.peg_price  # Remove Bucky
                state.bid_capacity_cushion -= buy_amount
                state.bid_active = True
                state.peg_price = min(state.lower_target_cushion, state.peg_price + 0.001)

        # ASK: Sell Bucky when price > upper cushion (defend peg from above)
        if state.peg_price > state.upper_target_cushion:
            if sum(state.ask_counter) >= params.min_counter_reinstate:
                state.ask_capacity_cushion = state.ask_capacity * params.cushion_factor

            if state.ask_capacity_cushion > 0:
                sell_amount = min(state.ask_capacity_cushion, state.bucky_supply * 0.05)
                state.bucky_supply += sell_amount / state.peg_price  # Mint Bucky
                state.psm_usdc += sell_amount
                state.ask_capacity_cushion -= sell_amount
                state.ask_active = True
                state.peg_price = max(state.upper_target_cushion, state.peg_price - 0.001)

        # ─── 5. PegKeeper ───
        state.pegkeeper_active = False
        peg_deviation_bps = abs((state.peg_price - 1.0) * BASIS_POINTS)

        if peg_deviation_bps > params.peg_tolerance_bps:
            epochs_since_last = epoch - state.last_pegkeeper_action
            min_interval_epochs = params.action_delay_minutes / (8 * 60)  # 8h epochs

            if epochs_since_last >= min_interval_epochs:
                # PegKeeper adjusts supply to pull peg toward $1
                adjustment = (state.peg_price - 1.0) * state.bucky_supply * 0.01
                if state.peg_price > 1.0:
                    # Peg too high: mint Bucky, sell for USDC
                    state.bucky_supply += adjustment
                    state.psm_usdc += adjustment * state.peg_price
                else:
                    # Peg too low: burn Bucky, buy with USDC
                    state.bucky_supply -= adjustment
                    state.psm_usdc -= adjustment * state.peg_price

                state.pegkeeper_active = True
                state.last_pegkeeper_action = epoch
                state.total_pegkeeper_actions += 1
                state.peg_price += (1.0 - state.peg_price) * 0.1  # Move 10% toward peg

        state.peg_deviations = abs((state.peg_price - 1.0) * 100)

        # ─── 6. AMO yield accrual ───
        lending_yield = state.lending_amo_position * lending_rate
        liquidity_yield = state.liquidity_amo_position * liquidity_rate
        state.treasury_usdc += lending_yield + liquidity_yield
        state.total_amo_yield += lending_yield + liquidity_yield

        records.append({
            'epoch': epoch,
            'day': epoch / 3,
            'peg_price': state.peg_price,
            'target_price': state.target_price,
            'ma_target': state.ma_target,
            'bucky_supply': state.bucky_supply,
            'psm_usdc': state.psm_usdc,
            'treasury_usdc': state.treasury_usdc,
            'lending_amo': state.lending_amo_position,
            'liquidity_amo': state.liquidity_amo_position,
            'lower_wall': state.lower_target_wall,
            'upper_wall': state.upper_target_wall,
            'lower_cushion': state.lower_target_cushion,
            'upper_cushion': state.upper_target_cushion,
            'bid_active': state.bid_active,
            'ask_active': state.ask_active,
            'pegkeeper_active': state.pegkeeper_active,
            'peg_deviation_pct': state.peg_deviations,
            'total_amo_yield': state.total_amo_yield,
            'total_pegkeeper_actions': state.total_pegkeeper_actions,
        })

    return pd.DataFrame(records)
