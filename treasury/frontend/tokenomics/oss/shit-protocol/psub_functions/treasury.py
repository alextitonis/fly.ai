from ..policy.treasury import treasury_liquidity_policy, treasury_reserves_policy, treasury_liq_safety_check


def p_treasury(params, substep, state_history, state) -> dict:
    day = len(state_history)
    prev_day = state_history[-1][-1]
    liq_stables_prior = prev_day["liq_stables"]
    net_flow = state["net_flow"]
    net_flow_bondsale = state['netflow_bondsale']
    net_flow_bondexpire = state['netflow_bondexpire']
    reserves_in = state["reserves_in"]
    bid_change_usd = state["bid_change_usd"]
    ask_change_usd = state["ask_change_usd"]
    amm_k = state["amm_k"]
    reserves_stables_prior = prev_day["reserves_stables"]
    price_prior = prev_day["price"]
    cum_shit_purchased_prior = prev_day["cum_shit_purchased"]
    cum_shit_burnt_prior = prev_day["cum_shit_burnt"]
    cum_shit_minted_prior = prev_day["cum_shit_minted"]
    bid_change_shit = state["bid_change_shit"]
    ask_change_shit = state["ask_change_shit"]

    #liq_safety_check = treasury_liq_safety_check(liq_stables_prior,net_flow_bondexpire,params['liq_stables_safety_ratio'],day)

    liq_stables, liq_shit, price = treasury_liquidity_policy(
        liq_stables_prior, net_flow, net_flow_bondsale, net_flow_bondexpire, reserves_in, bid_change_usd, ask_change_usd, amm_k,day)

    reserves_out, reserves_stables, shit_traded, cum_shit_purchased, cum_shit_burnt, cum_shit_minted = treasury_reserves_policy(liq_stables, liq_stables_prior, net_flow, net_flow_bondsale, net_flow_bondexpire, reserves_stables_prior,
                                                                                                                            price, price_prior, cum_shit_purchased_prior, cum_shit_burnt_prior, cum_shit_minted_prior, bid_change_shit, ask_change_shit)
    return {"liq_stables": liq_stables,
            "liq_shit": liq_shit,
            "price": price, "reserves_out": reserves_out, "reserves_stables": reserves_stables,
            "shit_traded": shit_traded, "cum_shit_purchased": cum_shit_purchased, "cum_shit_burnt": cum_shit_burnt, "cum_shit_minted": cum_shit_minted}


def s_liq_stables(_params, substep, state_history, state, _input) -> tuple:
    return ("liq_stables", _input["liq_stables"])


def s_liq_shit(_params, substep, state_history, state, _input) -> tuple:
    return ("liq_shit", _input["liq_shit"])


def s_price(_params, substep, state_history, state, _input) -> tuple:
    assert _input["price"] > 0, "price should be bigger than 0"
    return ("price", _input["price"])


def s_reserves_out(_params, substep, state_history, state, _input) -> tuple:
    return ("reserves_out", _input["reserves_out"])


def s_reserves_stables(_params, substep, state_history, state, _input) -> tuple:
    return ("reserves_stables", _input["reserves_stables"])


def s_shit_traded(_params, substep, state_history, state, _input) -> tuple:
    return ("shit_traded", _input["shit_traded"])


def s_cum_shit_purchased(_params, substep, state_history, state, _input) -> tuple:
    return ("cum_shit_purchased", _input["cum_shit_purchased"])


def s_cum_shit_burnt(_params, substep, state_history, state, _input) -> tuple:
    return ("cum_shit_burnt", _input["cum_shit_burnt"])


def s_cum_shit_minted(_params, substep, state_history, state, _input) -> tuple:
    return ("cum_shit_minted", _input["cum_shit_minted"])
