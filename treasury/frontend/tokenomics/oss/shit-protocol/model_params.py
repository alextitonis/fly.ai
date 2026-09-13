from .primitives import USD,SHIT,day, PlaceholderTypeDemandSupply
from typing import TypedDict
from .compound import MarketDemandSupply

StateType = TypedDict('StateType', {
                      'reward_rate':float,
                      'liq_stables':USD,
                      'liq_shit':SHIT, # same like liq_stables, but in the unit of shit 
                      'reserves_stables':USD,
                      'treasury_stables':USD,
                      'liq_backing':USD,
                      
                      'supply':SHIT,
                      'floating_supply':SHIT,
                    #   'price':USD/SHIT,
                    #   'ma_target':USD/SHIT,
                      'reserves_in':USD,
                      'target_liq_ratio_reached':bool,
                      'ask_change_shit':SHIT,
                      'bid_change_shit':SHIT,
                      'market_demand_supply': MarketDemandSupply,
                      "net_flow": USD,
                      'amm_k':float,})
ParamsType = TypedDict('ParamsType', {
                        'target_ma':day,
                        'demand_factor': PlaceholderTypeDemandSupply, 'supply_factor': PlaceholderTypeDemandSupply,
                        "reinstate_window": int})
