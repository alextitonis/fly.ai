import numpy as np
from .parameters import SystemParameters

def arbitrage_opportunity(P: float, S: float, L: float) -> float:
    """
    Calculate arbitrage opportunity size.
    
    Args:
        P: Current price
        S: Current supply
        L: Available liquidity
        
    Returns:
        Arbitrage profit potential
    """
    price_deviation = abs(P - 1.0)
    max_arbitrage = min(S * 0.1, L * 0.2)
    return price_deviation * max_arbitrage

def reflexivity_coefficient(P: float, historical_prices: list) -> float:
    """
    Reflexive feedback strength.
    
    High when price is trending away from peg.
    
    Args:
        P: Current price
        historical_prices: Recent price history
        
    Returns:
        Reflexivity measure [0, 1]
    """
    if len(historical_prices) < 2:
        return 0.0
    
    trend = P - historical_prices[-1]
    deviation = abs(P - 1.0)
    
    return min(abs(trend) * deviation * 10, 1.0)
