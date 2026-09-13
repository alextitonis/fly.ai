from ..types import StateType, ParamsType
from ..mechanism.supply import supply_mechanism
def s_supply(_params, substep, state_history, state:StateType, _input) -> tuple:
    
    return ("supply",supply_mechanism(state))
