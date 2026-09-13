import numpy as np
from typing import Tuple
from .parameters import SystemParameters

def update_supply(
    S: float,
    P: float,
    L: float,
    C: float,
    params: SystemParameters
) -> float:
    """
    Update stablecoin supply based on price deviation.

    CRITICAL: Burning requires someone to BUY the coins being burned.
    Under crisis conditions, burn mechanism FAILS because no one wants to buy.
    """
    price_deviation = P - 1.0
    collateral_ratio = C / S if S > 0 else 1.0

    if price_deviation > 0:
        delta_mint = params.mint_coefficient * price_deviation * S
        delta_mint = min(delta_mint, L * 0.1)
        return S + delta_mint
    else:
        # BURN mechanism fails under stress
        delta_burn = params.burn_coefficient * abs(price_deviation) * S

        # Effectiveness collapses when CR < 1
        if collateral_ratio < 1.0:
            effectiveness = max(collateral_ratio ** 2, 0.01)
        else:
            effectiveness = 1.0

        # Falling knife effect
        if P < 0.8:
            effectiveness *= (P / 0.8) ** 2

        # Low liquidity = can't execute burns
        liquidity_effectiveness = min(L / params.initial_liquidity, 1.0)
        effectiveness *= liquidity_effectiveness

        delta_burn *= effectiveness
        delta_burn = min(delta_burn, S * 0.1)
        return S - delta_burn


def update_price(
    S: float,
    D: float,
    L: float,
    C: float,
    params: SystemParameters
) -> float:
    """Market clearing price with solvency impact."""
    if S <= 0:
        return 1.0

    base_price = D / S
    collateral_ratio = C / S

    # Price pulled toward collateral ratio when undercollateralized
    if collateral_ratio < 1.0:
        awareness = 1.0 - collateral_ratio
        panic_awareness = awareness ** 1.5
        fundamental_price = collateral_ratio
        price = base_price * (1 - panic_awareness) + fundamental_price * panic_awareness
    else:
        price = base_price

    # Liquidity slippage
    liquidity_ratio = L / params.initial_liquidity
    if liquidity_ratio < 0.5:
        slippage_factor = (liquidity_ratio / 0.5) ** 2
        price *= slippage_factor

    return max(price, 0.001)


def update_collateral(
    C: float,
    P: float,
    S: float,
    shock: float = 0.0
) -> float:
    """Collateral with reflexive crash (LUNA-UST style)."""
    C_new = C * (1.0 + shock)

    # Reflexivity: depeg causes collateral crash
    if P < 0.9:
        depeg_severity = (0.9 - P) / 0.9
        reflexive_crash = depeg_severity * 0.2
        C_new *= (1.0 - reflexive_crash)

    return max(C_new, 0.0)


def update_liquidity(
    L: float,
    P: float,
    S: float,
    C: float,
    params: SystemParameters
) -> float:
    """Liquidity FLEES crisis."""
    collateral_ratio = C / S if S > 0 else 1.0

    # Base flow (positive when stable)
    stability = 1.0 - abs(P - 1.0)
    base_flow = 0.02 * stability

    # Instability penalty
    if abs(P - 1.0) > 0.05:
        instability_penalty = -0.15 * abs(P - 1.0)
    else:
        instability_penalty = 0.0

    # CR penalty
    if collateral_ratio < 1.0:
        cr_penalty = -0.2 * (1.0 - collateral_ratio)
    else:
        cr_penalty = 0.0

    # Bank run dynamics
    liquidity_ratio = L / params.initial_liquidity
    if liquidity_ratio < 0.5:
        bank_run_penalty = -0.25 * (0.5 - liquidity_ratio)
    else:
        bank_run_penalty = 0.0

    total_flow = base_flow + instability_penalty + cr_penalty + bank_run_penalty
    L_new = L * (1.0 + total_flow)
    return max(L_new, params.initial_liquidity * 0.01)


def update_demand(
    D: float,
    P: float,
    S: float,
    C: float,
    L: float,
    params: SystemParameters
) -> float:
    """Demand with panic tipping points."""
    collateral_ratio = C / S if S > 0 else 1.0
    liquidity_ratio = L / params.initial_liquidity if params.initial_liquidity > 0 else 1.0

    # Normal elasticity
    price_effect = -params.demand_elasticity * (P - 1.0)

    panic_factor = 0.0

    # Collateral panic
    if collateral_ratio < 1.0:
        deficit = 1.0 - collateral_ratio
        panic_factor -= 0.5 * deficit ** 1.5
        if collateral_ratio < 0.7:
            panic_factor -= 0.3

    # Price panic
    if P < 0.9:
        price_panic = (0.9 - P) / 0.9
        panic_factor -= 0.4 * price_panic ** 1.5
        if P < 0.7:
            panic_factor -= 0.25

    # Liquidity panic
    if liquidity_ratio < 0.3:
        liquidity_panic = (0.3 - liquidity_ratio) / 0.3
        panic_factor -= 0.5 * liquidity_panic

    total_change = (price_effect + panic_factor) * D
    return max(D + total_change, params.initial_demand * 0.01)


def simulate_step(
    state: Tuple[float, float, float, float, float],
    params: SystemParameters,
    collateral_shock: float = 0.0,
    liquidity_shock: float = 0.0
) -> Tuple[float, float, float, float, float]:
    """Simulate one step with death spiral dynamics."""
    S, P, C, L, D = state

    C_new = update_collateral(C, P, S, collateral_shock)
    L_new = update_liquidity(L, P, S, C_new, params)
    L_new = L_new * (1.0 + liquidity_shock)
    D_new = update_demand(D, P, S, C_new, L_new, params)
    S_new = update_supply(S, P, L_new, C_new, params)
    P_new = update_price(S_new, D_new, L_new, C_new, params)

    return (S_new, P_new, C_new, L_new, D_new)
