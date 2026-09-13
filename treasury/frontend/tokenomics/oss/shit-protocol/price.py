import numpy as np


def s_price_history(params, substep, state_history, state, _input) -> tuple:
    if 'price_history' in state.keys():
        new_history = state['price_history']+[state['price']]
    else:
        new_history = [state['price']]
    return ("price_history", new_history)


def s_bid_counter(params, substep, state_history, state, _input) -> tuple:
    return ('bid_counter', _input['bid_counter'])


def s_ask_counter(params, substep, state_history, state, _input) -> tuple:
    return ('ask_counter', _input['ask_counter'])

# moving average target


def s_ma_target(params, substep, state_history, state, _input) -> tuple:

    days = state['timestep']-1
    days_ma = params["target_ma"]

    price_history = state['price_history']

    if days > days_ma:
        ma_target = np.mean(price_history[-days_ma:])

    elif days == 0:
        ma_target = price_history[0]

    else:
        s = sum(price_history[1:])  # skip day 0
        s += price_history[1] * (days_ma - days)
        ma_target = s / days_ma
    return ("ma_target", ma_target)

# liquidity backing target


def s_lb_target(params, substep, state_history, state, _input) -> tuple:
    if state['floating_supply']:
        lb_target = state['liq_backing'] / state['floating_supply']
    else:
        lb_target = 0
    return ("lb_target", lb_target)

# actual price target being used in RBS


def s_price_target(params, substep, state_history, state, _input) -> tuple:
    return ('price_target', _input['price_target'])

# walls


def s_upper_target_wall(params, substep, state_history, state, _input) -> tuple:
    return ("upper_target_wall", _input['upper_target_wall'])


def s_lower_target_wall(params, substep, state_history, state, _input) -> tuple:
    return ("lower_target_wall", _input['lower_target_wall'])

# cushions


def s_lower_target_cushion(params, substep, state_history, state, _input) -> tuple:
    assert _input['lower_target_cushion'] > 0,"lower target cushion should be bigger than 0"
    assert _input['lower_target_cushion'] < _input['upper_target_cushion'], "lower_target_cushion: {}, upper_target_cushion: {}, timestep: {}".format(
        _input['lower_target_cushion'], _input['upper_target_cushion'], len(state_history))

    return ("lower_target_cushion", _input['lower_target_cushion'])


def s_upper_target_cushion(params, substep, state_history, state, _input) -> tuple:

    assert _input['upper_target_cushion'] > 0, "upper target cushion should be bigger than 0"
    assert _input['lower_target_cushion'] < _input['upper_target_cushion'], "lower_target_cushion: {}, upper_target_cushion: {}, timestep: {}".format(
        _input['lower_target_cushion'], _input['upper_target_cushion'], len(state_history))

    return ("upper_target_cushion", _input['upper_target_cushion'])
