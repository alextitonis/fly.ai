"""
Bucky peg stability via Curve PegKeeper (oss.curve.peg_keeper_call).
Uses the actual Curve pool math and PegKeeper update logic.
"""
import sys
sys.path.insert(0, '/tokenomics')

from oss.curve.peg_keeper_call import get_price, update as pk_update, preset_curve, usd_amount

_pool = None


def _get_pool(params):
    global _pool
    if _pool is None:
        _pool = preset_curve(0)
    return _pool


def bucky_peg_policy(params, substep, state_history, previous_state):
    """Run PegKeeper update and compute Bucky peg deviation."""
    pool = _get_pool(params)
    p = params if isinstance(params, dict) else {}

    external_price = previous_state.get('price', 1.0) or 1.0
    shock = p.get('buckyShock', 0.0) if isinstance(params, dict) else 0.0

    if shock != 0:
        dx = int(abs(shock) * usd_amount * 10 ** 18 * 0.1)
        i = 0 if shock < 0 else 1
        try:
            pool.exchange(i, 1 - i, dx)
        except Exception:
            pass

    pool_price = get_price(pool)

    debt_change, profit, caller_profit = pk_update(pool)

    new_pool_price = get_price(pool)
    peg_deviation = abs(new_pool_price - 1.0)

    return {
        'bucky_price': new_pool_price,
        'bucky_peg_deviation': peg_deviation,
        'pegkeeper_debt_change': debt_change / 1e18,
        'pegkeeper_profit': profit / 1e18,
        'pegkeeper_caller_profit': caller_profit / 1e18,
    }
