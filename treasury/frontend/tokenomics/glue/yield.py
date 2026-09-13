"""
wstSHIT wrap/unwrap + yield routing — SHIT-specific.
Uses Pendle PY index math from oss.pendle.py_index for wstSHIT
yield accounting (monotonic high-water mark index).
"""

import sys
sys.path.insert(0, '/tokenomics')

from oss.pendle.py_index import PyIndex, MarketState, get_market_view, buy_pt, sell_pt

_py_index = None
_market = None


def _get_py_index(params):
    global _py_index
    if _py_index is None:
        p = params if isinstance(params, dict) else {}
        initial_rate = p.get('pendleInitialSyRate', 1.0)
        _py_index = PyIndex(initial_rate)
    return _py_index


def _get_market(params):
    global _market
    if _market is None:
        p = params if isinstance(params, dict) else {}
        _market = MarketState(
            total_pt=p.get('pendleTotalPt', 5e6),
            total_asset=p.get('pendleTotalAsset', 5e6),
            rate_scalar=p.get('pendleRateScalar', 10.0),
            rate_anchor=p.get('pendleRateAnchor', 1.0),
            time_to_expiry=p.get('pendleTimeToExpiry', 365 * 24 * 3600),
        )
    return _market


def yield_policy(params, substep, state_history, previous_state):
    """Policy: compute yield routing using Pendle PY index."""
    p = params if isinstance(params, dict) else {}
    morpho_apy = p.get('morphoApy', 0.05)
    gamma_apy = p.get('gammaApy', 0.08)
    steer_apy = p.get('steerApy', 0.06)
    yield_capital = abs(previous_state.get('yield_capital', 0) or 0)
    weighted_apy = 0.40 * morpho_apy + 0.30 * gamma_apy + 0.30 * steer_apy
    yield_generated = yield_capital * weighted_apy / 365

    # Pendle PY index: update with current yield
    py_idx = _get_py_index(params)
    current_sy_rate = 1.0 + weighted_apy * (previous_state.get('timestep', 0) / 365.0)
    py_idx.set_sy_exchange_rate(current_sy_rate)
    py_idx.update_py_index()

    # Pendle market view for implied APY
    market = _get_market(params)
    market_view = get_market_view(market)

    current_wst = previous_state.get('wst_shit_supply', 10e6) or 10e6
    wrap_growth = current_wst * 0.001
    return {
        'wst_shit_supply': current_wst + wrap_growth,
        'yield_generated': yield_generated,
        'pendle_py_index': py_idx.py_index_current(),
        'pendle_stress_gap': py_idx.stress_gap(),
        'pendle_implied_apy': market_view['implied_apy'],
        'pendle_pt_price': market_view['pt_price'],
    }

def yield_step(params, substep, state_history, previous_state, policy_input):
    """wstSHIT wrapping ratio + yield source routing."""
    p = params.get('yield', {})

    # wstSHIT wrap ratio (Lido WstETH pattern)
    st_shit_supply = previous_state.get('st_shit_supply', 1e18)
    wst_shit_supply = previous_state.get('wst_shit_supply', 1e18)
    rebase_index = previous_state.get('rebase_index', 1.0)

    # Conversion: wstSHIT = stSHIT * rebase_index
    wrap_ratio = rebase_index if rebase_index > 0 else 1.0

    # Wrapping/unwrapping activity
    wrap_amount = policy_input.get('wrap_amount', 0)
    unwrap_amount = policy_input.get('unwrap_amount', 0)

    new_st_shit = st_shit_supply + unwrap_amount - wrap_amount
    new_wst_shit = wst_shit_supply + (wrap_amount / wrap_ratio) - (unwrap_amount / wrap_ratio)

    # Yield routing across protocols
    total_yield_capital = previous_state.get('yield_capital', 0)
    morpho_pct = p.get('morphoAllocation', 0.40)
    gamma_pct = p.get('gammaAllocation', 0.30)
    steer_pct = p.get('steerAllocation', 0.30)

    morpho_apy = policy_input.get('morpho_apy', 0.05)
    gamma_apy = policy_input.get('gamma_apy', 0.08)
    steer_apy = policy_input.get('steer_apy', 0.06)

    weighted_apy = (morpho_pct * morpho_apy + gamma_pct * gamma_apy + steer_pct * steer_apy)
    yield_revenue = total_yield_capital * weighted_apy / 365  # Daily

    return {
        'st_shit_supply': new_st_shit,
        'wst_shit_supply': new_wst_shit,
        'wst_shit_wrap_ratio': wrap_ratio,
        'yield_revenue': yield_revenue,
        'blended_apy': weighted_apy,
    }
