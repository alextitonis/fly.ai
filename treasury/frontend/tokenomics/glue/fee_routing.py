"""
FeeSplitter + ShitBurner — SHIT-specific fee routing.
~40 lines. No OSS equivalent.
"""

def fee_routing_policy(params, substep, state_history, previous_state):
    """Policy: compute fee routing inputs from current state."""
    treasury_pct = params.get('feeSplitTreasury', 0.60) if isinstance(params, dict) else 0.60
    # Use total supply * price as DEX volume proxy (entire token economy)
    supply = abs(previous_state.get('supply', 100e6) or 100e6)
    price = previous_state.get('price', 1.0) or 1.0
    dex_volume = supply * price * 0.15  # 15% of supply traded per epoch
    dex_fees = dex_volume * 0.005  # 50bps total DEX fees
    perp_funding = abs(previous_state.get('perp_funding_accum', 0) or 0)
    perp_fees = perp_funding * price * 0.01
    total_fees = dex_fees + perp_fees
    return {
        'pol_fees': total_fees * treasury_pct,
        'yield_fees': total_fees * (1 - treasury_pct),
    }

def fee_routing_step(params, substep, state_history, previous_state, policy_input):
    """Route DEX swap fees to treasury + staking, burn portion of SHIT."""
    p = params.get('fee_routing', {})
    treasury_pct = p.get('feeSplitTreasury', 0.60)
    staking_pct = p.get('feeSplitStaking', 0.40)
    burn_pct = p.get('burnRate', 0.10)

    # Fee sources from policy
    dex_fees = policy_input.get('dex_fees', 0)
    perp_fees = policy_input.get('perp_fees', 0)
    lending_fees = policy_input.get('lending_fees', 0)

    total_fees = dex_fees + perp_fees + lending_fees

    # Split between treasury and staking
    treasury_share = total_fees * treasury_pct
    staking_share = total_fees * staking_pct

    # Burn portion of SHIT from fees (deflationary)
    shit_price = previous_state.get('price', 1.0)
    shit_to_burn = (total_fees * burn_pct) / shit_price if shit_price > 0 else 0

    current_shit_supply = previous_state.get('shit_supply', 0)
    new_shit_supply = current_shit_supply - shit_to_burn

    return {
        'fee_treasury_inflow': treasury_share,
        'fee_staking_inflow': staking_share,
        'fee_total': total_fees,
        'shit_burned': shit_to_burn,
        'shit_supply': new_shit_supply,
    }
