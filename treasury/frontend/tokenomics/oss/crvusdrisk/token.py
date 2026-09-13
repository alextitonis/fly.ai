"""Simple DTO for token data."""
from dataclasses import dataclass


@dataclass(frozen=True, order=True)
class TokenDTO:
    """
    Data Transfer Object to store relevant
    token data.
    """

    # TODO DTO min/max trade sizes should be dynamic
    address: str
    name: str
    symbol: str
    decimals: int
    min_trade_size: float  # min amt_in for 1inch quotes
    max_trade_size: float  # max amt_in for 1inch quotes
