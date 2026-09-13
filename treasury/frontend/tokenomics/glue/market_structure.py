"""
LBP Dutch auction + impact token allocations — SHIT-specific.
~30 lines. General liquidity delegated to SHIT Protocol liquidity.py.
"""

def market_structure_policy(params, substep, state_history, previous_state):
    """Policy: compute market structure inputs from current state."""
    lbp_duration = params.get('lbpDuration', 14) if isinstance(params, dict) else 14
    current_epoch = previous_state.get('timestep', 0)
    # POL inflow from net flows during LBP, then from treasury reserves
    net_flow = abs(previous_state.get('net_flow', 0) or 0)
    if current_epoch < lbp_duration:
        pol_inflow = net_flow * 0.10  # 10% of net flow to POL during LBP
    else:
        pol_inflow = net_flow * 0.05  # 5% after LBP
    pol_outflow = 0  # No outflow unless liquidating
    return {
        'pol_inflow': pol_inflow,
        'pol_outflow': pol_outflow,
    }

def market_structure_step(params, substep, state_history, previous_state, policy_input):
    """LBP price discovery + impact token allocation tracking."""
    p = params.get('market_structure', {})
    lbp_duration = p.get('lbpDuration', 14)
    allocations = p.get('impactTokenAllocations', {})

    current_epoch = previous_state.get('timestep', 0)
    lbp_active = current_epoch < lbp_duration

    # LBP Dutch auction: weight shifts from SHIT to reserve over time
    if lbp_active:
        progress = current_epoch / lbp_duration
        shit_weight = 0.80 * (1 - progress) + 0.20
        reserve_weight = 1.0 - shit_weight
    else:
        shit_weight = 0.20
        reserve_weight = 0.80

    # Impact token NAV tracking
    impact_nav = 0
    for token, alloc_pct in allocations.items():
        token_price = policy_input.get(f'impact_price_{token}', 1.0)
        token_supply = previous_state.get(f'impact_supply_{token}', 1e18)
        impact_nav += token_price * token_supply * alloc_pct

    # POL management
    pol_value = previous_state.get('pol_value', 0)
    pol_inflow = policy_input.get('pol_inflow', 0)
    pol_outflow = policy_input.get('pol_outflow', 0)

    return {
        'lbp_active': lbp_active,
        'lbp_shit_weight': shit_weight,
        'lbp_reserve_weight': reserve_weight,
        'impact_nav': impact_nav,
        'pol_value': pol_value + pol_inflow - pol_outflow,
    }
