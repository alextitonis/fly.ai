def p_reserves_in(params, substep, state_history, state) -> dict:
    day = len(state_history)
    prior_day = state_history[-1][-1]

    if day % 7 == 0:  # Rebalance once a week
        reserves_in = prior_day["liq_stables"] - \
            prior_day["treasury_stables"] * params["max_liq_ratio"]
        if prior_day["target_liq_ratio_reached"] is False:
            # Smaller max_outflow_rate until target is first reached
            max_outflow = (-1) * prior_day["reserves_stables"] * \
                params["max_outflow_rate"] * 2 / 3
        else:
            # Ensure that the reserve release is limited by max_outflow_rate
            max_outflow = (-1) * prior_day["reserves_stables"] * \
                params["max_outflow_rate"]

        if reserves_in < max_outflow:
            reserves_in = max_outflow
        # Ensure that the reserve release is limited by the total reserves left
        if reserves_in < (-1) * prior_day["reserves_stables"]:
            reserves_in = (-1) * prior_day["reserves_stables"]
    else:
        reserves_in = 0
    return {'reserves_in': reserves_in}

def treasury_liq_safety_check(liq_stables_prior,net_flow_bondexpire,safetyratio,day):
    assert (liq_stables_prior+net_flow_bondexpire) > (safetyratio*liq_stables_prior), f"on day {day}, the amount of netflow caused by shit bond expiration exceeds {safetyratio}*liq_stables, may cause excessive drainage of the liquidity pool"

def treasury_liquidity_policy(liq_stables_prior, net_flow, net_flow_bondsale, net_flow_bondexpire, reserves_in, bid_change_usd, ask_change_usd, amm_k,day):
    
    liq_stables = liq_stables_prior + net_flow + net_flow_bondsale + net_flow_bondexpire - reserves_in + bid_change_usd - ask_change_usd
    #assert liq_stables>0, f"liq_stables below 0 on day {day}, the whole pool drained."
    # ensure that if liq_stables is 0 then liq_shit is 0 as well
    liq_shit = liq_stables and amm_k / liq_stables or 0
    # ensure that if liq_shit is 0 then price is 0 as well
    price = liq_shit and liq_stables / liq_shit or 0

    #print(f'liq:{liq_stables}'+f'liq delta:{liq_stables-liq_stables_prior}  bid_change:{bid_change_usd} ask_change+reserves_in:{ask_change_usd + reserves_in}')
    return liq_stables, liq_shit, price


def treasury_reserves_policy(liq_stables, liq_stables_prior, net_flow, net_flow_bondsale, net_flow_bondexpire, reserves_stables_prior,
                             price, price_prior, cum_shit_purchased_prior, cum_shit_burnt_prior, cum_shit_minted_prior, bid_change_shit, ask_change_shit):
    reserves_out = liq_stables - liq_stables_prior - \
        (net_flow + net_flow_bondsale + net_flow_bondexpire) # reserves_out = bid_change_usd - ask_change_usd - reserves_in
    reserves_stables = reserves_stables_prior - reserves_out # allowing reserve stables to be negative, which will terminate the simulation

    shit_traded = (price + price_prior) and (-2) * \
        reserves_out / (price + price_prior) or 0
    cum_shit_purchased = cum_shit_purchased_prior - shit_traded
    cum_shit_burnt = cum_shit_burnt_prior + bid_change_shit
    cum_shit_minted = cum_shit_minted_prior + ask_change_shit

    return reserves_out, reserves_stables, shit_traded, cum_shit_purchased, cum_shit_burnt, cum_shit_minted
