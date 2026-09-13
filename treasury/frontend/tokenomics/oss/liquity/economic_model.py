"""
Economic Model for Bold Protocol.

This main module combines all the individual components to create a complete
economic model of the Bold Protocol stablecoin system. It can be used
to simulate various scenarios and test the economic behavior of the protocol.
"""

import time
import numpy as np
try:
    import matplotlib.pyplot as plt
except ImportError:
    plt = None

from .active_pool import ActivePool
from .stability_pool import StabilityPool
from .coll_surplus_pool import CollSurplusPool
from .default_pool import DefaultPool
from .trove_manager import TroveManager
from .bold_token import BoldToken

class PriceFeed:
    """Simple price feed implementation for simulations."""
    
    def __init__(self, initial_price=2000.0):
        self.price = initial_price
    
    def fetch_price(self):
        """Returns the current price."""
        return self.price
    
    def set_price(self, new_price):
        """Sets a new price."""
        self.price = new_price

class BoldProtocolEconomicModel:
    """
    Complete economic model of the Bold Protocol.
    Combines all components and provides simulation capabilities.
    """
    
    def __init__(self, initial_price=2000.0):
        # Set up price feed
        self.price_feed = PriceFeed(initial_price)
        
        # Create token
        self.bold_token = BoldToken()
        
        # Create pools
        self.active_pool = ActivePool()
        self.stability_pool = StabilityPool(self.bold_token, None, self.active_pool)
        self.default_pool = DefaultPool(self.active_pool)
        self.coll_surplus_pool = CollSurplusPool()
        
        # Create trove manager
        self.trove_manager = TroveManager(
            self.active_pool,
            self.stability_pool,
            self.default_pool,
            self.coll_surplus_pool,
            self.bold_token,
            None,  # sorted_troves not implemented in this model
            self.price_feed,
            None   # collateral_registry not implemented in this model
        )
        
        # Link components
        self.active_pool.default_pool = self.default_pool
        self.active_pool.stability_pool = self.stability_pool
        self.active_pool.bold_token = self.bold_token
        self.stability_pool.trove_manager = self.trove_manager
        
        # Set owner and allowed minters
        self.bold_token.set_owner(self)
        self.bold_token.add_minter(self.active_pool)
        
        # System constants
        self.MIN_DEBT = 2000 * 1e18
        self.CCR = self.trove_manager.CCR  # Critical Collateral Ratio (150%)
        self.MCR = self.trove_manager.MCR  # Minimum Collateral Ratio (110%)
        
        # Next trove ID
        self.next_trove_id = 1
        
        # Map of trove IDs to owners
        self.trove_owners = {}
        
        # Current time for simulation
        self.current_time = int(time.time())
        
        # History tracking for simulations
        self.price_history = [initial_price]
        self.total_coll_history = [0]
        self.total_debt_history = [0]
        self.active_troves_history = [0]
        self.tcr_history = [0]  # Total Collateralization Ratio history
    
    def open_trove(self, owner, collateral, debt, interest_rate):
        """
        Opens a new trove.
        
        Args:
            owner: Address of the trove owner
            collateral: Amount of collateral to deposit
            debt: Amount of debt (BOLD) to generate
            interest_rate: Annual interest rate for the trove
            
        Returns:
            ID of the newly created trove
        """
        # Validate inputs
        if collateral <= 0:
            raise ValueError("Collateral must be greater than zero")
            
        if debt < self.MIN_DEBT / 1e18:
            raise ValueError(f"Debt must be at least {self.MIN_DEBT / 1e18} BOLD")
            
        # Check minimum collateral ratio
        price = self.price_feed.fetch_price()
        required_icr = self.MCR
        
        if (collateral * price) / debt < required_icr:
            raise ValueError(f"Insufficient collateral ratio, must be at least {required_icr*100}%")
            
        # Validate interest rate
        min_interest_rate = 0.005  # 0.5%
        max_interest_rate = 2.50   # 250%
        
        if interest_rate < min_interest_rate or interest_rate > max_interest_rate:
            raise ValueError(f"Interest rate must be between {min_interest_rate*100}% and {max_interest_rate*100}%")
            
        # Create trove in TroveManager
        trove_id = self.next_trove_id
        self.next_trove_id += 1
        
        # Store owner
        self.trove_owners[trove_id] = owner
        
        # Add trove to TroveManager
        from .trove_manager import Trove, Status
        self.trove_manager.troves[trove_id] = Trove(
            id=trove_id,
            debt=debt,
            coll=collateral,
            stake=collateral,  # Initially stake equals collateral
            status=Status.ACTIVE,
            array_index=len(self.trove_manager.trove_ids),
            last_debt_update_time=self.current_time,
            last_interest_rate_adj_time=self.current_time,
            annual_interest_rate=interest_rate,
            interest_batch_manager=None,
            batch_debt_shares=0
        )
        
        # Add trove ID to list
        self.trove_manager.trove_ids.append(trove_id)
        
        # Update total stakes
        self.trove_manager.total_stakes += collateral
        
        # Initialize reward snapshots
        from .trove_manager import RewardSnapshot
        self.trove_manager.reward_snapshots[trove_id] = RewardSnapshot(
            coll=self.trove_manager.L_coll,
            bold_debt=self.trove_manager.L_bold_debt
        )
        
        # Update Active Pool
        self.active_pool.receive_coll(collateral)
        self.active_pool.agg_recorded_debt += debt
        self.active_pool.agg_weighted_debt_sum += debt * interest_rate
        self.active_pool.last_agg_update_time = self.current_time
        
        # Mint BOLD to owner
        self.bold_token.mint(owner, debt)
        
        # Update history for simulation
        self._update_history()
        
        return trove_id
    
    def create_batch(self, manager, interest_rate, management_fee=0.025):
        """
        Creates a new batch manager.
        
        Args:
            manager: Address of the batch manager
            interest_rate: Annual interest rate for all troves in the batch
            management_fee: Annual management fee (portion of interest that goes to manager)
            
        Returns:
            None
        """
        # Validate inputs
        min_interest_rate = 0.005  # 0.5%
        max_interest_rate = 2.50   # 250%
        
        if interest_rate < min_interest_rate or interest_rate > max_interest_rate:
            raise ValueError(f"Interest rate must be between {min_interest_rate*100}% and {max_interest_rate*100}%")
            
        max_management_fee = 0.10  # 10%
        
        if management_fee > max_management_fee:
            raise ValueError(f"Management fee cannot exceed {max_management_fee*100}%")
            
        # Create batch in TroveManager
        from .trove_manager import Batch
        self.trove_manager.batches[manager] = Batch(
            manager=manager,
            debt=0,
            coll=0,
            array_index=len(self.trove_manager.batch_ids),
            last_debt_update_time=self.current_time,
            last_interest_rate_adj_time=self.current_time,
            annual_interest_rate=interest_rate,
            annual_management_fee=management_fee,
            total_debt_shares=0
        )
        
        # Add batch ID to list
        self.trove_manager.batch_ids.append(manager)
    
    def join_batch(self, trove_id, batch_manager):
        """
        Adds a trove to a batch.
        
        Args:
            trove_id: ID of the trove to add
            batch_manager: Address of the batch manager
            
        Returns:
            None
        """
        # Validate inputs
        if trove_id not in self.trove_manager.troves:
            raise ValueError("Trove doesn't exist")
            
        if batch_manager not in self.trove_manager.batches:
            raise ValueError("Batch manager doesn't exist")
            
        # Apply interest before joining batch
        from trove_manager import LatestTroveData
        trove = LatestTroveData()
        self.trove_manager._get_latest_trove_data(trove_id, trove)
        
        # Get the current price
        price = self.price_feed.fetch_price()
        
        # Check if trove meets batch collateral requirement (MCR + BCR)
        required_icr = self.MCR + 0.10  # MCR + 10% buffer
        
        if (trove.entire_coll * price) / trove.entire_debt < required_icr:
            raise ValueError(f"Insufficient collateral ratio for batch, must be at least {required_icr*100}%")
            
        # Remove from previous batch if applicable
        old_batch_manager = self.trove_manager._get_batch_manager(trove_id)
        
        if old_batch_manager:
            old_batch = self.trove_manager.batches[old_batch_manager]
            old_batch_shares = self.trove_manager.troves[trove_id].batch_debt_shares
            old_batch.total_debt_shares -= old_batch_shares
            
            # Update batch totals
            old_batch.debt -= trove.recorded_debt
            old_batch.coll -= self.trove_manager.troves[trove_id].coll
        
        # Add to new batch
        new_batch = self.trove_manager.batches[batch_manager]
        
        # Update trove
        self.trove_manager.troves[trove_id].interest_batch_manager = batch_manager
        self.trove_manager.troves[trove_id].annual_interest_rate = new_batch.annual_interest_rate
        
        # Calculate batch shares
        if new_batch.debt == 0:
            # First trove in batch
            self.trove_manager.troves[trove_id].batch_debt_shares = trove.entire_debt
        else:
            # Proportional to debt
            self.trove_manager.troves[trove_id].batch_debt_shares = (
                trove.entire_debt * new_batch.total_debt_shares / new_batch.debt
            )
        
        # Update batch totals
        new_batch.total_debt_shares += self.trove_manager.troves[trove_id].batch_debt_shares
        new_batch.debt += trove.recorded_debt
        new_batch.coll += self.trove_manager.troves[trove_id].coll
        
        # Update history for simulation
        self._update_history()
    
    def provide_to_stability_pool(self, depositor, amount, do_claim=True):
        """
        Provides BOLD to the Stability Pool.
        
        Args:
            depositor: Address of the depositor
            amount: Amount of BOLD to provide
            do_claim: Whether to claim collateral gains or keep them stashed
            
        Returns:
            None
        """
        # Check if depositor has enough BOLD
        if self.bold_token.balance_of(depositor) < amount:
            raise ValueError("Insufficient BOLD balance")
            
        # Provide to Stability Pool
        self.stability_pool.provide_to_sp(depositor, amount, do_claim)
        
        # Update history for simulation
        self._update_history()
    
    def withdraw_from_stability_pool(self, depositor, amount, do_claim=True):
        """
        Withdraws BOLD from the Stability Pool.
        
        Args:
            depositor: Address of the depositor
            amount: Amount of BOLD to withdraw
            do_claim: Whether to claim collateral gains or keep them stashed
            
        Returns:
            Amount of BOLD actually withdrawn
        """
        # Withdraw from Stability Pool
        bold_withdrawn = self.stability_pool.withdraw_from_sp(depositor, amount, do_claim)
        
        # Update history for simulation
        self._update_history()
        
        return bold_withdrawn
    
    def liquidate_trove(self, trove_id):
        """
        Liquidates a single trove.
        
        Args:
            trove_id: ID of the trove to liquidate
            
        Returns:
            LiquidationValues with the results
        """
        # Liquidate the trove
        results = self.trove_manager.liquidate(trove_id)
        
        # Update history for simulation
        self._update_history()
        
        return results
    
    def batch_liquidate_troves(self, trove_ids):
        """
        Liquidates multiple troves in a batch.
        
        Args:
            trove_ids: List of trove IDs to attempt to liquidate
            
        Returns:
            LiquidationValues with the combined results
        """
        # Batch liquidate troves
        results = self.trove_manager.batch_liquidate_troves(trove_ids)
        
        # Update history for simulation
        self._update_history()
        
        return results
    
    def redeem_collateral(self, redeemer, bold_amount, max_iterations=0):
        """
        Redeems collateral in exchange for BOLD.
        
        Args:
            redeemer: Address of the redeemer
            bold_amount: Amount of BOLD to redeem
            max_iterations: Maximum number of troves to process (0 for unlimited)
            
        Returns:
            Tuple of (redeemed_amount, total_coll_fee, total_coll_drawn)
        """
        # Redeem collateral
        results = self.trove_manager.redeem_collateral(redeemer, bold_amount, max_iterations)
        
        # Update history for simulation
        self._update_history()
        
        return results
    
    def update_price(self, new_price):
        """
        Updates the ETH price and checks for liquidations.
        
        Args:
            new_price: New ETH price in USD
            
        Returns:
            List of liquidated trove IDs
        """
        old_price = self.price_feed.fetch_price()
        self.price_feed.set_price(new_price)
        
        # Identify liquidatable troves
        liquidatable_troves = []
        
        for trove_id in list(self.trove_manager.troves):
            # Skip troves that are not active or zombie
            if not self.trove_manager._is_active_or_zombie(self.trove_manager.troves[trove_id].status):
                continue
                
            # Check if trove is below MCR
            icr = self.trove_manager.get_current_icr(trove_id, new_price)
            
            if icr < self.MCR:
                liquidatable_troves.append(trove_id)
        
        # Liquidate troves if needed
        if liquidatable_troves:
            self.batch_liquidate_troves(liquidatable_troves)
            
        # Update history
        self._update_history()
        
        return liquidatable_troves
    
    def update_time(self, seconds):
        """
        Advances the simulation by the specified number of seconds.
        
        Args:
            seconds: Number of seconds to advance
            
        Returns:
            None
        """
        self.current_time += seconds
        
        # Update history
        self._update_history()
    
    def get_system_state(self):
        """
        Returns the current state of the system.
        
        Returns:
            Dictionary with system state
        """
        price = self.price_feed.fetch_price()
        active_coll = self.active_pool.get_coll_balance()
        active_debt = self.active_pool.get_bold_debt(self.current_time)
        
        default_coll = self.default_pool.get_coll_balance()
        default_debt = self.default_pool.get_bold_debt()
        
        stability_coll = self.stability_pool.get_coll_balance()
        stability_bold = self.stability_pool.get_total_bold_deposits()
        
        surplus_coll = self.coll_surplus_pool.get_coll_balance()
        
        total_coll = active_coll + default_coll
        total_debt = active_debt
        
        # Calculate Total Collateralization Ratio (TCR)
        tcr = (total_coll * price) / total_debt if total_debt > 0 else float('inf')
        
        from .trove_manager import Status
        active_troves = 0
        for trove_id in self.trove_manager.troves:
            if self.trove_manager.troves[trove_id].status == Status.ACTIVE:
                active_troves += 1
        
        return {
            'price': price,
            'active_coll': active_coll,
            'active_debt': active_debt,
            'default_coll': default_coll,
            'default_debt': default_debt,
            'stability_coll': stability_coll,
            'stability_bold': stability_bold,
            'surplus_coll': surplus_coll,
            'total_coll': total_coll,
            'total_debt': total_debt,
            'tcr': tcr,
            'active_troves': active_troves
        }
    
    def _update_history(self):
        """Updates history tracking for simulations."""
        state = self.get_system_state()
        
        self.price_history.append(state['price'])
        self.total_coll_history.append(state['total_coll'])
        self.total_debt_history.append(state['total_debt'])
        self.active_troves_history.append(state['active_troves'])
        self.tcr_history.append(state['tcr'])
    
    def simulate_market_scenario(self, days, price_volatility=0.02, plot_results=True):
        """
        Runs a simulation with random price movements over the specified period.
        
        Args:
            days: Number of days to simulate
            price_volatility: Daily price volatility (standard deviation of log returns)
            plot_results: Whether to plot the results
            
        Returns:
            Dictionary with simulation results
        """
        days_in_seconds = days * 24 * 60 * 60
        steps = days * 24  # hourly steps
        step_size = days_in_seconds // steps
        
        # Reset history
        state = self.get_system_state()
        self.price_history = [state['price']]
        self.total_coll_history = [state['total_coll']]
        self.total_debt_history = [state['total_debt']]
        self.active_troves_history = [state['active_troves']]
        self.tcr_history = [state['tcr']]
        
        # Generate random price movements (log-normal)
        price = self.price_feed.fetch_price()
        daily_volatility = price_volatility
        hourly_volatility = daily_volatility / np.sqrt(24)  # Scale to hourly
        
        log_returns = np.random.normal(0, hourly_volatility, steps)
        time_points = np.zeros(steps)
        
        for i in range(steps):
            # Update price with random movement
            price *= np.exp(log_returns[i])
            self.update_price(price)
            
            # Advance time by one step
            self.update_time(step_size)
            
            # Record time in days
            time_points[i] = self.current_time / (24 * 60 * 60)
        
        # Plot results if requested
        if plot_results:
            fig, axs = plt.subplots(5, 1, figsize=(12, 20), sharex=True)
            
            # Plot ETH price
            axs[0].plot(time_points, self.price_history[1:])
            axs[0].set_title('ETH Price')
            axs[0].set_ylabel('USD')
            
            # Plot total system debt
            axs[1].plot(time_points, self.total_debt_history[1:])
            axs[1].set_title('Total System Debt')
            axs[1].set_ylabel('BOLD')
            
            # Plot total collateral
            axs[2].plot(time_points, self.total_coll_history[1:])
            axs[2].set_title('Total Collateral')
            axs[2].set_ylabel('ETH')
            
            # Plot active troves
            axs[3].plot(time_points, self.active_troves_history[1:])
            axs[3].set_title('Active Troves')
            axs[3].set_ylabel('Count')
            
            # Plot TCR
            axs[4].plot(time_points, self.tcr_history[1:])
            axs[4].set_title('Total Collateralization Ratio')
            axs[4].set_ylabel('Ratio')
            axs[4].set_xlabel('Days')
            
            plt.tight_layout()
            plt.show()
        
        # Get final state
        final_state = self.get_system_state()
        
        # Calculate liquidations
        initial_troves = self.active_troves_history[0]
        final_troves = final_state['active_troves']
        liquidations = initial_troves - final_troves
        
        return {
            'final_eth_price': final_state['price'],
            'final_system_debt': final_state['total_debt'],
            'final_collateral': final_state['total_coll'],
            'active_troves': final_state['active_troves'],
            'liquidations': liquidations if liquidations > 0 else 0,
            'final_tcr': final_state['tcr']
        }