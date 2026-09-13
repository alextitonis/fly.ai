from dataclasses import dataclass

@dataclass
class SystemParameters:
    """Core parameters for stablecoin dynamics."""
    
    # Stabilization mechanism
    mint_coefficient: float = 0.1
    burn_coefficient: float = 0.1
    
    # Market dynamics
    liquidity_depth: float = 1e6
    demand_elasticity: float = 0.5
    
    # Initial conditions
    initial_supply: float = 1e6
    initial_collateral: float = 1.5e6
    initial_price: float = 1.0
    initial_liquidity: float = 1e6
    initial_demand: float = 1e6
    
    # Simulation
    dt: float = 0.1  # time step
    random_seed: int = 42
    
    # Collapse thresholds
    collapse_price_threshold: float = 0.5
    recovery_price_threshold: float = 0.95
