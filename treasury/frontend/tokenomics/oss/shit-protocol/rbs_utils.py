import random
import math
import numpy as np
from typing import Dict, List, Tuple


class ModelParams():
    def __init__(self, seed:int, netflow_type:str, horizon:int, ask_factor:float, bid_factor:float, cushion_factor:float, target_ma:float, lower_wall:float, upper_wall:float, lower_cushion:float, upper_cushion:float, reinstate_window:int, min_counter_reinstate:int, min_premium_target:int, max_outflow_rate:float, supply_amplitude:int, reserve_change_speed:float, max_liq_ratio:float, cycle_reweights:float, release_capture:float, demand_factor:float, supply_factor:float, initial_supply:float, initial_reserves_stables:float, initial_reserves_volatile:float, initial_liq_stables:float, arb_factor:float, initial_price:float, initial_target:float, target_price_function:str, short_cycle:int, long_cycle:int, long_sin_offset:float, long_cos_offset:float, with_reinstate_window:str, with_dynamic_reward_rate:str):
    
        # MARKET BEHAVIOR PARAMETERS
        self.seed = seed
        self.horizon = horizon
        self.demand_factor = demand_factor
        self.supply_factor = supply_factor
        self.netflow_type = netflow_type
        self.arb_factor = arb_factor  # Deprecated. No arbitrage assumptions since Montecarlos was used to model market behavior.
        self.cycle_reweights = cycle_reweights  # Deprecated.
        self.reserve_change_speed = reserve_change_speed  # Deprecated.
        self.short_cycle = short_cycle  # Only applicable for market behavior assumptions = sin/cos waves. Not used for sims since Montecarlo was used.
        self.long_cycle = long_cycle  # Only applicable for market behavior assumptions = sin/cos waves. Not used for sims since Montecarlo was used.
        self.long_sin_offset = long_sin_offset  # Only applicable for market behavior assumptions = sin/cos waves. Not used for sims since Montecarlo was used.
        self.long_cos_offset = long_cos_offset  # Only applicable for market behavior assumptions = sin/cos waves. Not used for sims since Montecarlo was used.
        self.supply_amplitude = supply_amplitude  # Only applicable for market behavior assumptions = sin/cos waves. Not used for sims since Montecarlo was used.

        # PROTOCOL-RELATED PARAMETERS
        self.max_liq_ratio = max_liq_ratio
        self.min_premium_target = min_premium_target  # Deprecated.
        self.release_capture = release_capture  # Deprecated.
        self.max_outflow_rate = max_outflow_rate
        self.with_reinstate_window = with_reinstate_window  # Implemented as YES.
        self.with_dynamic_reward_rate = with_dynamic_reward_rate  # Implemented as NO. After OIP 119 regardless of the scenario, reward rate is fixed.

        # MARKET OPERATIONS-RELATED PARAMETERS
        self.target_ma = target_ma
        self.lower_wall = lower_wall
        self.upper_wall = upper_wall
        self.lower_cushion = lower_cushion
        self.upper_cushion = upper_cushion
        self.bid_factor = bid_factor
        self.ask_factor = ask_factor
        self.cushion_factor = cushion_factor
        self.reinstate_window = reinstate_window
        self.min_counter_reinstate = min_counter_reinstate

        # INITIAL PROTOCOL PARAMETERS
        self.initial_supply = initial_supply
        self.initial_liq_stables = initial_liq_stables
        self.initial_reserves_stables = initial_reserves_stables
        self.initial_reserves_volatile = initial_reserves_volatile
        self.initial_liq_backing = initial_reserves_stables + initial_reserves_volatile + initial_liq_stables
        self.initial_price = initial_price
        self.initial_target = initial_target
        self.target_price_function = target_price_function


class Day():
    def __init__(self, params:ModelParams, prev_arbs:Dict[int, Tuple[float, float]], prev_lags=Dict[int, Tuple[int, Dict[int, float]]], prev_day=None, historical_net_flows=None):
        
        # Initialize variables for the first day
        if prev_day is None:
            self.day = 1
            self.supply = params.initial_supply
            self.reward_rate = rr_framework(self.supply, params.with_dynamic_reward_rate, 0)
            self.price = params.initial_price
            self.liq_stables = params.initial_liq_stables
            self.liq_shit = self.liq_stables / self.price
            self.k = (self.liq_stables ** 2) / self.price

            self.reserves_in = 0
            self.reserves_out = 0
            self.release_capture = 0  # Deprecated
            self.shit_traded = 0
            self.cum_shit_purchased = 0
            self.cum_shit_burnt = 0
            self.cum_shit_minted = 0
            self.reserves_stables = params.initial_reserves_stables
            self.prev_reserves = params.initial_reserves_stables

            self.ma_target = params.initial_target
            self.lb_target = params.initial_liq_backing / params.initial_supply
            self.target = max(self.ma_target, self.lb_target)
            self.lower_target_wall = self.ma_target * (1 - params.lower_wall)
            self.upper_target_wall = self.ma_target * (1 + params.upper_wall)
            self.lower_target_cushion = self.ma_target * (1 - params.lower_cushion)
            self.upper_target_cushion = self.ma_target * (1 + params.upper_cushion)

            self.bid_capacity_target = params.bid_factor * self.reserves_stables
            self.ask_capacity_target = params.ask_factor * self.reserves_stables / self.upper_target_wall * (1 + params.lower_wall + params.upper_wall)
            self.bid_capacity_target_cushion = self.bid_capacity_target * params.cushion_factor
            self.ask_capacity_target_cushion = self.ask_capacity_target * params.cushion_factor
            self.bid_capacity = self.bid_capacity_target
            self.ask_capacity = self.ask_capacity_target
            self.bid_capacity_cushion = self.bid_capacity_target_cushion
            self.ask_capacity_cushion = self.ask_capacity_target_cushion
            self.ask_change_shit = 0
            self.bid_change_shit = 0
            
            self.prev_price = self.price
            self.prev_lower_target_wall = self.lower_target_wall
            self.prev_lower_target_cushion = self.lower_target_cushion
            self.prev_upper_target_wall = self.upper_target_wall
            self.prev_upper_target_cushion = self.upper_target_cushion
            
            self.market_demand = params.demand_factor
            self.market_supply = params.supply_factor
            self.arb_factor = params.arb_factor
            self.arb_demand = 0
            self.arb_supply = 0
            self.unwind_demand = 0
            self.unwind_supply = 0

            self.net_flow = 0
            prev_arbs[self.day] = (self.arb_demand, self.arb_supply)
            
            self.bid_counter = [0] * params.reinstate_window
            self.ask_counter = [0] * params.reinstate_window
            self.target_liq_ratio_reached = False

        else:
            self.day = prev_day.day + 1

            # -- SUPPLY ---------------------------------------------------------------------------------------

            # Reward Rate --> after OIP 119 regardless of the scenario, reward rate is fixed.
            if prev_day.fmcap_treasury_ratio < 1:  # below backing           
                self.reward_rate = rr_framework(prev_day.supply, params.with_dynamic_reward_rate, -3)
            elif prev_day.price < prev_day.lower_target_wall:  # below wall
                self.reward_rate = rr_framework(prev_day.supply, params.with_dynamic_reward_rate, -2)
            elif prev_day.price < prev_day.lower_target_cushion:  # below cushion
                self.reward_rate = rr_framework(prev_day.supply, params.with_dynamic_reward_rate, -1)
            elif prev_day.fmcap_treasury_ratio > 3:  # above 3x premium
                self.reward_rate = rr_framework(prev_day.supply, params.with_dynamic_reward_rate, 2)
            elif prev_day.price > prev_day.lower_target_wall:  # above wall
                self.reward_rate = rr_framework(prev_day.supply, params.with_dynamic_reward_rate, 1)
            else:  # inside the range
                self.reward_rate = rr_framework(prev_day.supply, params.with_dynamic_reward_rate, 0)

            # Supply expansion
            self.supply = prev_day.price and max((prev_day.supply - prev_day.reserves_in / prev_day.prev_price + prev_day.ask_change_shit - prev_day.bid_change_shit) * (1 + self.reward_rate), 0) or 0

            # -- LIQUIDITY POOL ---------------------------------------------------------------------------------

            # Treasury Rebalance - Reserve Intake
            if self.day % 7 == 0:  # Rebalance once a week
                self.reserves_in = prev_day.liq_stables - prev_day.treasury_stables * params.max_liq_ratio
                if prev_day.target_liq_ratio_reached is False:
                    max_outflow = (-1) * prev_day.reserves_stables * params.max_outflow_rate * 2 / 3  # Smaller max_outflow_rate until target is first reached
                else:
                    max_outflow = (-1) * prev_day.reserves_stables * params.max_outflow_rate  # Ensure that the reserve release is limited by max_outflow_rate

                if self.reserves_in < max_outflow:
                    self.reserves_in = max_outflow
                if self.reserves_in < (-1) * prev_day.reserves_stables:  # Ensure that the reserve release is limited by the total reserves left
                    self.reserves_in = (-1) * prev_day.reserves_stables
            else:
                self.reserves_in = 0

            # AMM k
            self.k = prev_day.price and ((prev_day.liq_stables - self.reserves_in)**2 / prev_day.price) or 0  # Mint & sync has been deprecated


            # -- RBS PRICE ---------------------------------------------------------------------------------------

            # Price Target
            self.ma_target = calc_price_target(params=params, prev_day=prev_day, prev_lags=prev_lags)
            self.lb_target = prev_day.floating_supply and prev_day.liq_backing / prev_day.floating_supply or 0
            self.target = max(self.ma_target, self.lb_target)
            self.prev_price = round(prev_day.price, 4)
            self.prev_lower_target_wall = round(prev_day.lower_target_wall, 4)
            self.prev_lower_target_cushion = round(prev_day.lower_target_cushion, 4)
            self.prev_upper_target_wall = round(prev_day.upper_target_wall, 4)
            self.prev_upper_target_cushion = round(prev_day.upper_target_cushion, 4)

            # Walls
            self.lower_target_wall = self.target * (1 - params.lower_wall)
            self.upper_target_wall = self.target * (1 + params.upper_wall)

            # Cushions
            self.lower_target_cushion = self.target * (1 - params.lower_cushion)
            self.upper_target_cushion = self.target * (1 + params.upper_cushion)

            # Reinstate Window --> Inside the range counters
            if prev_day.price > prev_day.target:
                self.bid_counter = prev_day.bid_counter[1:] + [1]
            else:
                self.bid_counter = prev_day.bid_counter[1:] + [0]

            if prev_day.price < prev_day.ma_target:
                self.ask_counter = prev_day.ask_counter[1:] + [1]
            else:
                self.ask_counter = prev_day.ask_counter[1:] + [0]


            # -- MARKET BEHAVIOR (MODEL INPUT) ---------------------------------------------------------------------------------------

            if params.netflow_type == 'historical' or params.netflow_type == 'enforced' and historical_net_flows is not None:  # Arbitrary market behavior
                self.net_flow = historical_net_flows
                self.market_demand = 0
                self.market_supply = 0

            else:  # Random market behavior
                self.net_flow = random.uniform(prev_day.treasury_stables * prev_day.total_supply, prev_day.treasury_stables * prev_day.total_demand)

                if params.netflow_type == 'waves':
                    self.market_demand = params.demand_factor * short_sin(self.day, params.short_cycle) * long_sin(self.day, params.long_cycle, params.long_sin_offset)
                    self.market_supply = params.supply_factor * short_cos(self.day, params.short_cycle) * long_cos(self.day, params.long_cycle, params.long_cos_offset, params.supply_amplitude)
                else:
                    self.market_demand = params.demand_factor * random.uniform(0.5, 3)
                    self.market_supply = params.supply_factor * random.uniform(0.5, 3)


            # -- TREASURY MARKET OPERATIONS ---------------------------------------------------------------------------------------

            # Target capacities
            self.bid_capacity_target = params.bid_factor * prev_day.reserves_stables
            self.ask_capacity_target = prev_day.upper_target_wall and params.ask_factor * prev_day.reserves_stables * (1 + params.upper_wall + params.lower_wall) / prev_day.upper_target_wall or 0
            self.bid_capacity_target_cushion = self.bid_capacity_target * params.cushion_factor
            self.ask_capacity_target_cushion = self.ask_capacity_target * params.cushion_factor

            
            natural_price = self.k and ((self.net_flow - self.reserves_in + prev_day.liq_stables) ** 2) / self.k or 0 # Price without any treasury market operations

            # BID: Real Bid Capacity - Cushion
            if (sum(self.bid_counter) >= params.min_counter_reinstate or params.with_reinstate_window == 'No') and natural_price > self.lower_target_cushion:  # Refill capacity
                self.bid_capacity_cushion = self.bid_capacity_target_cushion
            elif self.prev_price >= self.prev_lower_target_cushion and self.lower_target_cushion > natural_price: # Deploy cushion capcity
                self.bid_capacity_cushion = prev_day.bid_capacity_cushion + self.net_flow - self.reserves_in + prev_day.liq_stables - (self.k * self.lower_target_cushion) ** (1/2)
            else:
                self.bid_capacity_cushion = prev_day.bid_capacity_cushion
            
            if self.bid_capacity_cushion < 0:
                self.bid_capacity_cushion = 0
            elif self.bid_capacity_cushion > self.bid_capacity_target_cushion:
                self.bid_capacity_cushion = self.bid_capacity_target_cushion

            # BID: Effective Bid Capacity Changes - Cushion
            if self.prev_price >= self.prev_lower_target_cushion and self.lower_target_cushion > natural_price:
                self.bid_change_cushion_usd = prev_day.bid_capacity_cushion - self.bid_capacity_cushion
                self.bid_change_cushion_shit = self.lower_target_cushion and (prev_day.bid_capacity_cushion - self.bid_capacity_cushion) / self.lower_target_cushion or 0
            else:
                self.bid_change_cushion_usd = 0
                self.bid_change_cushion_shit = 0

            if self.bid_change_cushion_shit > prev_day.bid_capacity_cushion:  # Ensure that change is smaller than capacity left
                self.bid_change_cushion_usd = prev_day.bid_capacity_cushion
                self.bid_change_cushion_shit = self.lower_target_cushion and prev_day.bid_capacity_cushion / self.lower_target_cushion or 0
            
            bid_adj_price = self.k and ((self.net_flow - self.reserves_in + prev_day.liq_stables + self.bid_change_cushion_usd) ** 2) / self.k or 0

            # BID: Real Bid Capacity - Totals
            if self.target == self.lb_target and bid_adj_price <= self.lb_target * (1 - params.lower_wall): # Below liquid backing, the wall has infinite capacity (unlimited treasury redemptions at those levels)
                self.bid_capacity = self.bid_capacity_target
            elif (sum(self.bid_counter) >= params.min_counter_reinstate or params.with_reinstate_window == 'No') and natural_price > self.lower_target_cushion:  # Refill capacity
                self.bid_capacity = self.bid_capacity_target
            elif bid_adj_price < self.lower_target_wall:  # Deploy cushion capcity
                self.bid_capacity = prev_day.bid_capacity + self.net_flow - self.reserves_in + prev_day.liq_stables - (self.k * self.lower_target_wall) ** (1/2)
            else:
                self.bid_capacity = prev_day.bid_capacity - self.bid_change_cushion_usd

            if self.bid_capacity < 0:
                self.bid_capacity = 0
            elif self.bid_capacity > self.bid_capacity_target:
                self.bid_capacity = self.bid_capacity_target

            if self.bid_capacity_cushion > self.bid_capacity:
                self.bid_capacity_cushion = self.bid_capacity

            # BID: Effective Bid Capacity Changes - Totals
            if self.target == self.lb_target and bid_adj_price < self.lb_target * (1 - params.lower_wall): # Below liquid backing, the wall has infinite capacity (unlimited treasury redemptions at those levels)
                self.bid_change_usd = self.reserves_in - self.net_flow - prev_day.liq_stables + (self.k * self.lower_target_wall) ** (1/2)
                self.bid_change_shit = self.lower_target_wall and self.bid_change_usd / self.lower_target_wall or 0
            elif bid_adj_price >= self.lower_target_wall:  # If wall wasn't used, update with cushion
                self.bid_change_usd = self.bid_change_cushion_usd
                self.bid_change_shit = self.bid_change_cushion_shit
            else:
                self.bid_change_usd = prev_day.bid_capacity - self.bid_capacity
                self.bid_change_shit = self.lower_target_wall and self.bid_change_cushion_shit + (prev_day.bid_capacity - self.bid_capacity - self.bid_change_cushion_usd) / self.lower_target_wall or 0

            if self.bid_change_usd > prev_day.bid_capacity:  # Ensure that change is smaller than capacity left
                self.bid_change_usd = prev_day.bid_capacity
                self.bid_change_shit = self.lower_target_wall and prev_day.bid_capacity / self.lower_target_wall or 0

            # ASK: Real Ask Capacity - Cushion
            if (sum(self.ask_counter) >= params.min_counter_reinstate or params.with_reinstate_window == 'No') and natural_price < self.upper_target_cushion:
                self.ask_capacity_cushion = self.ask_capacity_target_cushion
            elif self.prev_price <= self.prev_upper_target_cushion and self.upper_target_cushion < natural_price:
                self.ask_capacity_cushion = self.upper_target_cushion and prev_day.ask_capacity_cushion - (self.net_flow - self.reserves_in + prev_day.liq_stables) / self.upper_target_cushion + (self.k / self.upper_target_cushion) ** (1/2) or 0
            else:
                self.ask_capacity_cushion = prev_day.ask_capacity_cushion

            if self.ask_capacity_cushion < 0:
                self.ask_capacity_cushion = 0
            elif self.ask_capacity_cushion > self.ask_capacity_target_cushion:
                self.ask_capacity_cushion = self.ask_capacity_target_cushion

            # ASK: Effective Ask Capacity Changes - Cushion
            if self.prev_price <= self.prev_upper_target_cushion and self.upper_target_cushion < natural_price:
                self.ask_change_cushion_shit = prev_day.ask_capacity_cushion - self.ask_capacity_cushion
                self.ask_change_cushion_usd = self.upper_target_cushion * (prev_day.ask_capacity_cushion - self.ask_capacity_cushion)
            else:
                self.ask_change_cushion_shit = 0
                self.ask_change_cushion_usd = 0
            
            if self.ask_change_cushion_shit > prev_day.ask_capacity_cushion:  # ensure that change is smaller than capacity left
                self.ask_change_cushion_shit = prev_day.ask_capacity_cushion
                self.ask_change_cushion_usd = prev_day.ask_capacity_cushion * self.upper_target_cushion
            
            ask_adj_price =  self.k and ((self.net_flow - self.reserves_in + prev_day.liq_stables - self.ask_change_cushion_usd) ** 2) / self.k or 0
                            
            # ASK: Real Ask Capacity - Totals
            if (sum(self.ask_counter) >= params.min_counter_reinstate or params.with_reinstate_window == 'No') and natural_price < self.upper_target_cushion:
                self.ask_capacity = self.ask_capacity_target
            elif ask_adj_price > self.upper_target_wall:
                self.ask_capacity = self.upper_target_wall and prev_day.ask_capacity - (self.net_flow - self.reserves_in + prev_day.liq_stables) / self.upper_target_wall + (self.k / self.upper_target_wall) ** (1/2) or 0
            else:
                self.ask_capacity = prev_day.ask_capacity - self.ask_change_cushion_shit # update capacity total to account for the cushion

            if self.ask_capacity < 0:
                self.ask_capacity = 0
            elif self.ask_capacity > self.ask_capacity_target:
                self.ask_capacity = self.ask_capacity_target

            if self.ask_capacity_cushion > self.ask_capacity:
                self.ask_capacity_cushion = self.ask_capacity

            # ASK: Effective Ask Capacity Changes - Totals
            if ask_adj_price <= self.upper_target_wall: #if wall wasn't used, update with cushion
                self.ask_change_shit = self.ask_change_cushion_shit
                self.ask_change_usd = self.ask_change_cushion_usd
            else:
                self.ask_change_shit = prev_day.ask_capacity - self.ask_capacity
                self.ask_change_usd = self.ask_change_cushion_usd + (prev_day.ask_capacity - self.ask_capacity - self.ask_change_cushion_shit) * self.upper_target_wall
            
            if self.ask_change_shit > prev_day.ask_capacity:  # ensure that change is smaller than capacity left
                self.ask_change_shit = prev_day.ask_capacity
                self.ask_change_usd = prev_day.ask_capacity * self.upper_target_wall


            # -- TREASURY ---------------------------------------------------------------------------------------

            # Liquidity
            self.liq_stables = max(prev_day.liq_stables + self.net_flow - self.reserves_in + self.bid_change_usd - self.ask_change_usd, 0)
            self.liq_shit = self.liq_stables and self.k / self.liq_stables or 0  # ensure that if liq_stables is 0 then liq_shit is 0 as well
            self.price = self.liq_shit and self.liq_stables / self.liq_shit or 0  # ensure that if liq_shit is 0 then price is 0 as well

            # Reserves
            self.reserves_out = self.liq_stables - prev_day.liq_stables - self.net_flow  # - self.reserves_in (error caught by blockscience)
            self.reserves_stables = max(prev_day.reserves_stables - self.reserves_out, 0)
            self.prev_reserves = prev_day.reserves_stables

            self.shit_traded = (self.price + prev_day.price) and (-2) * self.reserves_out / (self.price + prev_day.price) or 0
            self.cum_shit_purchased = prev_day.cum_shit_purchased - self.shit_traded
            self.cum_shit_burnt = prev_day.cum_shit_burnt + self.bid_change_shit
            self.cum_shit_minted = prev_day.cum_shit_minted + self.ask_change_shit

        
        # -- PROTOCOL VARIABLES (FOR REPORTING) ---------------------------------------------------------------------------------------

        self.floating_supply = max(self.supply - self.liq_shit, 0)
        self.treasury_stables = self.liq_stables + self.reserves_stables
        self.liq_backing = self.treasury_stables + params.initial_reserves_volatile
        self.mcap = self.supply * self.price
        self.floating_mcap = self.floating_supply * self.price

        self.liq_ratio = self.treasury_stables and self.liq_stables / self.treasury_stables or 0
        self.target_liq_ratio_reached = True if self.liq_ratio >= params.max_liq_ratio else False
        self.reserves_ratio = self.liq_stables and self.reserves_stables / self.liq_stables or 0
        self.fmcap_treasury_ratio = self.treasury_stables and self.floating_mcap / self.treasury_stables or 0
        self.liq_fmcap_ratio = self.floating_mcap and self.liq_stables / self.floating_mcap or 0

        self.total_demand = self.market_demand  # + self.arb_demand
        self.total_supply = self.market_supply  # + self.arb_supply
        self.total_net = self.total_demand + self.total_supply

        self.control_ask = sum(self.ask_counter)
        self.control_bid = sum(self.bid_counter)

        prev_lags['price'][1][self.day] = self.price
        prev_lags['target'][1][self.day] = self.ma_target
        prev_lags['gshit price variation'][1][self.day] = self.price * (1 + self.reward_rate)        
        self.gshit_volatility = calc_gshit_volatility(prev_lags=prev_lags)



# Reward rate framework
def rr_framework(supply:int, with_dynamic_reward_rate:str, rr_controller:int, version="flat", on:bool=False):
    if on is False: return 0

    if supply < 1_000_000:
        r = 0.3058 * 3 / 100
    elif supply < 10_000_000:
        r = 0.1587 * 3 / 100
    elif supply < 100_000_000:
        r = 0.1183 * 3 / 100
    elif supply < 1_000_000_000:
        r = 0.0458 * 3 / 100
    elif supply < 10_000_000_000:
        r = 0.0148 * 3 / 100
    elif supply < 100_000_000_000:
        r = 0.0039 * 3 / 100
    elif supply < 1_000_000_000_000:
        r = 0.0019 * 3 / 100
    else:
        r = 0.0009 * 3 / 100

    if version == "flat":
        return 0.000198 # (1 + r) ^ 365 ~ 7.5%

    else:
        if with_dynamic_reward_rate == 'No':
            return r
        else:
            if version == "v0":  # controller v0
                if rr_controller != 9:
                    return r/2

            elif version == "v1":  # controller v1
                if rr_controller == -3:  # below backing
                    return 0
                elif rr_controller == -2:  # below wall
                    return r * (0.5)
                elif rr_controller == -1:  # below cushion
                    return r * (0.75)
                elif rr_controller == 2:  # above premium of 3
                    return r * (1.25)
                elif rr_controller == 1:  # above wall
                    return r * (1.125)
                elif rr_controller == 0:  # inside range, as usual
                    return r


# Target price controller
def calc_price_target(params:ModelParams, prev_day:Day, prev_lags:Dict[int, Tuple[int, Dict[int, float]]]):
    if params.target_price_function == 'price_moving_avg':
        s = 0
        days = len(prev_lags['price'][1]) - 1
        days_ma = int(params.target_ma)
        if days > params.target_ma:
            for i in range(days - days_ma, days):
                s += prev_lags['price'][1][i+1]
            return s / days_ma
        elif days == 0:
            return prev_day.ma_target
        else:
            for i in range (0, days):
                s += prev_lags['price'][1][i+1]
            s += prev_lags['price'][1][1] * (params.target_ma - days)
            return s / params.target_ma

    # Deprecated
    elif params.target_price_function == 'avg_lags':
        if prev_day.day % (params.short_cycle) == 0:
            s = 0
            lag_keys = set(prev_lags.keys()) - set(['price', 'target', 'natural', 'avg'])
            for key in lag_keys:
                days = prev_lags[key][1].keys()
                s += prev_lags[key][1][max(days)]
            avg_lag = s / len(lag_keys)
            return (prev_day.natural_target + avg_lag) / 2
        else:
            return prev_day.ma_target

    # Deprecated
    elif params.target_price_function == 'price_cycle_avg':
        if prev_day.day % (params.short_cycle) == 0:
            s = 0
            days = len(prev_lags['price'][1]) - 1
            days_reweight = int(params.short_cycle)
            if days > params.short_cycle:
                for i in range(days - days_reweight, days):
                    s += prev_lags['price'][1][i]
                return s / days_reweight
            else:
                 return prev_day.ma_target
        else:
            return prev_day.ma_target


# gSHIT volatility
def calc_gshit_volatility(prev_lags:Dict[int, Tuple[int, Dict[int, float]]]):
    days = len(prev_lags['gshit price variation'][1]) - 1
    data = list(prev_lags['gshit price variation'][1].values())
    if days > 6:
        if np.mean(data[-6:]) == 0:
           return 0
        else:
            return np.std(data[-6:])/np.mean(data[-6:])
    else:
        return 0


# Market behavior simulation functions - Deprecated
def short_sin(day:int, cycle:int):
    value = 1.5 + (0.5 * math.sin((day + 1.5 * cycle) / (cycle / (2*math.pi))))
    return value


def short_cos(day:int, cycle:int):
    value = 1.55 + (0.5 * math.cos((day + 0.5 * cycle) / (cycle / (2*math.pi))))
    return value


def long_sin(day:int, cycle:int, offset:float):
    value = 1 + (0.5 * math.sin(((day + cycle * offset) % cycle) / (cycle / (2*math.pi)))) * (10 - (day / cycle)) / 10
    return value


def long_cos(day:int, cycle:int, offset:float, amplitude:float):
    value = amplitude * (1 + (0.5 * math.cos(((day + 2 * cycle * offset) % (2 * cycle)) / (cycle / math.pi))) * (10 - (day / (2 * cycle))) / 10 )
    return value