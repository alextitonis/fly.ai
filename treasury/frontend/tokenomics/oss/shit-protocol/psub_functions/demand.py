from ..behavioral.demand import market_demand_behavioral
from ..mechanism.demand import update_market_demand, update_net_flow


def p_demand(_params, substep, state_history, state) -> dict:
    output = market_demand_behavioral(state, _params)
    return output


def s_demand(_params, substep, state_history, state, _input) -> tuple:
    out = update_market_demand(state, _params, _input)

    return ("market_demand_supply", out)


def s_netflow(_params, substep, state_history, state, _input):
    out = update_net_flow(state, _params, _input)

    return ("net_flow", out)
