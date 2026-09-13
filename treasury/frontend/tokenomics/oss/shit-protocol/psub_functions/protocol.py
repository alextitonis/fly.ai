from ..mechanism.protocol import floating_supply_mechanism,mcap_mechanism,ratio_mechanism
def p_protocol(params, substep, state_history, state) -> dict:
    protocol_vars = {
        'floating_supply':floating_supply_mechanism(state['supply'],state['liq_shit']),
        'mcap':mcap_mechanism(state['supply'],state['price']),
        'liq_ratio':ratio_mechanism(state['liq_stables'],state['treasury_stables']) ,
        'reserves_ratio': ratio_mechanism( state['reserves_stables'], state['liq_stables']),
        'total_demand':state['market_demand_supply'].total_demand,
        'total_supply':state['market_demand_supply'].total_supply,
        'total_net':state['market_demand_supply'].total_demand + state['market_demand_supply'].total_supply
    }
    protocol_vars['floating_mcap']=mcap_mechanism(protocol_vars['floating_supply'],state['price'])
    protocol_vars['target_liq_ratio_reached']=(protocol_vars['liq_ratio'] >= params['max_liq_ratio'] )
    protocol_vars['fmcap_treasury_ratio'] =ratio_mechanism( protocol_vars['floating_mcap'],state['treasury_stables'])
    protocol_vars['liq_fmcap_ratio'] = ratio_mechanism(state['liq_stables'] ,protocol_vars['floating_mcap'])
    return protocol_vars

def s_floating_supply(params,substep, state_history, state,_input) -> tuple:
    
    return  ('floating_supply',_input['floating_supply'])
def s_mcap(params,substep, state_history, state,_input) -> tuple:
    
    return  ('mcap',_input['mcap'])
def s_floating_mcap(params,substep, state_history, state,_input) -> tuple:
    
    return  ('floating_mcap',_input['floating_mcap'])
    
def s_liq_ratio(params,substep, state_history, state,_input) -> tuple:
    
    return  ('liq_ratio',_input['liq_ratio'])

def s_target_liq_ratio_reached(params,substep, state_history, state,_input) -> tuple:
    
    return  ('target_liq_ratio_reached',_input['target_liq_ratio_reached'])
def s_reserves_ratio(params,substep, state_history, state,_input) -> tuple:
    
    return  ('reserves_ratio',_input['reserves_ratio'])
def s_fmcap_treasury_ratio(params,substep, state_history, state,_input) -> tuple:
    
    return  ('fmcap_treasury_ratio',_input['fmcap_treasury_ratio'])
def s_liq_fmcap_ratio(params,substep, state_history, state,_input) -> tuple:
    
    return  ('liq_fmcap_ratio',_input['liq_fmcap_ratio'])
def s_total_demand(params,substep, state_history, state,_input) -> tuple:
    
    return  ('total_demand',_input['total_demand'])
def s_total_supply(params,substep, state_history, state,_input) -> tuple:
    
    return  ('total_supply',_input['total_supply'])
def s_total_net(params,substep, state_history, state,_input) -> tuple:
    
    return  ('total_net',_input['total_net'])