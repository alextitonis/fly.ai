def real_bid_capacity_cushion_policy(bid_counter, min_counter_reinstate, with_reinstate_window, natural_price, lower_target_cushion, bid_capacity_target_cushion, bid_capacity_target_cushion_prior, lower_target_wall, net_flow, reserves_in, liq_stables_prior, amm_k, bid_capacity_cushion_prior):

    # Refill capacity
    if (sum(bid_counter) >= min_counter_reinstate or with_reinstate_window == "No") and natural_price > lower_target_cushion:
        bid_capacity_cushion = bid_capacity_target_cushion
    elif natural_price < lower_target_cushion and natural_price >= lower_target_wall:  # Deploy cushion capcity
        bid_capacity_cushion = bid_capacity_target_cushion_prior + \
            net_flow - reserves_in + liq_stables_prior - \
            (amm_k * lower_target_cushion) ** (1/2)

    else:
        bid_capacity_cushion = bid_capacity_cushion_prior

    if bid_capacity_cushion < 0:
        bid_capacity_cushion = 0
    elif bid_capacity_cushion > bid_capacity_target_cushion:
        bid_capacity_cushion = bid_capacity_target_cushion

    return bid_capacity_cushion


def real_ask_capacity_cushion_policy(ask_counter, min_counter_reinstate, with_reinstate_window, natural_price, upper_target_cushion, ask_capacity_target_cushion, upper_target_wall, ask_capacity_cushion_prior, net_flow, reserves_in, liq_stables_prior, amm_k):
    if (sum(ask_counter) >= min_counter_reinstate or with_reinstate_window == 'No') and natural_price < upper_target_cushion:
        ask_capacity_cushion = ask_capacity_target_cushion
    elif natural_price > upper_target_cushion and natural_price <= upper_target_wall:
        ask_capacity_cushion = upper_target_cushion and ask_capacity_cushion_prior - \
            (net_flow - reserves_in + liq_stables_prior) / \
            upper_target_cushion + \
            (amm_k / upper_target_cushion) ** (1/2) or 0
    else:
        ask_capacity_cushion = ask_capacity_cushion_prior

    if ask_capacity_cushion < 0:
        ask_capacity_cushion = 0
    elif ask_capacity_cushion > ask_capacity_target_cushion:
        ask_capacity_cushion = ask_capacity_target_cushion

    return ask_capacity_cushion


def effective_bid_capacity_cushion_policy(natural_price, lower_target_cushion, lower_target_wall, bid_capacity_cushion_prior, bid_capacity_cushion):
    if natural_price <= lower_target_cushion and natural_price > lower_target_wall:
        bid_change_cushion_usd = bid_capacity_cushion_prior - bid_capacity_cushion
        bid_change_cushion_shit = lower_target_cushion and (
            bid_capacity_cushion_prior - bid_capacity_cushion) / lower_target_cushion or 0
    else:
        bid_change_cushion_usd = 0
        bid_change_cushion_shit = 0

    # Ensure that change is smaller than capacity left
    if bid_change_cushion_shit > bid_capacity_cushion_prior:
        bid_change_cushion_usd = bid_capacity_cushion_prior
        bid_change_cushion_shit = lower_target_cushion and bid_capacity_cushion_prior / \
            lower_target_cushion or 0

    return bid_change_cushion_usd, bid_change_cushion_shit


def effective_ask_capacity_cushion_policy(natural_price, upper_target_cushion, upper_target_wall, ask_capacity_cushion_prior, ask_capacity_cushion):

    if natural_price > upper_target_cushion and natural_price <= upper_target_wall:
        ask_change_cushion_shit = ask_capacity_cushion_prior - ask_capacity_cushion
        ask_change_cushion_usd = upper_target_cushion * \
            (ask_capacity_cushion_prior - ask_capacity_cushion)
    else:
        ask_change_cushion_shit = 0
        ask_change_cushion_usd = 0

    # ensure that change is smaller than capacity left
    if ask_change_cushion_shit > ask_capacity_cushion_prior:
        ask_change_cushion_shit = ask_capacity_cushion_prior
        ask_change_cushion_usd = ask_capacity_cushion_prior * upper_target_cushion

    return ask_change_cushion_usd, ask_change_cushion_shit


def real_bid_capacity_totals_policy(target, lb_target, natural_price, lower_wall_param, bid_capacity_target,
                                    bid_counter, min_counter_reinstate_param, with_reinstate_window_param, lower_target_cushion,
                                    lower_target_wall, bid_capacity_prior, net_flow, reserves_in, liq_stables_prior, amm_k,
                                    bid_change_cushion_usd, bid_capacity_cushion):

    if target == lb_target and natural_price <= lb_target * (1 - lower_wall_param):
        # Below liquid backing, the wall has infinite capacity (unlimited treasury redemptions at those levels)
        bid_capacity = bid_capacity_target
    elif (sum(bid_counter) >= min_counter_reinstate_param or with_reinstate_window_param == 'No') and natural_price > lower_target_cushion:  # Refill capacity
        bid_capacity = bid_capacity_target
    elif natural_price < lower_target_wall:  # Deploy cushion capcity
        bid_capacity = bid_capacity_prior + net_flow - reserves_in + \
            liq_stables_prior - (amm_k * lower_target_wall) ** (1/2)
    else:
        bid_capacity = bid_capacity_prior - bid_change_cushion_usd

    if bid_capacity < 0:
        bid_capacity = 0
    elif bid_capacity > bid_capacity_target:
        bid_capacity = bid_capacity_target

    if bid_capacity_cushion > bid_capacity:
        bid_capacity_cushion = bid_capacity

    return bid_capacity_cushion, bid_capacity


def real_ask_capacity_totals_policy(ask_capacity_cushion, ask_counter, min_counter_reinstate_param, with_reinstate_window_param,
                                    natural_price, upper_target_cushion, ask_capacity_target, upper_target_wall, ask_capacity_prior, net_flow, reserves_in, liq_stables_prior,
                                    amm_k, ask_change_cushion_shit):
    # ASK: Real Ask Capacity - Totals
    if (sum(ask_counter) >= min_counter_reinstate_param or with_reinstate_window_param == 'No') and natural_price < upper_target_cushion:
        ask_capacity = ask_capacity_target
    elif natural_price > upper_target_wall:
        ask_capacity = upper_target_wall and ask_capacity_prior - \
            (net_flow - reserves_in + liq_stables_prior) / \
            upper_target_wall + (amm_k / upper_target_wall) ** (1/2) or 0
    else:
        # update capacity total to account for the cushion
        ask_capacity = ask_capacity_prior - ask_change_cushion_shit

    if ask_capacity < 0:
        ask_capacity = 0
    elif ask_capacity > ask_capacity_target:
        ask_capacity = ask_capacity_target

    if ask_capacity_cushion > ask_capacity:
        ask_capacity_cushion = ask_capacity

    return ask_capacity_cushion, ask_capacity


def effective_bid_capacity_changes_totals_policy(target, lb_target, natural_price, lower_wall_param,
                                                 reserves_in, net_flow, liq_stables_prior, amm_k, lower_target_wall, bid_change_cushion_usd, bid_change_cushion_shit,
                                                 bid_capacity_prior, bid_capacity):
    # Below liquid backing, the wall has infinite capacity (unlimited treasury redemptions at those levels)
    if target == lb_target and natural_price <= lb_target * (1 - lower_wall_param):
        bid_change_usd = reserves_in - net_flow - \
            liq_stables_prior + (amm_k * lower_target_wall) ** (1/2)
        bid_change_shit = lower_target_wall and bid_change_usd / lower_target_wall or 0
    elif natural_price >= lower_target_wall:  # If wall wasn't used, update with cushion
        bid_change_usd = bid_change_cushion_usd
        bid_change_shit = bid_change_cushion_shit
    else:
        bid_change_usd = bid_capacity_prior - bid_capacity
        bid_change_shit = lower_target_wall and bid_change_cushion_shit + \
            (bid_capacity_prior - bid_capacity -
             bid_change_cushion_usd) / lower_target_wall or 0

    if bid_change_usd > bid_capacity_prior:  # Ensure that change is smaller than capacity left
        bid_change_usd = bid_capacity_prior
        bid_change_shit = lower_target_wall and bid_capacity_prior / lower_target_wall or 0
    return bid_change_shit, bid_change_usd


def effective_ask_capacity_changes_totals_policy(natural_price, upper_target_wall, ask_change_cushion_shit, ask_change_cushion_usd,
                                                 ask_capacity_prior, ask_capacity):
    if natural_price <= upper_target_wall:  # if wall wasn't used, update with cushion
        ask_change_shit = ask_change_cushion_shit
        ask_change_usd = ask_change_cushion_usd
    else:
        ask_change_shit = ask_capacity_prior - ask_capacity
        ask_change_usd = ask_change_cushion_usd + \
            (ask_capacity_prior - ask_capacity -
             ask_change_cushion_shit) * upper_target_wall

    if ask_change_shit > ask_capacity_prior:  # ensure that change is smaller than capacity left
        ask_change_shit = ask_capacity_prior
        ask_change_usd = ask_capacity_prior * upper_target_wall

    return ask_change_shit, ask_change_usd
