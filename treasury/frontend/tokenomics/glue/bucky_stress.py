"""
Bucky stress testing via crvUSD risk model (oss.crvusdrisk.pyodide_sim).
Uses the actual agent-based stress test with Curve pool math and
stablecoin death-spiral dynamics.
"""
import sys
sys.path.insert(0, '/tokenomics')

from oss.crvusdrisk.pyodide_sim import StressScenario

_scenario = None


def _get_scenario(params):
    global _scenario
    if _scenario is None:
        p = params if isinstance(params, dict) else {}
        _scenario = StressScenario(
            initial_supply=p.get('buckyInitialSupply', 1e6),
            initial_collateral=p.get('buckyInitialCollateral', 1.5e6),
            initial_liquidity=p.get('buckyInitialLiquidity', 1e6),
        )
    return _scenario


def bucky_stress_policy(params, substep, state_history, previous_state):
    """Run crvUSD risk model stress test step."""
    scenario = _get_scenario(params)
    p = params if isinstance(params, dict) else {}

    coll_shock = p.get('stressCollateralShock', 0.0)
    liq_shock = p.get('stressLiquidityShock', 0.0)
    external_price = previous_state.get('price', 1.0) or 1.0

    result = scenario.step(
        collateral_shock=coll_shock,
        liquidity_shock=liq_shock,
        external_price=external_price,
    )

    return {
        'bucky_stress_price': result['price'],
        'bucky_stress_supply': result['supply'],
        'bucky_stress_tcr': result['tcr'],
        'bucky_stress_peg_dev': result['peg_deviation'],
        'bucky_stress_keeper_profit': result['keeper_profit'],
        'bucky_stress_arb_profit': result['arb_profit'],
        'bucky_stress_liq_count': result['liquidation_count'],
    }
