from ..types import StateType


def s_supply(_params, substep, state_history, state: StateType, _input) -> tuple:
    supply = max((state['supply'] - state['reserves_in'] / state['price'] +
                  state['ask_change_shit'] - state['bid_change_shit']) * (1 + state['reward_rate']), 0)
    return ("supply", supply)
