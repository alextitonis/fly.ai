"""
Simple economic model of the Bold protocol vault system.
This model simulates the core mechanics of the Bold system including:
- Trove creation and management
- Interest accrual
- Batch management
- Liquidations
- Stability Pool interactions

Bold Protocol is a decentralized borrowing protocol that allows users to obtain
interest-free liquidity against Ethereum or other assets as collateral. It follows
the mechanisms of Liquity with improvements such as support for multiple collateral 
types, interest accrual, and batch trove management.
"""

import numpy as np
import matplotlib.pyplot as plt
from dataclasses import dataclass
from typing import List, Dict, Optional

# Constants from the protocol
DECIMAL_PRECISION = 1e18
MIN_DEBT = 2000 * DECIMAL_PRECISION
ETH_GAS_COMPENSATION = 0.0375 * 1e18  # In wei

# Collateral parameters
CCR_WETH = 1.50  # 150% - Critical Collateral Ratio for system-wide safety
MCR_WETH = 1.10  # 110% - Minimum Collateral Ratio for individual troves
BCR_ALL = 0.10   # 10% - Buffer for batch operations on top of MCR
LIQUIDATION_PENALTY_SP_WETH = 0.05  # 5% - Penalty for liquidation via Stability Pool
LIQUIDATION_PENALTY_REDISTRIBUTION_WETH = 0.10  # 10% - Penalty for liquidation via redistribution

# Interest rate parameters
MIN_ANNUAL_INTEREST_RATE = 0.005  # 0.5% - Minimum annual interest rate allowed
MAX_ANNUAL_INTEREST_RATE = 2.50   # 250% - Maximum annual interest rate allowed 
MAX_MANAGEMENT_FEE = 0.10  # 10% - Maximum management fee for batch managers
ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60


@dataclass
class Trove:
    """
    Represents a user's trove (vault) in the Bold system.
    
    A trove is the fundamental unit of the Bold protocol, where users deposit 
    collateral and borrow BOLD stablecoins. Each trove must maintain a minimum
    collateralization ratio to avoid liquidation.
    """
    id: int
    owner: str
    collateral: float  # ETH amount
    debt: float        # BOLD amount
    interest_rate: float
    batch_manager: Optional[str] = None
    last_update: int = 0  # timestamp
    
    def icr(self, eth_price: float) -> float:
        """
        Calculate individual collateralization ratio (ICR) for this trove.
        
        The ICR is the ratio of the USD value of the collateral to the debt.
        It is the key metric for determining a trove's health and liquidation risk.
        A trove with ICR below MCR is eligible for liquidation.
        
        Args:
            eth_price: Current ETH price in USD
            
        Returns:
            The collateralization ratio as a float (e.g. 1.5 for 150%)
        """
        return (self.collateral * eth_price) / self.debt if self.debt > 0 else float('inf')
    
    def is_below_mcr(self, eth_price: float) -> bool:
        """
        Check if trove is below minimum collateralization ratio (MCR).
        
        Troves below MCR are eligible for liquidation. This function helps
        users and the system determine if a trove is at risk.
        
        Args:
            eth_price: Current ETH price in USD
            
        Returns:
            True if the trove's ICR is below MCR, False otherwise
        """
        return self.icr(eth_price) < MCR_WETH


@dataclass
class InterestBatch:
    """
    Represents a batch of troves managed together.
    
    Batching allows multiple troves to be managed as a group with the same
    interest rate and management fee. This improves capital efficiency and
    allows for specialized batch managers who curate pools of high-quality
    borrowers.
    """
    manager: str
    interest_rate: float
    management_fee: float
    troves: List[int]  # List of trove IDs
    total_debt: float = 0
    total_collateral: float = 0
    last_update: int = 0  # timestamp
    
    def update_totals(self, troves_dict: Dict[int, Trove]):
        """
        Update batch totals based on member troves.
        
        This function recalculates the total debt and collateral in the batch
        based on the current state of all member troves. This is essential when
        troves join, leave, or are modified within a batch.
        
        Args:
            troves_dict: Dictionary mapping trove IDs to Trove objects
        """
        self.total_debt = sum(troves_dict[id].debt for id in self.troves)
        self.total_collateral = sum(troves_dict[id].collateral for id in self.troves)


class StabilityPool:
    """
    Represents the stability pool where users deposit BOLD to earn yield.
    
    The Stability Pool is a key component of the Bold system that:
    1. Provides a source of liquidity for liquidations
    2. Allows BOLD holders to earn liquidation gains in ETH and other collateral
    3. Acts as a first line of defense for the system's overall stability
    
    When troves are liquidated, debt is offset with BOLD from the Stability Pool,
    and the liquidated collateral (minus a small fee) is distributed to depositors.
    """
    
    def __init__(self):
        self.total_deposits = 0
        self.depositors = {}  # addr -> amount
        self.eth_gain = 0
        
    def deposit(self, addr: str, amount: float):
        """
        Add BOLD to stability pool.
        
        Users deposit BOLD into the Stability Pool to earn a share of the
        collateral from liquidated troves. The amount deposited determines
        the proportion of liquidation gains the user will receive.
        
        Args:
            addr: Address of the depositor
            amount: Amount of BOLD to deposit
        """
        if addr not in self.depositors:
            self.depositors[addr] = 0
        self.depositors[addr] += amount
        self.total_deposits += amount
        
    def withdraw(self, addr: str, amount: float):
        """
        Withdraw BOLD from stability pool.
        
        Users can withdraw their BOLD deposits along with any accumulated
        ETH gains from liquidations. This function handles only the BOLD
        withdrawal part.
        
        Args:
            addr: Address of the depositor
            amount: Amount of BOLD to withdraw
        """
        if addr in self.depositors and self.depositors[addr] >= amount:
            self.depositors[addr] -= amount
            self.total_deposits -= amount
            if self.depositors[addr] == 0:
                del self.depositors[addr]
    
    def offset_debt(self, debt_to_offset: float, collateral_to_distribute: float):
        """
        Process a liquidation, offset debt and distribute collateral.
        
        When a trove is liquidated, this function:
        1. Uses BOLD from the Stability Pool to offset the trove's debt
        2. Distributes the liquidated collateral to depositors proportionally
        
        This is a key stability mechanism of the protocol that ensures
        BOLD maintains its value and depositors are rewarded for providing liquidity.
        
        Args:
            debt_to_offset: Amount of debt to offset with BOLD from the pool
            collateral_to_distribute: Amount of collateral to distribute to depositors
            
        Returns:
            Amount of debt that was actually offset
        """
        if self.total_deposits == 0:
            return 0  # Nothing to offset
        
        amount_offset = min(debt_to_offset, self.total_deposits)
        
        # Distribute collateral proportionally
        for addr, deposit in list(self.depositors.items()):
            share = deposit / self.total_deposits
            eth_gain = collateral_to_distribute * share
            self.depositors[addr] -= min(deposit, amount_offset * share)
            # In a real implementation, we'd track ETH gains per depositor
        
        self.total_deposits -= amount_offset
        return amount_offset


class BoldProtocol:
    """
    Simulates the Bold protocol economic model.
    
    The Bold Protocol is a decentralized borrowing protocol allowing users to obtain
    liquidity by depositing collateral and minting BOLD stablecoins. It implements
    various stability mechanisms including:
    
    1. Overcollateralization with minimum collateral requirements
    2. Liquidation of undercollateralized positions 
    3. Stability Pool for efficient liquidations
    4. Interest accrual on borrowed BOLD
    5. Batch management for improved capital efficiency
    """
    
    def __init__(self, initial_eth_price: float = 2000.0):
        self.troves = {}  # id -> Trove
        self.batches = {}  # manager -> InterestBatch
        self.stability_pool = StabilityPool()
        self.eth_price = initial_eth_price
        self.total_system_debt = 0
        self.total_collateral = 0
        self.next_trove_id = 1
        self.current_time = 0  # seconds
        
    def open_trove(self, owner: str, collateral: float, debt: float, interest_rate: float) -> int:
        """
        Create a new trove.
        
        Users call this function to:
        1. Deposit collateral (ETH or other assets)
        2. Borrow BOLD stablecoins
        3. Set their interest rate
        
        The system enforces minimum debt, collateralization ratio, and valid interest
        rate requirements to ensure system stability and economic viability.
        
        Args:
            owner: Address of the trove owner
            collateral: Amount of collateral to deposit
            debt: Amount of BOLD debt to mint
            interest_rate: Annual interest rate for the trove
            
        Returns:
            ID of the newly created trove
            
        Raises:
            ValueError: If the trove does not meet minimum requirements
        """
        if debt < MIN_DEBT / DECIMAL_PRECISION:
            raise ValueError(f"Debt must be at least {MIN_DEBT / DECIMAL_PRECISION} BOLD")
        
        required_icr = MCR_WETH
        if (collateral * self.eth_price) / debt < required_icr:
            raise ValueError(f"Insufficient collateral ratio, must be at least {required_icr*100}%")
        
        if interest_rate < MIN_ANNUAL_INTEREST_RATE or interest_rate > MAX_ANNUAL_INTEREST_RATE:
            raise ValueError(f"Interest rate must be between {MIN_ANNUAL_INTEREST_RATE*100}% and {MAX_ANNUAL_INTEREST_RATE*100}%")
        
        trove_id = self.next_trove_id
        self.next_trove_id += 1
        
        self.troves[trove_id] = Trove(
            id=trove_id,
            owner=owner,
            collateral=collateral,
            debt=debt,
            interest_rate=interest_rate,
            last_update=self.current_time
        )
        
        self.total_system_debt += debt
        self.total_collateral += collateral
        
        return trove_id
    
    def create_batch(self, manager: str, interest_rate: float, management_fee: float = 0.025) -> None:
        """
        Create a new batch manager.
        
        Batch managers can:
        1. Set a common interest rate for all troves in their batch
        2. Earn a management fee on the interest generated by these troves
        3. Curate a pool of borrowers with uniform risk characteristics
        
        The system enforces limits on interest rates and management fees to
        protect borrowers and maintain system stability.
        
        Args:
            manager: Address of the batch manager
            interest_rate: Annual interest rate for all troves in this batch
            management_fee: Percentage of interest that goes to the manager
            
        Raises:
            ValueError: If the interest rate or management fee is out of bounds
        """
        if interest_rate < MIN_ANNUAL_INTEREST_RATE or interest_rate > MAX_ANNUAL_INTEREST_RATE:
            raise ValueError(f"Interest rate must be between {MIN_ANNUAL_INTEREST_RATE*100}% and {MAX_ANNUAL_INTEREST_RATE*100}%")
        
        if management_fee > MAX_MANAGEMENT_FEE:
            raise ValueError(f"Management fee cannot exceed {MAX_MANAGEMENT_FEE*100}%")
        
        self.batches[manager] = InterestBatch(
            manager=manager,
            interest_rate=interest_rate,
            management_fee=management_fee,
            troves=[],
            last_update=self.current_time
        )
    
    def join_batch(self, trove_id: int, batch_manager: str) -> None:
        """
        Add a trove to a batch.
        
        Users call this function to:
        1. Join a batch with a potentially more favorable interest rate
        2. Benefit from the batch's management and risk pooling
        
        Troves must meet the batch's collateralization requirements, which are
        higher than the minimum requirement for individual troves. This ensures
        batch stability and protects the manager from sudden liquidations.
        
        Args:
            trove_id: ID of the trove to add
            batch_manager: Address of the batch manager
            
        Raises:
            ValueError: If the trove or batch doesn't exist or if the trove
                        doesn't meet the batch's collateral requirements
        """
        if trove_id not in self.troves:
            raise ValueError("Trove doesn't exist")
        
        if batch_manager not in self.batches:
            raise ValueError("Batch manager doesn't exist")
        
        trove = self.troves[trove_id]
        
        # Apply interest before joining batch
        self._apply_interest(trove_id)
        
        # Check if trove meets batch collateral requirement (MCR + BCR)
        required_icr = MCR_WETH + BCR_ALL
        if trove.icr(self.eth_price) < required_icr:
            raise ValueError(f"Insufficient collateral ratio for batch, must be at least {required_icr*100}%")
        
        # Remove from previous batch if applicable
        if trove.batch_manager:
            old_batch = self.batches[trove.batch_manager]
            old_batch.troves.remove(trove_id)
            old_batch.update_totals(self.troves)
        
        # Add to new batch
        trove.batch_manager = batch_manager
        trove.interest_rate = self.batches[batch_manager].interest_rate
        self.batches[batch_manager].troves.append(trove_id)
        self.batches[batch_manager].update_totals(self.troves)
    
    def _apply_interest(self, trove_id: int) -> None:
        """
        Calculate and apply accrued interest to a trove.
        
        This internal function:
        1. Calculates interest based on time elapsed since last update
        2. Applies management fee if the trove is in a batch
        3. Updates the system's total debt
        
        Interest accrual is a key improvement over the original Liquity protocol,
        creating a sustainable economic model and incentivizing efficient capital use.
        
        Args:
            trove_id: ID of the trove to update
        """
        trove = self.troves[trove_id]
        elapsed_time = self.current_time - trove.last_update
        
        if elapsed_time == 0:
            return
        
        # Calculate interest based on time passed
        interest_factor = trove.interest_rate * elapsed_time / ONE_YEAR_IN_SECONDS
        interest = trove.debt * interest_factor
        
        # If in a batch, calculate management fee
        management_fee = 0
        if trove.batch_manager:
            batch = self.batches[trove.batch_manager]
            management_fee = interest * batch.management_fee
        
        # Apply interest to trove and update system
        trove.debt += interest
        self.total_system_debt += interest
        trove.last_update = self.current_time
    
    def update_time(self, seconds: int) -> None:
        """
        Advance the simulation by the specified number of seconds.
        
        This function moves the simulation's clock forward, allowing for:
        1. Interest accrual over time
        2. Time-based analysis of system behavior
        3. Simulating market conditions over extended periods
        
        Users call this to simulate the passage of time in the protocol.
        
        Args:
            seconds: Number of seconds to advance
        """
        self.current_time += seconds
    
    def update_eth_price(self, new_price: float) -> None:
        """
        Update ETH price and check for liquidations.
        
        This function is called when:
        1. External price oracles update the ETH/USD price
        2. Market conditions change
        3. Simulating price volatility scenarios
        
        Price changes may trigger liquidations of undercollateralized troves,
        which is a key stability mechanism of the protocol.
        
        Args:
            new_price: New ETH price in USD
        """
        self.eth_price = new_price
        liquidatable_troves = []
        
        # Find troves that can be liquidated
        for trove_id, trove in self.troves.items():
            # Apply accrued interest first
            self._apply_interest(trove_id)
            
            # Check if trove is below MCR
            if trove.icr(new_price) < MCR_WETH:
                liquidatable_troves.append(trove_id)
        
        # Process liquidations
        for trove_id in liquidatable_troves:
            self.liquidate_trove(trove_id)
    
    def liquidate_trove(self, trove_id: int) -> None:
        """
        Liquidate an undercollateralized trove.
        
        Liquidation is a key stability mechanism that:
        1. Removes risky troves from the system
        2. Maintains the overall collateralization of the protocol
        3. Utilizes the Stability Pool to efficiently absorb bad debt
        
        Liquidators call this function to remove troves that fall below MCR,
        and receive gas compensation for their service.
        
        Args:
            trove_id: ID of the trove to liquidate
            
        Raises:
            ValueError: If the trove doesn't exist or isn't eligible for liquidation
        """
        if trove_id not in self.troves:
            raise ValueError("Trove doesn't exist")
        
        trove = self.troves[trove_id]
        
        if trove.icr(self.eth_price) >= MCR_WETH:
            raise ValueError("Trove is not eligible for liquidation")
        
        # Calculate values for liquidation
        debt_to_offset = trove.debt
        collateral_value = trove.collateral * self.eth_price
        
        # Gas compensation (0.5% of collateral, capped at 2 ETH)
        gas_comp_eth = min(trove.collateral * 0.005, 2.0)
        
        # Try to offset with Stability Pool first
        offset_amount = self.stability_pool.offset_debt(
            debt_to_offset, 
            trove.collateral * (1 - LIQUIDATION_PENALTY_SP_WETH) - gas_comp_eth
        )
        
        # If not all debt was offset, handle redistribution
        if offset_amount < debt_to_offset:
            remaining_debt = debt_to_offset - offset_amount
            # In a full implementation, would redistribute to other troves
            
        # Update system state
        self.total_system_debt -= trove.debt
        self.total_collateral -= trove.collateral
        
        # Remove trove from its batch if applicable
        if trove.batch_manager:
            batch = self.batches[trove.batch_manager]
            batch.troves.remove(trove_id)
            batch.update_totals(self.troves)
        
        # Remove the trove
        del self.troves[trove_id]
    
    def simulate_market_scenario(self, days: int, price_volatility: float = 0.02, plot_results: bool = True):
        """
        Run a simulation with random price movements over the specified period.
        
        This function allows users to:
        1. Test the protocol's resilience to various market conditions
        2. Visualize system metrics over time
        3. Analyze the impact of price volatility on the protocol
        
        It's a powerful tool for understanding the dynamic behavior of the
        Bold protocol under different scenarios.
        
        Args:
            days: Number of days to simulate
            price_volatility: Standard deviation of daily log returns for price
            plot_results: Whether to generate plots of the results
            
        Returns:
            Dictionary with simulation results
        """
        days_in_seconds = days * 24 * 60 * 60
        steps = days * 24  # hourly steps
        step_size = days_in_seconds // steps
        
        # Arrays to store history
        time_points = np.zeros(steps)
        price_points = np.zeros(steps)
        total_debt_points = np.zeros(steps)
        total_coll_points = np.zeros(steps)
        active_troves_points = np.zeros(steps)
        
        # Generate random price movements (log-normal)
        price = self.eth_price
        log_returns = np.random.normal(0, price_volatility, steps)
        
        for i in range(steps):
            # Update price with random movement
            price *= np.exp(log_returns[i])
            self.update_eth_price(price)
            
            # Advance time by one step
            self.update_time(step_size)
            
            # Apply interest to all troves
            for trove_id in list(self.troves.keys()):
                self._apply_interest(trove_id)
            
            # Record historical data
            time_points[i] = self.current_time / (24 * 60 * 60)  # convert to days
            price_points[i] = self.eth_price
            total_debt_points[i] = self.total_system_debt
            total_coll_points[i] = self.total_collateral
            active_troves_points[i] = len(self.troves)
        
        if plot_results:
            # Create a figure with 4 subplots
            fig, axs = plt.subplots(4, 1, figsize=(12, 16), sharex=True)
            
            # Plot ETH price
            axs[0].plot(time_points, price_points)
            axs[0].set_title('ETH Price')
            axs[0].set_ylabel('USD')
            
            # Plot total system debt
            axs[1].plot(time_points, total_debt_points)
            axs[1].set_title('Total System Debt')
            axs[1].set_ylabel('BOLD')
            
            # Plot total collateral
            axs[2].plot(time_points, total_coll_points)
            axs[2].set_title('Total Collateral')
            axs[2].set_ylabel('ETH')
            
            # Plot active troves
            axs[3].plot(time_points, active_troves_points)
            axs[3].set_title('Active Troves')
            axs[3].set_ylabel('Count')
            axs[3].set_xlabel('Days')
            
            plt.tight_layout()
            plt.show()
        
        return {
            'final_eth_price': self.eth_price,
            'final_system_debt': self.total_system_debt,
            'final_collateral': self.total_collateral,
            'active_troves': len(self.troves),
            'liquidations': self.next_trove_id - len(self.troves) - 1  # rough estimate
        }


# Example usage
if __name__ == "__main__":
    # Initialize the protocol
    protocol = BoldProtocol(initial_eth_price=2000.0)
    
    # Create some initial troves
    for i in range(10):
        collateral = np.random.uniform(1.0, 10.0)
        debt = collateral * 2000 / 1.5  # targeting ~150% collateralization
        protocol.open_trove(f"user{i}", collateral, debt, 0.05)
    
    # Create a batch and add some troves to it
    protocol.create_batch("batch_manager_1", 0.07, 0.02)
    for i in range(1, 6):
        try:
            protocol.join_batch(i, "batch_manager_1")
        except ValueError:
            pass  # Some might not meet batch requirements
    
    # Add to stability pool
    protocol.stability_pool.deposit("sp_user_1", 5000)
    protocol.stability_pool.deposit("sp_user_2", 3000)
    
    # Run simulation
    results = protocol.simulate_market_scenario(30, price_volatility=0.03)
    
    print("Simulation Results:")
    for key, value in results.items():
        print(f"  {key}: {value}")