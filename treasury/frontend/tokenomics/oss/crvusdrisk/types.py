"""Useful type aliases."""
from typing import TypeAlias, Dict, Tuple
from crvusdsim.pool.sim_interface import SimLLAMMAPool, SimCurveStableSwapPool
from curvesim.pool.sim_interface import SimCurvePool
from ..modules import ExternalMarket
from ..data_transfer_objects import TokenDTO

SimPoolType: TypeAlias = (
    SimLLAMMAPool | SimCurveStableSwapPool | SimCurvePool | ExternalMarket
)
PairwisePricesType: TypeAlias = Dict[str, Dict[str, float]]
MarketsType: TypeAlias = Dict[Tuple[TokenDTO, TokenDTO], ExternalMarket]
