from ..types import StateType


def s_supply(_params, substep, state_history, state: StateType, _input) -> tuple:
    prior_supply = state['supply']
    price = state['price']
    # Guard against reserves_in/price exploding when price crashes toward zero
    # (e.g. weekly treasury rebalancing combined with a temporarily low price).
    # Without this, a single epoch can wipe out nearly all supply, cascading
    # into NAV/floor price spikes downstream. Cap the reserves_in-driven supply
    # change to a bounded fraction of prior supply per epoch.
    if price > 0:
        reserves_in_supply_delta = state['reserves_in'] / price
        max_delta = abs(prior_supply) * 0.5  # max 50% of supply removed/added per epoch
        if reserves_in_supply_delta > max_delta:
            reserves_in_supply_delta = max_delta
        elif reserves_in_supply_delta < -max_delta:
            reserves_in_supply_delta = -max_delta
    else:
        reserves_in_supply_delta = 0
    supply = max((prior_supply - reserves_in_supply_delta +
                  state['ask_change_shit'] - state['bid_change_shit']) * (1 + state['reward_rate']), 0)
    return ("supply", supply)
