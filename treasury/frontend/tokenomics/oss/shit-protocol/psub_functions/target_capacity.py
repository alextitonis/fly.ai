def p_target_capacity(_params, substep, state_history, state) -> dict:
    prior_day = state_history[-1][-1]
    out = {}
    out["bid_capacity_target"] = _params["bid_factor"] * \
        prior_day["reserves_stables"]

    out["ask_capacity_target"] = prior_day["upper_target_wall"] and _params["ask_factor"] * \
        prior_day["reserves_stables"] * \
        (1 + 2 * _params["upper_wall"]) / \
        prior_day["upper_target_wall"] or 0
    out["bid_capacity_target_cushion"] = out["bid_capacity_target"] * \
        _params["cushion_factor"]
    out["ask_capacity_target_cushion"] = out["ask_capacity_target"] * \
        _params["cushion_factor"]

    # Price without any treasury market operations
    out["natural_price"] = state["amm_k"] and (
        (state["net_flow"] - state["reserves_in"] + prior_day["liq_stables"]) ** 2) / state["amm_k"] or 0

    return out


def s_bid_capacity_target(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_capacity_target", _input["bid_capacity_target"])


def s_ask_capacity_target(_params, substep, state_history, state, _input) -> tuple:

    return ("ask_capacity_target", _input["ask_capacity_target"])


def s_bid_capacity_target_cushion(_params, substep, state_history, state, _input) -> tuple:
    return ("bid_capacity_target_cushion", _input["bid_capacity_target_cushion"])


def s_ask_capacity_target_cushion(_params, substep, state_history, state, _input) -> tuple:
    return ("ask_capacity_target_cushion", _input["ask_capacity_target_cushion"])


def s_natural_price(_params, substep, state_history, state, _input) -> tuple:
    assert _input["natural_price"] > 0, "natural price should be bigger than 0"

    return ("natural_price", _input["natural_price"])
