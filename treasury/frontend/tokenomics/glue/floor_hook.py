"""
Uniswap V4 floor hook fee routing — SHIT-specific.
~50 lines. Price floor logic delegated to SHIT Protocol price.py.
"""
import random as _random

def floor_hook_policy(params, substep, state_history, previous_state):
    """Policy: compute V4 hook fees from swap volume."""
    floor_pct = params.get('floorFeeSplit', 0.70) if isinstance(params, dict) else 0.70
    band_split = params.get('floorBandSplit', 0.50) if isinstance(params, dict) else 0.50

    # Use total supply * price as swap volume proxy (entire token economy)
    supply = abs(previous_state.get('supply', 100e6) or 100e6)
    price = previous_state.get('price', 1.0) or 1.0
    swap_volume = supply * price * 0.15  # 15% of total supply traded per epoch
    sell_volume = swap_volume * 0.5

    total_fees = swap_volume * 0.005  # 50bps V4 hook fee (higher than standard 30bps)
    floor_fees = total_fees * floor_pct
    band_fees = total_fees * (1 - floor_pct)
    floor_absorb = floor_fees * band_split
    band_topup = floor_fees * (1 - band_split)
    shit_absorbed = sell_volume * 0.001 / price if price > 0 else 0  # 10bps absorption

    # Redemption events: holders redeem SHIT for a proportional share of the floor
    # reserve. Driven by UI "Redemption Probability" / "Redemption Size" sliders.
    p2 = params if isinstance(params, dict) else {}
    redemption_prob = p2.get('redemptionProbability', 0.0) or 0.0
    redemption_size_pct = p2.get('redemptionSizePct', 0.0) or 0.0
    epoch = previous_state.get('timestep', 0)
    _random.seed((int(epoch) * 7919 + 12345) & 0xffffffff)
    redemption_shit = 0.0
    redemption_value = 0.0
    if redemption_prob > 0 and _random.random() < redemption_prob:
        redemption_shit = supply * redemption_size_pct
        floor_reserve = previous_state.get('floor_reserve', 0) or 0
        redemption_value = floor_reserve * redemption_size_pct

    return {
        'floor_fees': floor_absorb,
        'band_fees': band_topup + band_fees,
        'shit_absorbed': shit_absorbed,
        'total_fees': total_fees,
        'redemption_shit': redemption_shit,
        'redemption_value': redemption_value,
    }

def floor_hook_fees(params, substep, state_history, previous_state, policy_input):
    """Process V4 hook fees: split between floor and band."""
    p = params.get('floor_hook', {})
    floor_pct = p.get('floorFeeSplit', 0.70)
    band_split = p.get('floorBandSplit', 0.50)

    swap_volume = policy_input.get('swap_volume', 0)
    sell_volume = policy_input.get('sell_volume', 0)

    # Total fees collected by hook
    total_fees = swap_volume * 0.003  # 30bps V4 fee

    # 70% of fees go to floor, 30% to band
    floor_fees = total_fees * floor_pct
    band_fees = total_fees * (1 - floor_pct)

    # Floor side: 50/50 split between floor absorption and band top-up
    floor_absorb = floor_fees * band_split
    band_topup = floor_fees * (1 - band_split)

    # SHIT absorbed from sells (deflationary pressure)
    shit_absorbed = sell_volume * 0.001  # 10bps absorption rate

    return {
        'floor_fees': floor_absorb,
        'band_fees': band_topup + band_fees,
        'shit_absorbed': shit_absorbed,
        'total_fees': total_fees,
    }


def floor_hook_state_update(params, substep, state_history, previous_state, policy_input):
    """Update floor and band state from hook fees."""
    fees = floor_hook_fees(params, substep, state_history, previous_state, policy_input)

    new_floor_reserve = previous_state.get('floor_reserve', 0) + fees['floor_fees']
    new_band_reserve = previous_state.get('band_reserve', 0) + fees['band_fees']
    new_shit_supply = previous_state.get('shit_supply', 0) - fees['shit_absorbed']

    return {
        'floor_reserve': new_floor_reserve,
        'band_reserve': new_band_reserve,
        'shit_supply': new_shit_supply,
    }
