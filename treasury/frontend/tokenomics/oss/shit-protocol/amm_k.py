from ..types import StateType
def amm_k_mechanism(state_var:StateType):
    liquidity_stables,price = state_var['liq_stables'],state_var['price']
    return liquidity_stables**2/price