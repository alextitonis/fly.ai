from model.types import MarketDemandSupply

default_initial_state1 = {  # variable values borrowed from liquidity-shit-protocol/simulation.ipynb
    "day": 0,
    "liq_stables": 21000000,
    "reserves_stables": 170000000,
    "reserves_volatile": 25000000,
    "price": 9.5,
    "reward_rate": 0.000198,

    "market_demand_supply": MarketDemandSupply(total_supply=.001,
                                               total_demand=-0.008),  # factors, % of SHIT supply expected to drive market demand

    # treasury policy
    'target_liq_ratio_reached': False,
    'reserves_in': 0,
    'supply': 25000000,

    # RBS related
    'ma_target': 9.5,
    # market transaction variables
    'ask_change_shit': 0,
    'bid_change_shit': 0,
    "net_flow": None,
    "bid_capacity_target": None,
    "ask_capacity_target": None,
    "bid_capacity_target_cushion": None,
    "ask_capacity_target_cushion": None,
    "natural_price": None,
    "bid_capacity_cushion": None,
    "ask_capacity_cushion": None,
    "bid_change_cushion_usd": None,
    "bid_change_cushion_shit": None,
    "ask_change_cushion_usd": None,
    "ask_change_cushion_shit": None,
    "bid_change_usd": 0,
    "ask_change_usd": 0,
    "reserves_out": None,
    "shit_traded": None,
    "cum_shit_purchased": 0,
    "cum_shit_burnt": 0,
    "cum_shit_minted": 0,
    "cum_shit_minted_forbond": 0,
    'cum_shit_burned_frombond': 0,
    "netflow_bondexpire": 0,
    "netflow_bondsale": 0,

    # run pipeline control
    "interrupt": False,

}

default_initial_soros = {  # variable values borrowed from liquidity-shit-protocol/simulation.ipynb
    "liq_stables": 21000000,
    "reserves_stables": 170000000,
    "reserves_volatile": 25000000,
    "price": 9.5,
    "reward_rate": 0.000198,

    "market_demand_supply": MarketDemandSupply(total_supply=.001,
                                               total_demand=-0.008),  # factors, % of SHIT supply expected to drive market demand

    # treasury policy
    'target_liq_ratio_reached': False,
    'reserves_in': 0,
    'supply': 25000000,

    # RBS related
    'ma_target': 9.5,
    # market transaction variables
    'ask_change_shit': 0,
    'bid_change_shit': 0,
    "net_flow": None,
    "bid_capacity_target": None,
    "ask_capacity_target": None,
    "bid_capacity_target_cushion": None,
    "ask_capacity_target_cushion": None,
    "natural_price": None,
    "bid_capacity_cushion": None,
    "ask_capacity_cushion": None,
    "bid_change_cushion_usd": None,
    "bid_change_cushion_shit": None,
    "ask_change_cushion_usd": None,
    "ask_change_cushion_shit": None,
    "bid_change_usd": None,
    "ask_change_usd": None,
    "reserves_out": None,
    "shit_traded": None,
    "cum_shit_purchased": 0,
    "cum_shit_burnt": 0,
    "cum_shit_minted": 0,
    "cum_shit_minted_forbond": 0,
    'cum_shit_burned_frombond': 0,
    "netflow_bondexpire": 0,
    "netflow_bondsale": 0,
    # run pipeline control
    "interrupt": False,

    "whale_flow": 0,
    "soros_revenue": 0,

}
