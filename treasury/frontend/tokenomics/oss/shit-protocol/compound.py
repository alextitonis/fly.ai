from dataclasses import dataclass
from .primitives import PlaceholderTypeDemandSupply,day,SHIT


@dataclass
class MarketDemandSupply:
    total_supply: PlaceholderTypeDemandSupply
    total_demand: PlaceholderTypeDemandSupply

@dataclass
class SHITbond:
    total_amount: SHIT
    expiration_duration: day
    start_date:day
    