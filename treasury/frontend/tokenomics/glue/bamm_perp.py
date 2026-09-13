"""
BAMM (ERC-4626 leverage vault) + GMX V1 perp funding model.
~80 lines. No OSS equivalent — pure SHIT design.
"""

import numpy as np

def bamm_perp_policy(params, substep, state_history, previous_state):
    """Policy: compute BAMM/perp inputs from current state."""
    funding_rate = params.get('perpFundingRate', 0.001) if isinstance(params, dict) else 0.001
    price = previous_state.get('price', 1.0) or 1.0
    vault_assets = previous_state.get('bamm_vault_assets', 0) or 0
    vault_shares = previous_state.get('bamm_vault_shares', 1e18) or 1e18
    vault_liabilities = previous_state.get('bamm_vault_liabilities', 0) or 0
    perp_oi = previous_state.get('perp_open_interest', 0) or 0
    funding_payment = perp_oi * funding_rate
    # Grow vault assets from yield (5% APY on assets)
    vault_assets += vault_assets * 0.05 / 365
    # Open interest grows with price volatility
    price_change = abs(price - (previous_state.get('price', 1.0) or 1.0)) / max(price, 0.01)
    perp_oi += perp_oi * price_change * 0.1 + 1000  # Base growth + volatility-driven
    return {
        'bamm_vault_assets': vault_assets,
        'bamm_vault_shares': vault_shares,
        'bamm_vault_liabilities': vault_liabilities,
        'perp_open_interest': perp_oi,
        'perp_funding_accum': previous_state.get('perp_funding_accum', 0) + funding_payment,
    }

def bamm_perp_step(params, substep, state_history, previous_state, policy_input):
    """Single epoch step for BAMM leverage vault + perp funding."""
    p = params.get('bamm_perp', {})
    max_lev = p.get('bammMaxLeverage', 3.0)
    funding_rate = p.get('perpFundingRate', 0.001)
    liq_step = p.get('partialLiquidationStep', 0.50)
    max_liq_steps = p.get('maxLiquidationSteps', 2)

    # BAMM vault state
    vault_assets = previous_state.get('bamm_vault_assets', 0)
    vault_shares = previous_state.get('bamm_vault_shares', 1e18)
    vault_liabilities = previous_state.get('bamm_vault_liabilities', 0)
    perp_open_interest = previous_state.get('perp_open_interest', 0)
    perp_funding_accum = previous_state.get('perp_funding_accum', 0)

    # Price input from policy
    price = policy_input.get('price', previous_state.get('price', 1.0))
    prev_price = previous_state.get('price', 1.0)
    price_change = (price - prev_price) / prev_price if prev_price > 0 else 0

    # Funding rate payment (longs pay shorts if price up, vice versa)
    funding_payment = perp_open_interest * funding_rate
    perp_funding_accum += funding_payment

    # PnL on open interest
    perp_pnl = perp_open_interest * price_change

    # Leverage ratio check
    leverage = vault_liabilities / vault_assets if vault_assets > 0 else 0

    # Liquidation cascade if leverage exceeds max
    liquidations = 0
    if leverage > max_lev:
        for _ in range(max_liq_steps):
            if leverage <= max_lev:
                break
            liq_amount = vault_liabilities * liq_step
            vault_liabilities -= liq_amount
            vault_assets -= liq_amount / max_lev  # Collateral seized
            liquidations += 1
            leverage = vault_liabilities / vault_assets if vault_assets > 0 else 0

    # Share price update
    share_price = vault_assets / vault_shares if vault_shares > 0 else 1.0

    # New deposits/withdrawals from policy
    new_deposits = policy_input.get('bamm_deposits', 0)
    new_withdrawals = policy_input.get('bamm_withdrawals', 0)
    new_shares = new_deposits / share_price if share_price > 0 else 0

    vault_assets += new_deposits - new_withdrawals
    vault_shares += new_shares - (new_withdrawals / share_price if share_price > 0 else 0)

    return {
        'bamm_vault_assets': vault_assets,
        'bamm_vault_shares': vault_shares,
        'bamm_vault_liabilities': vault_liabilities,
        'perp_open_interest': perp_open_interest,
        'perp_funding_accum': perp_funding_accum,
        'bamm_share_price': share_price,
        'bamm_liquidations': liquidations,
        'bamm_leverage': leverage,
    }
