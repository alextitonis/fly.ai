"""
Bucky DSS (CDP) via Liquity economic model (oss.liquity.economic_model).
Uses the actual BoldProtocolEconomicModel for trove management.
"""
import sys
sys.path.insert(0, '/tokenomics')

from oss.liquity.economic_model import BoldProtocolEconomicModel

_model = None


def _get_model(params):
    global _model
    if _model is None:
        p = params if isinstance(params, dict) else {}
        initial_price = p.get('buckyCollateralPrice', 2000.0)
        _model = BoldProtocolEconomicModel(initial_price=initial_price)

        # Seed with some troves
        for i in range(10):
            try:
                _model.open_trove(
                    owner=f"whale_{i}",
                    collateral=100.0,
                    debt=100000.0,
                    interest_rate=0.05,
                )
            except Exception:
                pass
    return _model


def bucky_dss_policy(params, substep, state_history, previous_state):
    """Run Bucky CDP model step using Liquity economic model."""
    model = _get_model(params)
    p = params if isinstance(params, dict) else {}

    coll_shock = p.get('buckyCollateralShock', 0.0)

    current_price = model.price_feed.fetch_price()
    new_price = current_price * (1.0 + coll_shock)

    model.update_time(28800)  # 8 hours per epoch

    liquidatable = []
    if coll_shock != 0:
        liquidatable = model.update_price(new_price)

    state = model.get_system_state()

    return {
        'bucky_tcr': state['tcr'],
        'bucky_active_coll': state['active_coll'],
        'bucky_active_debt': state['active_debt'],
        'bucky_stability_pool_size': state['stability_bold'],
        'bucky_active_troves': state['active_troves'],
        'bucky_liquidations': len(liquidatable),
    }
