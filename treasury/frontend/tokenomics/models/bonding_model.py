"""
Bonding & Premium Seller Model for SHIT Protocol (SHIT)

Mirrors:
- contracts/src/bonding/ShitBonding.sol (Bond Protocol integration)
- contracts/src/bonding/ShitInverseBond.sol (buyback at NAV minus spread, burns SHIT)
- contracts/src/bonding/ShitPremiumSeller.sol (sells SHIT when TWAP > 2x NAV)

Uses conding (bonding-curves/conding) for bonding curve math where applicable.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional

# ─── Contract Constants ───
PREMIUM_THRESHOLD = 2e18           # 2x NAV
CLIP_BPS = 25                      # 0.25% of pool reserves per clip
MIN_INTERVAL = 3600                # 1 hour
MAX_SLIPPAGE_BPS = 100             # 1%
INVERSE_SPREAD_BPS = 150           # 1.5% discount to NAV
MAX_CAPACITY_BPS = 100             # 1% of liquid treasury per epoch
BASIS_POINTS = 10000


@dataclass
class BondingParams:
    """Configurable parameters for bonding simulation."""
    # Premium seller
    premium_threshold: float = 2.0          # TWAP > 2x NAV triggers selling
    clip_bps: float = CLIP_BPS              # % of pool reserves sold per clip
    min_interval_hours: float = 1.0
    max_slippage_bps: float = MAX_SLIPPAGE_BPS

    # Inverse bonds
    inverse_spread_bps: float = INVERSE_SPREAD_BPS   # 1.5% discount to NAV
    max_capacity_bps: float = MAX_CAPACITY_BPS       # 1% of liquid treasury per epoch

    # Standard bonds
    bond_discount_bps: float = 300          # 3% base discount
    bond_vesting_days: float = 5.0
    bond_capacity_per_epoch: float = 50_000.0  # USDC worth of bonds per epoch

    # Initial conditions
    initial_shit_supply: float = 1_000_000.0
    initial_price: float = 10.0
    initial_nav_per_shit: float = 8.0
    initial_pool_shit: float = 200_000.0
    initial_pool_usdc: float = 2_000_000.0
    initial_treasury_usdc: float = 5_000_000.0

    # Simulation
    num_epochs: int = 90
    random_seed: Optional[int] = 42
    price_volatility: float = 0.05
    price_drift: float = 0.0

    # Bond demand
    bond_demand_elasticity: float = 1.5     # How responsive bond sales are to discount


@dataclass
class BondingState:
    """Mutable bonding state."""
    shit_supply: float
    twap_price: float
    nav_per_shit: float
    pool_shit: float
    pool_usdc: float
    treasury_usdc: float
    epoch: int = 0
    # Premium seller
    premium_active: bool = False
    last_premium_sale_epoch: int = -999
    total_shit_sold_premium: float = 0.0
    total_usdc_from_premium: float = 0.0
    # Inverse bonds
    inverse_bond_capacity: float = 0.0
    total_shit_burned_inverse: float = 0.0
    total_usdc_paid_inverse: float = 0.0
    # Standard bonds
    total_shit_bonded: float = 0.0
    total_usdc_from_bonds: float = 0.0
    bond_discount: float = 0.0
    # Net supply
    net_supply_change: float = 0.0


def simulate_bonding(params: BondingParams) -> pd.DataFrame:
    """
    Run bonding simulation covering:
    1. Standard bonds (discounted SHIT for USDC)
    2. Inverse bonds (SHIT burned for USDC at NAV minus spread)
    3. Premium seller (mints and sells SHIT when TWAP > 2x NAV)
    """
    rng = np.random.default_rng(params.random_seed)

    state = BondingState(
        shit_supply=params.initial_shit_supply,
        twap_price=params.initial_price,
        nav_per_shit=params.initial_nav_per_shit,
        pool_shit=params.initial_pool_shit,
        pool_usdc=params.initial_pool_usdc,
        treasury_usdc=params.initial_treasury_usdc,
    )

    records = []

    for epoch in range(params.num_epochs):
        state.epoch = epoch
        state.net_supply_change = 0.0

        # ─── 1. Update price (exogenous) ───
        returns = rng.normal(params.price_drift, params.price_volatility)
        state.twap_price *= (1 + returns)
        state.twap_price = max(state.twap_price, 0.01)

        # ─── 2. Standard bonds ───
        # Bond discount adjusts based on market conditions
        # Higher premium → higher discount to attract bonders
        premium_ratio = state.twap_price / state.nav_per_shit if state.nav_per_shit > 0 else 1.0
        state.bond_discount = params.bond_discount_bps * max(1.0, premium_ratio)

        # Bond sales: USDC in, SHIT out at discount
        bond_demand = params.bond_capacity_per_epoch * (
            1 + state.bond_discount / BASIS_POINTS * params.bond_demand_elasticity
        )
        bond_demand *= rng.uniform(0.5, 1.5)  # Demand variability

        shit_from_bonds = bond_demand / (state.twap_price * (1 - state.bond_discount / BASIS_POINTS))
        state.treasury_usdc += bond_demand
        state.total_shit_bonded += shit_from_bonds
        state.total_usdc_from_bonds += bond_demand
        state.net_supply_change += shit_from_bonds  # Minted to bonders

        # ─── 3. Inverse bonds (buyback at NAV minus spread) ───
        # Capacity: 1% of liquid treasury per epoch
        state.inverse_bond_capacity = state.treasury_usdc * params.max_capacity_bps / BASIS_POINTS

        # Inverse bonds are attractive when price < NAV (sell SHIT at NAV premium)
        if state.twap_price < state.nav_per_shit:
            nav_premium = (state.nav_per_shit / state.twap_price - 1)
            # Inverse bond demand increases when NAV premium is high
            inverse_demand_shit = state.inverse_bond_capacity / (
                state.nav_per_shit * (1 - params.inverse_spread_bps / BASIS_POINTS)
            ) * min(1.0, nav_premium * 2)

            inverse_demand_shit = min(inverse_demand_shit, state.shit_supply * 0.02)  # Max 2% supply per epoch

            if inverse_demand_shit > 0:
                usdc_paid = inverse_demand_shit * state.nav_per_shit * (1 - params.inverse_spread_bps / BASIS_POINTS)
                state.treasury_usdc -= usdc_paid
                state.shit_supply -= inverse_demand_shit  # Burned
                state.total_shit_burned_inverse += inverse_demand_shit
                state.total_usdc_paid_inverse += usdc_paid
                state.net_supply_change -= inverse_demand_shit

        # ─── 4. Premium seller (mint + sell when TWAP > 2x NAV) ───
        state.premium_active = False
        epochs_since_last = epoch - state.last_premium_sale_epoch
        min_interval_epochs = params.min_interval_hours / 8  # 8h epochs

        if (state.twap_price > state.nav_per_shit * params.premium_threshold
            and epochs_since_last >= min_interval_epochs):

            # Sell clip_bps % of pool SHIT reserves
            shit_to_sell = state.pool_shit * params.clip_bps / BASIS_POINTS

            # Simulate swap impact (constant product)
            k = state.pool_shit * state.pool_usdc
            new_pool_shit = state.pool_shit + shit_to_sell
            new_pool_usdc = k / new_pool_shit
            usdc_received = state.pool_usdc - new_pool_usdc

            # Check slippage
            expected_usdc = shit_to_sell * state.twap_price
            slippage = (1 - usdc_received / expected_usdc) * 100 if expected_usdc > 0 else 999
            if slippage * 100 <= params.max_slippage_bps:
                # Execute: mint SHIT, sell into pool, USDC to treasury
                state.pool_shit = new_pool_shit
                state.pool_usdc = new_pool_usdc
                state.shit_supply += shit_to_sell  # Minted
                state.treasury_usdc += usdc_received
                state.total_shit_sold_premium += shit_to_sell
                state.total_usdc_from_premium += usdc_received
                state.last_premium_sale_epoch = epoch
                state.premium_active = True
                state.net_supply_change += shit_to_sell

        # Update supply
        state.shit_supply += shit_from_bonds  # From standard bonds

        # Market price from pool
        market_price = state.pool_usdc / state.pool_shit if state.pool_shit > 0 else 0

        records.append({
            'epoch': epoch,
            'day': epoch / 3,
            'twap_price': state.twap_price,
            'market_price': market_price,
            'nav_per_shit': state.nav_per_shit,
            'shit_supply': state.shit_supply,
            'treasury_usdc': state.treasury_usdc,
            'bond_discount_bps': state.bond_discount,
            'shit_from_bonds': shit_from_bonds,
            'usdc_from_bonds': bond_demand,
            'total_shit_bonded': state.total_shit_bonded,
            'total_usdc_from_bonds': state.total_usdc_from_bonds,
            'inverse_bond_capacity': state.inverse_bond_capacity,
            'shit_burned_inverse': state.total_shit_burned_inverse,
            'usdc_paid_inverse': state.total_usdc_paid_inverse,
            'premium_active': state.premium_active,
            'shit_sold_premium': state.total_shit_sold_premium,
            'usdc_from_premium': state.total_usdc_from_premium,
            'net_supply_change': state.net_supply_change,
            'premium_to_nav_pct': ((state.twap_price / state.nav_per_shit) - 1) * 100 if state.nav_per_shit > 0 else 0,
        })

    return pd.DataFrame(records)
