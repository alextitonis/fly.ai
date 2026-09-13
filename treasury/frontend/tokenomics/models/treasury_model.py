"""
Treasury Policy Model for SHIT Protocol (SHIT)

Mirrors the logic in contracts/src/kernel/shitTreasuryPolicy.sol:
- RFV calculation with haircuts (Morpho 2%, Impact 50%, POL 50%)
- NAV calculation (full value, no haircuts)
- Idle asset caps enforcement
- RFV invariant: totalSupply × floorPrice ≤ RFV
- Team compensation caps (2% treasury/yr)
- Dissolution mechanism
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional

# ─── Contract Constants (from shitTreasuryPolicy.sol) ───
MORPHO_CAP_BPS = 7000          # 70% max to Morpho
MORPHO_HAIRCUT_BPS = 200       # 2% RFV haircut
IMPACT_HAIRCUT_BPS = 5000      # 50% RFV haircut
POL_HAIRCUT_BPS = 5000         # 50% RFV haircut
IDLE_USDC_CAP_BPS = 3000       # ≤30% idle USDC
IDLE_IMPACT_CAP_BPS = 1000     # ≤10% idle impact tokens
IDLE_POL_CAP_BPS = 0           # 0% idle POL
TEAM_COMP_MAX_BPS = 200        # max 2% treasury/yr
DISSOLUTION_TIMELOCK = 7 * 24 * 3600  # 7 days
BPS = 10000


@dataclass
class TreasuryParams:
    """Configurable parameters for treasury simulation."""
    # Haircuts
    morpho_haircut_bps: float = MORPHO_HAIRCUT_BPS
    impact_haircut_bps: float = IMPACT_HAIRCUT_BPS
    pol_haircut_bps: float = POL_HAIRCUT_BPS

    # Idle caps
    idle_usdc_cap_bps: float = IDLE_USDC_CAP_BPS
    idle_impact_cap_bps: float = IDLE_IMPACT_CAP_BPS
    idle_pol_cap_bps: float = IDLE_POL_CAP_BPS

    # Morpho cap
    morpho_cap_bps: float = MORPHO_CAP_BPS

    # Team comp
    team_comp_max_bps: float = TEAM_COMP_MAX_BPS

    # Initial treasury composition (in USD) — starts at 0, grows from fees/yield/bonding
    initial_usdc: float = 0.0
    initial_morpho: float = 0.0
    initial_impact_tokens: float = 0.0
    initial_pol: float = 0.0

    # Yield rates (per epoch, 8h)
    morpho_apy: float = 0.05           # 5% APY on Morpho
    impact_token_apy: float = 0.10      # 10% APY on impact tokens
    pol_fee_apy: float = 0.15           # 15% APY from POL fees
    usdc_apy: float = 0.04              # 4% APY on idle USDC (Spark)

    # Simulation
    num_epochs: int = 90
    initial_shit_supply: float = 1_000_000.0
    random_seed: Optional[int] = 42

    # Impact token liquidity (affects haircut adequacy)
    impact_token_liquidity_depth: float = 500_000.0  # max sell before 10% slippage

    # POL slippage (double slippage: withdraw LP + trade impact token)
    pol_slippage_bps: float = 500       # 5% combined slippage on POL exit

    # Team comp
    team_comp_active: bool = True
    team_comp_rate_bps: float = 150     # 1.5% per year


@dataclass
class TreasuryState:
    """Mutable treasury state."""
    usdc_balance: float
    morpho_position: float
    impact_token_value: float
    pol_value: float
    shit_supply: float
    rfv: float = 0.0
    nav: float = 0.0
    floor_price: float = 0.0
    nav_per_shit: float = 0.0
    total_treasury_usdc: float = 0.0
    team_comp_accumulated: float = 0.0
    epoch: int = 0
    # Idle tracking
    idle_usdc: float = 0.0
    idle_impact: float = 0.0
    idle_pol: float = 0.0
    # Dissolution
    dissolution_proposed: bool = False
    dissolution_approved: bool = False
    dissolution_executed: bool = False
    dissolution_redemption_rate: float = 0.0


def compute_rfv_nav(
    usdc: float,
    morpho: float,
    impact: float,
    pol: float,
    params: TreasuryParams,
) -> tuple[float, float]:
    """Compute RFV and NAV from treasury composition."""
    impact_in_rfv = impact * (BPS - params.impact_haircut_bps) / BPS
    pol_in_rfv = pol * (BPS - params.pol_haircut_bps) / BPS
    morpho_in_rfv = morpho * (BPS - params.morpho_haircut_bps) / BPS

    rfv = usdc + morpho_in_rfv + impact_in_rfv + pol_in_rfv
    nav = usdc + morpho + impact + pol

    return rfv, nav


def enforce_rfv_invariant(
    shit_supply: float,
    floor_price: float,
    rfv: float,
) -> bool:
    """
    Check if minting would violate RFV invariant.
    Returns True if mint is allowed, False if it would violate.
    """
    required_rfv = (shit_supply * floor_price)
    return required_rfv <= rfv


def simulate_treasury(params: TreasuryParams) -> pd.DataFrame:
    """
    Run treasury simulation over num_epochs.
    Tracks RFV/NAV, idle caps, team comp, yield accrual.
    """
    rng = np.random.default_rng(params.random_seed)

    state = TreasuryState(
        usdc_balance=params.initial_usdc,
        morpho_position=params.initial_morpho,
        impact_token_value=params.initial_impact_tokens,
        pol_value=params.initial_pol,
        shit_supply=params.initial_shit_supply,
    )

    # Convert APY to per-epoch rate (3 epochs/day, 365 days)
    epochs_per_year = 3 * 365
    morpho_rate = (1 + params.morpho_apy) ** (1 / epochs_per_year) - 1
    impact_rate = (1 + params.impact_token_apy) ** (1 / epochs_per_year) - 1
    pol_rate = (1 + params.pol_fee_apy) ** (1 / epochs_per_year) - 1
    usdc_rate = (1 + params.usdc_apy) ** (1 / epochs_per_year) - 1
    team_comp_per_epoch = params.team_comp_rate_bps / BPS / epochs_per_year

    records = []

    for epoch in range(params.num_epochs):
        state.epoch = epoch

        # ─── 1. Accrue yield ───
        morpho_yield = state.morpho_position * morpho_rate
        impact_yield = state.impact_token_value * impact_rate
        pol_yield = state.pol_value * pol_rate
        usdc_yield = state.usdc_balance * usdc_rate

        state.morpho_position += morpho_yield
        state.impact_token_value += impact_yield
        state.pol_value += pol_yield
        state.usdc_balance += usdc_yield

        # POL fees go to USDC (harvested)
        state.usdc_balance += pol_yield
        state.pol_value -= pol_yield  # fees extracted from POL

        # ─── 2. Team compensation ───
        if params.team_comp_active:
            total_treasury = state.usdc_balance + state.morpho_position + state.impact_token_value + state.pol_value
            comp_amount = min(
                total_treasury * team_comp_per_epoch,
                total_treasury * params.team_comp_max_bps / BPS / epochs_per_year
            )
            state.usdc_balance -= comp_amount
            state.team_comp_accumulated += comp_amount

        # ─── 3. Deploy idle assets (enforce caps) ───
        total_treasury = state.usdc_balance + state.morpho_position + state.impact_token_value + state.pol_value

        # Idle USDC cap: ≤30%
        max_idle_usdc = total_treasury * params.idle_usdc_cap_bps / BPS
        if state.usdc_balance > max_idle_usdc:
            excess = state.usdc_balance - max_idle_usdc
            # Deploy to Morpho (up to Morpho cap)
            morpho_cap = total_treasury * params.morpho_cap_bps / BPS
            deployable = min(excess, morpho_cap - state.morpho_position)
            if deployable > 0:
                state.usdc_balance -= deployable
                state.morpho_position += deployable
            state.idle_usdc = state.usdc_balance
        else:
            state.idle_usdc = state.usdc_balance

        # Idle impact cap: ≤10%
        max_idle_impact = total_treasury * params.idle_impact_cap_bps / BPS
        state.idle_impact = state.impact_token_value
        if state.impact_token_value > max_idle_impact:
            # Would need to deploy to LP or lending — for sim, we note the excess
            pass

        # Idle POL cap: 0% — all POL must be deployed (always deployed by definition)
        state.idle_pol = 0.0

        # ─── 4. Compute RFV and NAV ───
        state.rfv, state.nav = compute_rfv_nav(
            state.usdc_balance,
            state.morpho_position,
            state.impact_token_value,
            state.pol_value,
            params
        )

        # ─── 5. Compute floor price and NAV per SHIT ───
        state.floor_price = (state.rfv / state.shit_supply) if state.shit_supply > 0 else 0
        state.nav_per_shit = (state.nav / state.shit_supply) if state.shit_supply > 0 else 0
        state.total_treasury_usdc = state.usdc_balance

        # ─── 6. Stress: impact token liquidity shock (random) ───
        # Simulate occasional impact token devaluation
        if rng.random() < 0.02:  # 2% chance per epoch
            shock = rng.uniform(0.05, 0.20)  # 5-20% devaluation
            state.impact_token_value *= (1 - shock)

        records.append({
            'epoch': epoch,
            'day': epoch / 3,
            'usdc_balance': state.usdc_balance,
            'morpho_position': state.morpho_position,
            'impact_token_value': state.impact_token_value,
            'pol_value': state.pol_value,
            'total_treasury': state.usdc_balance + state.morpho_position + state.impact_token_value + state.pol_value,
            'rfv': state.rfv,
            'nav': state.nav,
            'floor_price': state.floor_price,
            'nav_per_shit': state.nav_per_shit,
            'shit_supply': state.shit_supply,
            'rfv_nav_ratio': state.rfv / state.nav if state.nav > 0 else 0,
            'team_comp_accumulated': state.team_comp_accumulated,
            'idle_usdc_pct': state.idle_usdc / total_treasury * 100 if total_treasury > 0 else 0,
            'idle_impact_pct': state.idle_impact / total_treasury * 100 if total_treasury > 0 else 0,
        })

    return pd.DataFrame(records)


def simulate_dissolution(
    params: TreasuryParams,
    shit_supply: float,
    rfv: float,
) -> dict:
    """
    Simulate the dissolution mechanism.
    Returns redemption rate and per-holder payout.
    """
    redemption_rate = rfv / shit_supply if shit_supply > 0 else 0

    return {
    'redemption_rate': redemption_rate,
        'total_redemption_value': rfv,
        'per_token_payout': redemption_rate,
        'timelock_days': 7,
        'notes': 'All SHIT holders can redeem at floor price (RFV/supply). '
                 'Team comp capped at 2%/yr. Dissolution requires multisig + 7-day timelock.',
    }
