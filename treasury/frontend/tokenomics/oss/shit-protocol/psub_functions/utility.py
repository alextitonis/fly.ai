def s_list_params(variable):
    # Factory which creates state update step

    def output_function(_params, substep, state_history, state, _input):
        return (variable, _input[variable])

    return output_function

def s_interrupt(params,substep, state_history, state,_input) -> tuple:
    # interrupt this run of simulation if after the treasury update we found the pool has been drained
    interrupt = False
    if (state['liq_stables'] <=0) or (state['price']<=0) or (state['reserves_stables']<=0):
        interrupt = True
    
    return ('interrupt', interrupt)