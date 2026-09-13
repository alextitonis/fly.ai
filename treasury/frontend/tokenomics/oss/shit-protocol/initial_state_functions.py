from model.types import StateType, ParamsType
from model.mechanism.amm_k import amm_k_mechanism
from model.mechanism.treasury import liq_backing_mechanism, treasury_stables_mechanism, liq_shit_mechanism
from model.mechanism.protocol import floating_supply_mechanism, mcap_mechanism, ratio_mechanism
from model.policy.rbs_price import lower_target_policy, upper_target_policy


def fill_in_initial_state(initial_state: StateType, params: ParamsType) -> StateType:
    """A function to fill in the initial state based on parameters

    Args:
        initial_state (StateType): The initial state that is not filled in
        params (ParamsType): The parameters of the system

    Returns:
        StateType: A filled in initial state
    """

    # initialize parameters that are decided by other parameters
    initial_state['amm_k'] = amm_k_mechanism(initial_state)
    initial_state['price_history'] = [initial_state['price']]

    initial_state['lb_target'] = initial_state['ma_target']
    initial_state['price_target'] = initial_state['ma_target']

    initial_state['liq_shit'] = liq_shit_mechanism(
        initial_state['liq_stables'], initial_state['price'])
    initial_state['floating_supply'] = floating_supply_mechanism(
        initial_state['supply'], initial_state['liq_shit'])

    initial_state['treasury_stables'] = treasury_stables_mechanism(
        initial_state['liq_stables'], initial_state['reserves_stables'])
    initial_state['liq_backing'] = liq_backing_mechanism(
        initial_state['treasury_stables'], params['initial_reserves_volatile'][0])
    initial_state['lower_target_wall'] = lower_target_policy(
        initial_state['price_target'], params['lower_wall'][0])
    initial_state['upper_target_wall'] = upper_target_policy(
        initial_state['price_target'], params['upper_wall'][0])
    initial_state["lower_target_cushion"] = lower_target_policy(
        initial_state['price_target'], params['lower_cushion'][0])
    initial_state["upper_target_cushion"] = upper_target_policy(
        initial_state['price_target'], params['upper_cushion'][0])

    initial_state['bid_counter'], initial_state['ask_counter'] = [0] * \
        params["reinstate_window"][0], [0] * params["reinstate_window"][0]

    initial_state["bid_capacity_target"] = params["bid_factor"][0] * \
        initial_state["reserves_stables"]
    initial_state["ask_capacity_target"] = params["ask_factor"][0] * initial_state["reserves_stables"] / \
        initial_state["upper_target_wall"] * \
        (1 + params["lower_wall"][0] + params["upper_wall"][0])
    initial_state["bid_capacity_target_cushion"] = initial_state["bid_capacity_target"] * \
        params["cushion_factor"][0]
    initial_state["ask_capacity_target_cushion"] = initial_state["ask_capacity_target"] * \
        params["cushion_factor"][0]
    initial_state["bid_capacity"] = initial_state["bid_capacity_target"]
    initial_state["ask_capacity"] = initial_state["ask_capacity_target"]
    initial_state["bid_capacity_cushion"] = initial_state["bid_capacity_target_cushion"]
    initial_state["ask_capacity_cushion"] = initial_state["ask_capacity_target_cushion"]
    initial_state["ask_change_shit"] = 0
    initial_state["bid_change_shit"] = 0

    # shit bond related variables
    initial_state['bond_created'] = []
    initial_state['bond_created_today'] = []
    initial_state['shit_bonded'] = 0
    initial_state['liq_shit_into_bond'] = 0
    initial_state['shit_released'] = 0

    # protocol vars
    initial_state['mcap'] = mcap_mechanism(
        initial_state['supply'], initial_state['price'])
    initial_state['floating_mcap'] = mcap_mechanism(
        initial_state['floating_supply'], initial_state['price'])
    initial_state['liq_ratio'] = ratio_mechanism(
        initial_state['liq_stables'], initial_state['treasury_stables'])
    initial_state['reserves_ratio'] = ratio_mechanism(
        initial_state['reserves_stables'], initial_state['liq_stables']),
    initial_state['fmcap_treasury_ratio'] = ratio_mechanism(
        initial_state['floating_mcap'], initial_state['treasury_stables'])
    initial_state['liq_fmcap_ratio'] = ratio_mechanism(
        initial_state['liq_stables'], initial_state['floating_mcap'])
    initial_state['total_demand'] = initial_state['market_demand_supply'].total_demand
    initial_state['total_supply'] = initial_state['market_demand_supply'].total_supply
    initial_state['total_net'] = initial_state['total_demand'] + \
        initial_state['total_supply']

    # Param tracking
    initial_state['demand_factor'] = None
    initial_state['supply_factor'] = None

    return initial_state
