"""
BAMM (Borrowable AMM) and Perpetual Trading simulation.

Models:
- shitBAMM: ERC-4626 wrapper around LP tokens, creates leveraged LP positions
- shitPerpVault: ERC-4626 margin vault for perps using Bucky as collateral
- shitFundingRateOracle: Funding rate dynamics
- shitSwapLiquidator: Liquidation cascades
- Perp circuit breaker: pauses new positions after 5 liquidations in 1 hour
- Partial liquidation: 10% at a time, max 10 sequential partials

Contract sources:
- contracts/src/bamm/shitBAMM.sol
- contracts/src/perps/shitPerpVault.sol
- contracts/src/perps/shitFundingRateOracle.sol
- contracts/src/perps/shitSwapLiquidator.sol
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field

EPOCHS_PER_DAY = 3


@dataclass
class BAMMParams:
    # BAMM (LP leverage)
    initial_lp_tvl: float = 0.0  # Total LP tokens staked in BAMM — starts at 0
    bamm_utilization_rate: float = 0.40  # % of LP borrowed against
    bamm_borrow_rate_apy: float = 0.20  # Borrowing cost
    bamm_yield_to_treasury_pct: float = 1.0  # 100% of BAMM yield routed (split 50/50 treasury/floor)
    leverage_multiplier: float = 2.5  # Average leverage ratio
    liquidation_threshold: float = 0.75  # LTV before liquidation
    price_volatility: float = 0.05  # SHIT price volatility

    # Perp vault
    perp_enabled: bool = True
    initial_perp_tvl: float = 0.0  # Bucky deposited as margin — starts at 0
    max_position_size_pct: float = 0.40  # Max single position as % of vault
    funding_rate_factor: float = 0.0001  # Base funding rate per epoch
    funding_rate_volatility: float = 0.0003
    liquidation_bonus_pct: float = 0.05  # 5% bonus for liquidators
    long_short_ratio: float = 1.2  # Initial long bias
    open_interest_pct: float = 1.5  # OI / vault TVL ratio (1.5x leverage — balances risk vs TVL preservation)

    # Circuit breaker (from shitPerpVault.sol)
    perp_cb_threshold: int = 3  # Trip after 3 liquidations in window (sim-adjusted: 8h epochs vs 1h contract window)
    perp_cb_window_epochs: int = 3  # ~1 hour at 3 epochs/day (8h epochs → 3 epochs = 24h, but we use 3 for sim)
    partial_liquidation_bps: int = 5000  # 50% of position at a time — aggressive to prevent bad debt
    max_partial_liquidations: int = 2  # Max 2 partials (50% + 50%) — close fast before bad debt
    critical_health_factor_bps: int = 9000  # Force full liquidation at 90% health factor — >11% underwater

    num_epochs: int = 90
    random_seed: int = 42


@dataclass
class BAMMState:
    lp_tvl: float = 0.0
    bamm_borrowed: float = 0.0
    bamm_yield_accumulated: float = 0.0
    treasury_from_bamm: float = 0.0
    bamm_liquidations: int = 0

    perp_tvl: float = 0.0
    perp_open_interest: float = 0.0
    funding_rate: float = 0.0
    perp_pnl_accumulated: float = 0.0
    perp_liquidations: int = 0
    bucky_locked_in_perps: float = 0.0
    liquidation_cascade_active: bool = False
    perp_circuit_breaker: bool = False
    perp_cb_cooldown: int = 0
    liquidation_history: list = None
    total_bad_debt: float = 0.0
    full_liquidations_forced: int = 0


def simulate_bamm_perp(params: BAMMParams) -> pd.DataFrame:
    """
    Simulate BAMM leverage and perpetual trading vault.
    Returns DataFrame with per-epoch state.
    """
    rng = np.random.default_rng(params.random_seed)
    state = BAMMState()
    state.lp_tvl = params.initial_lp_tvl
    state.perp_tvl = params.initial_perp_tvl
    state.funding_rate = params.funding_rate_factor
    state.liquidation_history = []
    records = []

    for epoch in range(params.num_epochs):
        # ─── BAMM ───
        # LP TVL grows from fees and shrinks from impermanent loss
        lp_fee_yield = state.lp_tvl * 0.20 / 365 / EPOCHS_PER_DAY  # ~20% APY from LP fees
        price_shock = rng.normal(0, params.price_volatility / np.sqrt(EPOCHS_PER_DAY))
        il_impact = -state.lp_tvl * abs(price_shock) * 0.5  # Simplified IL
        state.lp_tvl += lp_fee_yield + il_impact
        state.lp_tvl = max(state.lp_tvl, 100_000.0)

        # Borrowing activity
        state.bamm_borrowed = state.lp_tvl * params.bamm_utilization_rate
        bamm_yield = state.bamm_borrowed * params.bamm_borrow_rate_apy / 365 / EPOCHS_PER_DAY
        state.bamm_yield_accumulated += bamm_yield
        treasury_share = bamm_yield * params.bamm_yield_to_treasury_pct
        state.treasury_from_bamm += treasury_share

        # BAMM liquidations (when price moves significantly)
        if abs(price_shock) > params.liquidation_threshold * params.price_volatility:
            state.bamm_liquidations += 1
            liquidation_loss = state.bamm_borrowed * 0.02  # 2% loss per liquidation event
            state.lp_tvl -= liquidation_loss

        # ─── Perp Vault ───
        if params.perp_enabled:
            # Open interest grows/shrinks with volatility
            oi_change = rng.normal(0, 0.05)
            state.perp_open_interest = state.perp_tvl * params.open_interest_pct * (1 + oi_change * 0.1)
            state.perp_open_interest = max(state.perp_open_interest, 0)

            # Funding rate adjusts based on long/short imbalance
            long_short_drift = rng.normal(0, 0.1)
            current_long_short = params.long_short_ratio + long_short_drift
            state.funding_rate = params.funding_rate_factor * (current_long_short - 1.0) + \
                rng.normal(0, params.funding_rate_volatility)

            # Funding payments: longs pay shorts if positive
            funding_payment = state.perp_open_interest * state.funding_rate
            state.perp_pnl_accumulated -= funding_payment  # Net PnL to vault

            # Bucky locked as margin
            state.bucky_locked_in_perps = state.perp_tvl

            # Liquidations with partial liquidation mechanism + health factor check
            price_move = rng.normal(0, params.price_volatility / np.sqrt(EPOCHS_PER_DAY))
            liquidation_prob = max(0, abs(price_move) - 0.03) * 10
            if rng.random() < liquidation_prob and not state.perp_circuit_breaker:
                # Calculate position loss as % of collateral (simplified)
                # loss_pct = fraction of collateral consumed by the loss
                loss_pct = abs(price_move) * params.open_interest_pct  # Loss relative to collateral
                position_loss = state.perp_tvl * loss_pct

                # Health factor = collateral / (collateral + loss) = 1 / (1 + loss_pct)
                # At 100% threshold (CRITICAL_HEALTH_FACTOR_BPS = 10000), any loss triggers full liquidation
                # This means: liquidate immediately when position is underwater, before bad debt
                health_factor = 1.0 / (1.0 + loss_pct) if loss_pct > 0 else 1.0
                force_full = health_factor < (params.critical_health_factor_bps / 10000)

                if force_full:
                    # Full liquidation — close entire position immediately
                    state.perp_liquidations += 1
                    state.full_liquidations_forced += 1
                    # Loss capped at collateral (TVL) — no bad debt if liquidated in time
                    actual_loss = min(position_loss, state.perp_tvl)
                    # Bad debt only if somehow loss > collateral (shouldn't happen with 100% threshold)
                    if position_loss > state.perp_tvl:
                        state.total_bad_debt += position_loss - state.perp_tvl
                    state.perp_tvl -= actual_loss
                    state.perp_tvl = max(state.perp_tvl, 100_000.0)
                else:
                    # Partial liquidation: 50% of position
                    liq_size = state.perp_open_interest * params.partial_liquidation_bps / 10000
                    liq_loss = min(liq_size * loss_pct, liq_size)  # Cap at position size — no bad debt
                    liq_bonus = liq_size * params.liquidation_bonus_pct
                    state.perp_liquidations += 1
                    state.perp_tvl -= liq_bonus + liq_loss

                # Track liquidation for circuit breaker
                state.liquidation_history.append(epoch)
                state.liquidation_history = [
                    e for e in state.liquidation_history
                    if e > epoch - params.perp_cb_window_epochs
                ]

                # Check perp circuit breaker
                if len(state.liquidation_history) >= params.perp_cb_threshold:
                    state.perp_circuit_breaker = True
                    state.perp_cb_cooldown = 9  # 3 days cooldown

                # Cascade risk: reduced by partial liquidations
                cascade_count = int(rng.poisson(1)) if liquidation_prob > 0.3 else 0
                if cascade_count > 3:
                    state.liquidation_cascade_active = True
                    cascade_loss = state.perp_tvl * 0.005 * cascade_count / 10
                    state.perp_tvl -= cascade_loss
                    state.perp_liquidations += cascade_count
                else:
                    state.liquidation_cascade_active = False

            # Perp circuit breaker cooldown
            if state.perp_circuit_breaker:
                state.perp_cb_cooldown -= 1
                if state.perp_cb_cooldown <= 0:
                    state.perp_circuit_breaker = False
                    state.liquidation_history = []

            # Vault TVL grows from new deposits, shrinks from withdrawals
            deposit_flow = rng.normal(0, params.initial_perp_tvl * 0.02 / EPOCHS_PER_DAY)
            state.perp_tvl += deposit_flow
            state.perp_tvl = max(state.perp_tvl, 100_000.0)
        else:
            state.bucky_locked_in_perps = 0
            state.perp_open_interest = 0
            state.liquidation_cascade_active = False

        records.append({
            'epoch': epoch,
            'day': epoch / EPOCHS_PER_DAY,
            'bamm_lp_tvl': state.lp_tvl,
            'bamm_borrowed': state.bamm_borrowed,
            'bamm_yield': bamm_yield,
            'treasury_from_bamm': state.treasury_from_bamm,
            'bamm_liquidations': state.bamm_liquidations,
            'perp_tvl': state.perp_tvl,
            'perp_open_interest': state.perp_open_interest,
            'funding_rate': state.funding_rate,
            'perp_pnl': state.perp_pnl_accumulated,
            'perp_liquidations': state.perp_liquidations,
            'bucky_locked_perps': state.bucky_locked_in_perps,
            'liquidation_cascade': state.liquidation_cascade_active,
            'perp_circuit_breaker': state.perp_circuit_breaker,
            'perp_bad_debt': state.total_bad_debt,
            'full_liquidations_forced': state.full_liquidations_forced,
            'price_shock': price_shock,
        })

    return pd.DataFrame(records)


def bamm_perp_summary(df: pd.DataFrame) -> dict:
    """Extract summary stats."""
    return {
        'final_bamm_tvl': df['bamm_lp_tvl'].iloc[-1],
        'total_bamm_yield': df['bamm_yield'].sum(),
        'total_treasury_from_bamm': df['treasury_from_bamm'].iloc[-1],
        'bamm_liquidation_count': df['bamm_liquidations'].iloc[-1],
        'final_perp_tvl': df['perp_tvl'].iloc[-1],
        'final_perp_oi': df['perp_open_interest'].iloc[-1],
        'bucky_locked_perps': df['bucky_locked_perps'].iloc[-1],
        'perp_liquidation_count': df['perp_liquidations'].iloc[-1],
        'cascade_events': df['liquidation_cascade'].sum(),
        'avg_funding_rate': df['funding_rate'].mean(),
        'max_funding_rate': df['funding_rate'].max(),
        'min_funding_rate': df['funding_rate'].min(),
    }
