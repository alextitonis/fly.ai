from .psub_functions.demand import p_demand, s_demand, s_netflow
from .psub_functions.reward_rate import p_reward_rate, s_reward_rate
from .psub_functions.amm_k import s_amm_k
from .psub_functions.treasury import p_treasury, s_liq_stables, s_liq_shit, s_price, s_reserves_out, s_reserves_stables, s_shit_traded, s_cum_shit_purchased, s_cum_shit_burnt, s_cum_shit_minted
from .psub_functions.protocol import p_protocol, s_floating_supply, s_mcap, s_floating_mcap, s_liq_ratio, s_target_liq_ratio_reached, s_reserves_ratio, s_fmcap_treasury_ratio, s_liq_fmcap_ratio, s_total_demand, s_total_supply, s_total_net
from .mechanism.supply import s_supply
from .mechanism.treasury import s_treasury_stables, s_liq_backing, s_reserves_in
from .policy.treasury import p_reserves_in
from .mechanism.rbs_price import s_ma_target, s_lb_target, s_price_history, s_price_target, s_upper_target_wall, s_lower_target_wall, s_lower_target_cushion, s_upper_target_cushion, s_bid_counter, s_ask_counter
from .policy.rbs_price import p_price_target, p_target_walls, p_target_cushions, p_bid_counter, p_ask_counter
from .psub_functions.target_capacity import p_target_capacity, s_bid_capacity_target, s_ask_capacity_target, s_bid_capacity_target_cushion, s_ask_capacity_target_cushion, s_natural_price
from .psub_functions.treasury_market_operations import (p_real_bid_capacity_cushion, p_real_ask_capacity_cushion, s_bid_capacity_cushion, s_ask_capacity_cushion,
                                                        p_effective_bid_capacity_cushion, p_effective_ask_capacity_cushion, s_bid_change_cushion_usd, s_bid_change_cushion_shit, s_ask_change_cushion_usd, s_ask_change_cushion_shit,
                                                        p_real_bid_capacity_totals, p_real_ask_capacity_totals, s_bid_capacity, s_ask_capacity,
                                                        p_effective_bid_capacity_changes_totals, p_effective_ask_capacity_changes_totals, s_bid_change_shit, s_bid_change_usd, s_ask_change_shit, s_ask_change_usd,
                                                        )
from .psub_functions.shitbond import p_bond_create, s_bond_create, s_bond_created_today, s_shit_bonded, s_bond_expire, s_shit_bonded_after_release, s_netflow_bondexpire, p_bond_expire, p_bond_sell, s_liq_shit_into_bond, s_cum_shit_minted_forbond, s_cum_shit_burned_frombond, s_netflow_bondsale

from .mechanism.supply import s_supply
from .mechanism.treasury import s_treasury_stables, s_liq_backing, s_reserves_in
from .policy.treasury import p_reserves_in
from .policy.utility import p_list_params
from .psub_functions.utility import s_list_params, s_interrupt
from .psub_functions.soros import p_soros_whale, s_soros_whale, s_soros_whale_flow, p_soros_revenue, s_soros_revenue, p_soros_whale_reaction, s_soros_whale_reaction

meta_block = {'policies': {
    'params': p_list_params
},
    'variables': {
        'demand_factor': s_list_params("demand_factor"),
        'supply_factor': s_list_params("supply_factor"),
        'bond_annual_discount_rate': s_list_params("bond_annual_discount_rate"),
        'shit_bond_to_netflow_ratio': s_list_params("shit_bond_to_netflow_ratio"),
        'bond_schedule_name': s_list_params("bond_schedule_name"),
        'panic_sell_on':s_list_params("panic_sell_on"),
        'panic_param':s_list_params("panic_param")
}}

reward_rate_block = {'policies': {
    'reward_rate': p_reward_rate
},
    'variables': {
        'reward_rate': s_reward_rate,
}}

demand_block = {
    'policies': {
        'supply_demand': p_demand
    },
    'variables': {
        'market_demand_supply': s_demand,  # factors
        'net_flow': s_netflow
    }
}

treasury_stables_block = {  # Warning: this part is actually "treasury_stables from yesterday"
    "policies": {},
    "variables": {
        "treasury_stables": s_treasury_stables
    }
}

liq_backing_block = {  # Warning: this part is actually "treasury_stables from yesterday"
    "policies": {},
    "variables": {
        "liq_backing": s_liq_backing
    }
}

price_history_block = {
    "policies": {},
    "variables": {
        "price_history": s_price_history
    }
}

# ---- RBS-----

reinstate_counter_block = {
    'policies': {
        'bid_counter': p_bid_counter,
        'ask_counter': p_ask_counter
    },
    'variables': {
        'bid_counter': s_bid_counter,
        'ask_counter': s_ask_counter
    }

}


price_target_block1 = {
    'policies': {},
    'variables': {
        'ma_target': s_ma_target,
        'lb_target': s_lb_target,
    }
}

price_target_block2 = {
    'policies': {
        'price_target': p_price_target
    },
    'variables': {
        'price_target': s_price_target,
    }
}

target_walls_block = {
    'policies': {
        'target_walls': p_target_walls
    },
    'variables': {
        'upper_target_wall': s_upper_target_wall,
        "lower_target_wall": s_lower_target_wall
    }
}

cushions_block = {
    'policies': {
        'target_cushions': p_target_cushions
    },
    'variables': {
        'lower_target_cushion': s_lower_target_cushion,
        'upper_target_cushion': s_upper_target_cushion
    }
}
# ---shit bond----
bond_creation_block = {
    'policies': {
        'create_bond': p_bond_create
    },
    'variables': {
        'bond_created': s_bond_create,
        'bond_created_today': s_bond_created_today,
        'shit_bonded': s_shit_bonded,
        'cum_shit_minted_forbond': s_cum_shit_minted_forbond,

    }
}

bond_sell_block = {
    'policies': {
        'bond_sell': p_bond_sell
    },
    'variables': {
        'cum_shit_burned_frombond': s_cum_shit_burned_frombond,
        'netflow_bondsale': s_netflow_bondsale
    }
}

bond_expiration_block = {
    'policies': {
        'bond_expired': p_bond_expire

    },
    'variables': {
        'shit_released': s_bond_expire,
        # not sure: is this the best way to update this variable for the second time in a step?
        'shit_bonded': s_shit_bonded_after_release,
        'netflow_bondexpire': s_netflow_bondexpire
    }
}
# ---system----

supply_block = {
    'policies': {

    },
    'variables': {
        'supply': s_supply
    }
}


reserves_in_block = {
    'policies': {
        "reserves_in": p_reserves_in
    },
    'variables': {
        'reserves_in': s_reserves_in
    }
}

amm_k_block = {
    'policies': {},
    'variables': {
        'amm_k': s_amm_k,  # Note: for now it's actually constant k
    }
}

target_capacities_block = {
    'policies': {
        "target_capacity": p_target_capacity
    },
    'variables': {
        "bid_capacity_target": s_bid_capacity_target,
        "ask_capacity_target": s_ask_capacity_target,
        "bid_capacity_target_cushion": s_bid_capacity_target_cushion,
        "ask_capacity_target_cushion": s_ask_capacity_target_cushion,
        "natural_price": s_natural_price, }
}

real_capacity_cushion_block = {'policies': {
    "real_bid_capacity_cushion": p_real_bid_capacity_cushion,
    "real_ask_capacity_cushion": p_real_ask_capacity_cushion
},
    'variables': {
        "bid_capacity_cushion": s_bid_capacity_cushion,
        "ask_capacity_cushion": s_ask_capacity_cushion, }}

effective_capacity_cushion_block = {'policies': {
    "effective_bid_capacity_cushion": p_effective_bid_capacity_cushion,
    "effective_ask_capacity_cushion": p_effective_ask_capacity_cushion
},
    'variables': {
        "bid_change_cushion_usd": s_bid_change_cushion_usd,
        "bid_change_cushion_shit": s_bid_change_cushion_shit,
        "ask_change_cushion_usd": s_ask_change_cushion_usd,
        "ask_change_cushion_shit": s_ask_change_cushion_shit, }}


real_capacity_totals_block = {'policies': {
    "real_bid_capacity_totals": p_real_bid_capacity_totals,
    "real_ask_capacity_totals": p_real_ask_capacity_totals
},
    'variables': {
        "bid_capacity_cushion": s_bid_capacity_cushion,
        "bid_capacity": s_bid_capacity,
        "ask_capacity_cushion": s_ask_capacity_cushion,
        "ask_capacity": s_ask_capacity, }}

effective_capacity_changes_totals_block = {'policies': {
    "effective_bid_capacity_changes_totals": p_effective_bid_capacity_changes_totals,
    "effective_ask_capacity_changes_totals": p_effective_ask_capacity_changes_totals
},
    'variables': {
        "bid_change_shit": s_bid_change_shit,
        "bid_change_usd": s_bid_change_usd,
        "ask_change_shit": s_ask_change_shit,
        "ask_change_usd": s_ask_change_usd, }}

treasury_block = {'policies': {"treasury": p_treasury},
                  'variables': {"liq_stables": s_liq_stables, "liq_shit": s_liq_shit, "price": s_price,
                                "reserves_out": s_reserves_out,
                                "reserves_stables": s_reserves_stables,
                                "shit_traded": s_shit_traded,
                                "cum_shit_purchased": s_cum_shit_purchased,
                                "cum_shit_burnt": s_cum_shit_burnt,
                                "cum_shit_minted": s_cum_shit_minted}}
protocol_block = {
    'policies': {
        'protocol': p_protocol
    },
    'variables': {
        'floating_supply': s_floating_supply,
        'mcap': s_mcap,
        'floating_mcap': s_floating_mcap,
        'liq_ratio': s_liq_ratio,
        'target_liq_ratio_reached': s_target_liq_ratio_reached,
        'reserves_ratio': s_reserves_ratio,
        'fmcap_treasury_ratio': s_fmcap_treasury_ratio,
        'liq_fmcap_ratio': s_liq_fmcap_ratio,
        'total_demand': s_total_demand,
        'total_supply': s_total_supply,
        'total_net': s_total_net
    }
}

interrupt_block = {
    'policies': {},
    'variables': {
        'interrupt': s_interrupt
    }
}
soros_whale_block = {
    'policies': {
        'soros_whale': p_soros_whale
    },
    'variables': {
        'net_flow': s_soros_whale,
        'whale_flow': s_soros_whale_flow
    }
}

soros_whale_reaction_block = {
    'policies': {
        'soros_whale_reaction': p_soros_whale_reaction
    },
    'variables': {
        'net_flow': s_soros_whale_reaction,
    }
}

soros_revenue_block = {'policies': {
    'soros_revenue': p_soros_revenue
},
    'variables': {
        'soros_revenue': s_soros_revenue,
}}


psub_blocks = [meta_block, treasury_stables_block, liq_backing_block, reward_rate_block, bond_creation_block, bond_sell_block, bond_expiration_block, supply_block, reserves_in_block, amm_k_block,
               price_target_block1, price_target_block2, target_walls_block, cushions_block,
               reinstate_counter_block, demand_block, target_capacities_block, real_capacity_cushion_block,
               effective_capacity_cushion_block, real_capacity_totals_block, effective_capacity_changes_totals_block,
               treasury_block, interrupt_block,
               price_history_block, protocol_block]

psub_blocks_noRBS = [meta_block, treasury_stables_block, liq_backing_block, reward_rate_block, bond_creation_block, bond_sell_block, bond_expiration_block,
                     supply_block, reserves_in_block, amm_k_block, demand_block, treasury_block, interrupt_block, price_history_block, protocol_block]
psub_blocks_soros = psub_blocks[:]

psub_blocks_soros.insert(psub_blocks_soros.index(
    demand_block) + 1, soros_whale_block)

psub_blocks_soros.insert(psub_blocks_soros.index(
    soros_whale_block) + 1, soros_whale_reaction_block)


psub_blocks_soros.append(soros_revenue_block)
