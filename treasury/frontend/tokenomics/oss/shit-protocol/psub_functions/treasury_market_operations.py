from ..policy.treasury_market_operations import (real_bid_capacity_cushion_policy, real_ask_capacity_cushion_policy,
                                                 effective_bid_capacity_cushion_policy, effective_ask_capacity_cushion_policy,
                                                 real_bid_capacity_totals_policy, real_ask_capacity_totals_policy,
                                                 effective_bid_capacity_changes_totals_policy, effective_ask_capacity_changes_totals_policy)


def p_real_bid_capacity_cushion(_params, substep, state_history, state) -> dict:
    prev_day = state_history[-1][-1]
    bid_counter = state["bid_counter"]
    min_counter_reinstate = _params["min_counter_reinstate"]
    with_reinstate_window = _params["with_reinstate_window"]
    natural_price = state["natural_price"]
    lower_target_cushion = state["lower_target_cushion"]
    bid_capacity_target_cushion = state["bid_capacity_target_cushion"]
    bid_capacity_target_cushion_prior = prev_day["bid_capacity_target_cushion"]
    lower_target_wall = state["lower_target_wall"]
    net_flow = state["net_flow"]
    reserves_in = state["reserves_in"]
    liq_stables_prior = prev_day["liq_stables"]
    amm_k = state["amm_k"]
    bid_capacity_cushion_prior = prev_day["bid_capacity_cushion"]

    return {"bid_capacity_cushion": real_bid_capacity_cushion_policy(bid_counter, min_counter_reinstate, with_reinstate_window, natural_price, lower_target_cushion, bid_capacity_target_cushion, bid_capacity_target_cushion_prior, lower_target_wall, net_flow, reserves_in, liq_stables_prior, amm_k, bid_capacity_cushion_prior)}


def p_real_ask_capacity_cushion(_params, substep, state_history, state) -> dict:
    prev_day = state_history[-1][-1]

    ask_counter = state["ask_counter"]
    min_counter_reinstate = _params["min_counter_reinstate"]
    with_reinstate_window = _params["with_reinstate_window"]
    natural_price = state["natural_price"]
    upper_target_cushion = state["upper_target_cushion"]
    ask_capacity_target_cushion = state["ask_capacity_target_cushion"]
    upper_target_wall = state["upper_target_wall"]
    ask_capacity_cushion_prior = prev_day["ask_capacity_cushion"]
    net_flow = state["net_flow"]
    reserves_in = state["reserves_in"]
    liq_stables_prior = prev_day["liq_stables"]
    amm_k = state["amm_k"]

    return {"ask_capacity_cushion": real_ask_capacity_cushion_policy(ask_counter, min_counter_reinstate, with_reinstate_window, natural_price, upper_target_cushion, ask_capacity_target_cushion, upper_target_wall, ask_capacity_cushion_prior, net_flow, reserves_in, liq_stables_prior, amm_k)}


def s_bid_capacity_cushion(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_capacity_cushion", _input["bid_capacity_cushion"])


def s_ask_capacity_cushion(_params, substep, state_history, state, _input) -> tuple:
    return ("ask_capacity_cushion", _input["ask_capacity_cushion"])


def p_effective_bid_capacity_cushion(_params, substep, state_history, state) -> dict:
    prev_day = state_history[-1][-1]
    natural_price = state["natural_price"]
    lower_target_cushion = state["lower_target_cushion"]
    lower_target_wall = state["lower_target_wall"]
    bid_capacity_cushion_prior = prev_day["bid_capacity_cushion"]
    bid_capacity_cushion = state["bid_capacity_cushion"]

    bid_change_cushion_usd, bid_change_cushion_shit = effective_bid_capacity_cushion_policy(
        natural_price, lower_target_cushion, lower_target_wall, bid_capacity_cushion_prior, bid_capacity_cushion)
    return {"bid_change_cushion_usd": bid_change_cushion_usd,
            "bid_change_cushion_shit": bid_change_cushion_shit}


def p_effective_ask_capacity_cushion(_params, substep, state_history, state) -> dict:

    prev_day = state_history[-1][-1]
    natural_price = state["natural_price"]
    upper_target_cushion = state["upper_target_cushion"]
    upper_target_wall = state["upper_target_wall"]
    ask_capacity_cushion_prior = prev_day["ask_capacity_cushion"]
    ask_capacity_cushion = state["ask_capacity_cushion"]

    ask_change_cushion_usd, ask_change_cushion_shit = effective_ask_capacity_cushion_policy(
        natural_price, upper_target_cushion, upper_target_wall, ask_capacity_cushion_prior, ask_capacity_cushion)
    return {"ask_change_cushion_usd": ask_change_cushion_usd,
            "ask_change_cushion_shit": ask_change_cushion_shit}


def s_bid_change_cushion_usd(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_change_cushion_usd", _input["bid_change_cushion_usd"])


def s_bid_change_cushion_shit(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_change_cushion_shit", _input["bid_change_cushion_shit"])


def s_ask_change_cushion_usd(_params, substep, state_history, state, _input) -> tuple:
    return ("ask_change_cushion_usd", _input["ask_change_cushion_usd"])


def s_ask_change_cushion_shit(_params, substep, state_history, state, _input) -> tuple:
    return ("ask_change_cushion_shit", _input["ask_change_cushion_shit"])


def p_real_bid_capacity_totals(_params, substep, state_history, state) -> dict:
    prev_day = state_history[-1][-1]
    bid_capacity_cushion = state["bid_capacity_cushion"]
    bid_counter = state["bid_counter"]
    min_counter_reinstate_param = _params["min_counter_reinstate"]
    with_reinstate_window_param = _params["with_reinstate_window"]
    natural_price = state["natural_price"]
    lower_target_cushion = state["lower_target_cushion"]
    lower_target_wall = state["lower_target_wall"]
    net_flow = state["net_flow"]
    reserves_in = state["reserves_in"]
    liq_stables_prior = prev_day["liq_stables"]
    amm_k = state["amm_k"]
    target = state["price_target"]
    lb_target = state["lb_target"]
    lower_wall_param = _params["lower_wall"]
    bid_capacity_target = state["bid_capacity_target"]
    bid_capacity_prior = prev_day["bid_capacity"]
    bid_change_cushion_usd = state["bid_change_cushion_usd"]

    bid_capacity_cushion, bid_capacity = real_bid_capacity_totals_policy(target, lb_target, natural_price, lower_wall_param, bid_capacity_target,
                                                                         bid_counter, min_counter_reinstate_param, with_reinstate_window_param, lower_target_cushion,
                                                                         lower_target_wall, bid_capacity_prior, net_flow, reserves_in, liq_stables_prior, amm_k,
                                                                         bid_change_cushion_usd, bid_capacity_cushion)
    return {"bid_capacity_cushion": bid_capacity_cushion,
            "bid_capacity": bid_capacity}


def p_real_ask_capacity_totals(_params, substep, state_history, state) -> dict:
    prev_day = state_history[-1][-1]
    ask_capacity_cushion = state["ask_capacity_cushion"]
    ask_counter = state["ask_counter"]
    min_counter_reinstate_param = _params["min_counter_reinstate"]
    with_reinstate_window_param = _params["with_reinstate_window"]
    natural_price = state["natural_price"]
    upper_target_cushion = state["upper_target_cushion"]
    upper_target_wall = state["upper_target_wall"]
    net_flow = state["net_flow"]
    reserves_in = state["reserves_in"]
    liq_stables_prior = prev_day["liq_stables"]
    amm_k = state["amm_k"]
    ask_capacity_target = state["ask_capacity_target"]
    ask_capacity_prior = prev_day["ask_capacity"]
    ask_change_cushion_shit = state["ask_change_cushion_shit"]

    ask_capacity_cushion, ask_capacity = real_ask_capacity_totals_policy(ask_capacity_cushion, ask_counter, min_counter_reinstate_param, with_reinstate_window_param,
                                                                         natural_price, upper_target_cushion, ask_capacity_target, upper_target_wall, ask_capacity_prior, net_flow, reserves_in, liq_stables_prior,
                                                                         amm_k, ask_change_cushion_shit)
    return {"ask_capacity_cushion": ask_capacity_cushion,
            "ask_capacity": ask_capacity}


def s_bid_capacity(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_capacity", _input["bid_capacity"])


def s_ask_capacity(_params, substep, state_history, state, _input) -> tuple:
    return ("ask_capacity", _input["ask_capacity"])


def p_effective_bid_capacity_changes_totals(_params, substep, state_history, state) -> dict:
    prev_day = state_history[-1][-1]

    natural_price = state["natural_price"]
    lower_target_wall = state["lower_target_wall"]
    net_flow = state["net_flow"]
    reserves_in = state["reserves_in"]
    liq_stables_prior = prev_day["liq_stables"]
    amm_k = state["amm_k"]
    target = state["price_target"]
    lb_target = state["lb_target"]
    lower_wall_param = _params["lower_wall"]
    bid_capacity_prior = prev_day["bid_capacity"]
    bid_change_cushion_usd = state["bid_change_cushion_usd"]
    bid_change_cushion_shit = state["bid_change_cushion_shit"]
    bid_capacity = state["bid_capacity"]

    bid_change_shit, bid_change_usd = effective_bid_capacity_changes_totals_policy(target, lb_target, natural_price, lower_wall_param,
                                                                                  reserves_in, net_flow, liq_stables_prior, amm_k, lower_target_wall, bid_change_cushion_usd, bid_change_cushion_shit,
                                                                                  bid_capacity_prior, bid_capacity)
    return {"bid_change_shit": bid_change_shit,
            "bid_change_usd": bid_change_usd}


def p_effective_ask_capacity_changes_totals(_params, substep, state_history, state) -> dict:
    prev_day = state_history[-1][-1]

    natural_price = state["natural_price"]
    upper_target_wall = state["upper_target_wall"]

    ask_capacity_prior = prev_day["ask_capacity"]
    ask_change_cushion_shit = state["ask_change_cushion_shit"]
    ask_change_cushion_usd = state["ask_change_cushion_usd"]
    ask_capacity = state["ask_capacity"]
    ask_change_shit, ask_change_usd = effective_ask_capacity_changes_totals_policy(natural_price, upper_target_wall, ask_change_cushion_shit, ask_change_cushion_usd,
                                                                                  ask_capacity_prior, ask_capacity)
    return {"ask_change_shit": ask_change_shit,
            "ask_change_usd": ask_change_usd}


def s_bid_change_shit(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_change_shit", _input["bid_change_shit"])


def s_bid_change_usd(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_change_usd", _input["bid_change_usd"])


def s_ask_change_shit(_params, substep, state_history, state, _input) -> tuple:
    return ("ask_change_shit", _input["ask_change_shit"])


def s_ask_change_usd(_params, substep, state_history, state, _input) -> tuple:
    return ("ask_change_usd", _input["ask_change_usd"])
