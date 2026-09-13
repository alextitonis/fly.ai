def s_amm_k(_params, substep, state_history, state, _input) -> tuple:
    return ("amm_k",state['amm_k']) # a constant that doesn't change