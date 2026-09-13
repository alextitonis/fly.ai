from ..types import StateType, ParamsType
from ..types import MarketDemandSupply


def update_market_demand(state: StateType, params: ParamsType, _input):
    out = MarketDemandSupply(total_supply=_input["market_supply"],
                             total_demand=_input["market_demand"])

    return out


def update_net_flow(state: StateType, params: ParamsType, _input):
    # At the moment this is just a pass through function
    # But in the future it could update multiple things like if there is a class object that also needs net flow updated

    return _input["net_flow"]
