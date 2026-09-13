"""
Trove Manager Model for Bold Protocol.

This module simulates the TroveManager contract which handles the core logic for
troves including liquidations, redemptions, and interest accrual.

The TroveManager is a central component of the Bold Protocol, responsible for:
1. Managing the lifecycle of troves (creation, modification, closure)
2. Enforcing collateralization requirements
3. Handling liquidations of undercollateralized troves
4. Processing redemptions of BOLD for collateral
5. Calculating and applying interest to troves
6. Managing batch operations for improved capital efficiency
7. Coordinating redistribution of collateral and debt during liquidations

These operations work together to maintain the stability of the Bold stablecoin
and ensure the protocol can withstand market volatility while providing
capital-efficient borrowing options to users.
"""

import math
import time
from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# Trove status enum
class Status(Enum):
    """
    Represents the possible states of a trove in the Bold Protocol.
    
    A trove's status determines what operations can be performed on it and how
    it's treated by the system. This is essential for tracking the lifecycle
    of borrower positions.
    """
    NON_EXISTENT = 0  # Trove has not been created or has been fully closed
    ACTIVE = 1        # Normal active trove with debt and collateral
    CLOSED_BY_OWNER = 2  # Trove was voluntarily closed by its owner
    CLOSED_BY_LIQUIDATION = 3  # Trove was liquidated due to insufficient collateral
    CLOSED_BY_REDEMPTION = 4  # Trove was closed through BOLD redemption
    ZOMBIE = 5  # Trove with debt below minimum after a partial redemption

# Operation enum for events and tracking
class Operation(Enum):
    """
    Represents user operations that can be performed on troves.
    
    These operations correspond to the main functions users can call to interact
    with their troves. The protocol emits events with these operation types
    to provide transparency and facilitate off-chain tracking.
    """
    OPEN_TROVE = 0         # Create a new trove with initial collateral and debt
    CLOSE_TROVE = 1        # Close a trove by repaying all debt
    ADJUST_TROVE = 2       # Modify a trove's collateral or debt
    LIQUIDATE = 3          # Liquidate an undercollateralized trove
    REDEEM_COLLATERAL = 4  # Redeem BOLD tokens for collateral
    JOIN_BATCH = 5         # Add a trove to a batch for interest management
    EXIT_BATCH = 6         # Remove a trove from a batch

# Batch operation enum for events
class BatchOperation(Enum):
    """
    Represents operations related to batches of troves.
    
    Batches allow multiple troves to be managed together under a common
    interest rate and management fee. These operations track how batches
    and their member troves change over time.
    """
    CREATE_BATCH = 0  # Create a new batch managed by a specific address
    ADJUST_BATCH = 1  # Change batch parameters like interest rate
    TROVE_CHANGE = 2  # Track changes to troves within a batch
    JOIN_BATCH = 3    # A trove joins an existing batch
    EXIT_BATCH = 4    # A trove exits from its current batch

@dataclass
class Trove:
    """
    Represents a single trove (borrower position) in the Bold Protocol.
    
    A trove is the fundamental unit of the system, where users deposit collateral
    and borrow BOLD. Each trove has its own debt, collateral, interest rate,
    and can optionally be part of a batch.
    
    Users interact with their troves to adjust their collateral and debt positions,
    while the system monitors troves to ensure they maintain minimum collateralization.
    """
    id: int                 # Unique identifier for the trove
    debt: float = 0         # Current BOLD debt owed by the trove
    coll: float = 0         # Current collateral amount in the trove
    stake: float = 0        # Stake for redistribution calculations
    status: Status = Status.NON_EXISTENT  # Current status of the trove
    array_index: int = 0    # Position in the sorted troves list
    last_debt_update_time: int = 0        # Timestamp of last debt update
    last_interest_rate_adj_time: int = 0  # Timestamp of last interest rate change
    annual_interest_rate: float = 0       # Current annual interest rate
    interest_batch_manager: Optional[str] = None  # Address of batch manager, if in batch
    batch_debt_shares: float = 0          # Share of the batch debt owned by this trove

@dataclass
class Batch:
    """
    Represents an interest batch that manages multiple troves together.
    
    Batches are a key innovation in the Bold Protocol that allow:
    1. Collective management of multiple troves under a unified interest rate
    2. More efficient interest calculation and accrual
    3. Management fees to be collected by batch managers
    4. Lower gas costs for interest calculations
    
    Troves can join and exit batches, with the batch manager earning a fee on
    the interest generated by troves in their batch.
    """
    manager: str            # Address of the batch manager
    debt: float = 0         # Total BOLD debt in the batch
    coll: float = 0         # Total collateral in the batch
    array_index: int = 0    # Position in sorted batches list
    last_debt_update_time: int = 0        # Timestamp of last debt update
    last_interest_rate_adj_time: int = 0  # Timestamp of last interest rate change
    annual_interest_rate: float = 0       # Current annual interest rate for all troves
    annual_management_fee: float = 0      # Fee percentage earned by batch manager
    total_debt_shares: float = 0          # Sum of debt shares for all troves in batch

@dataclass
class RewardSnapshot:
    """
    Snapshot of a trove's rewards at the time of the last update.
    
    These snapshots are critical for the redistribution mechanism, which spreads
    liquidated debt and collateral to all active troves in the system. Each snapshot
    records the global L_coll and L_boldDebt values at the time of the trove's
    last update, so future redistribution gains can be calculated correctly.
    """
    coll: float = 0      # Value of L_coll at the time of snapshot
    bold_debt: float = 0  # Value of L_boldDebt at the time of snapshot

@dataclass
class LatestTroveData:
    """
    Current state of a trove including pending redistributions and interest.
    
    This container holds the calculated current state of a trove after accounting
    for all accumulated changes since its last update, including:
    1. Redistribution gains from liquidations
    2. Accrued interest based on time elapsed
    3. Batch management fees if applicable
    
    This structure is used extensively during liquidations and redemptions to
    ensure all operations use the most up-to-date trove state.
    """
    redist_bold_debt_gain: float = 0  # Debt gain from redistribution mechanism
    redist_coll_gain: float = 0       # Collateral gain from redistribution
    recorded_debt: float = 0          # Debt as recorded in the trove's state
    annual_interest_rate: float = 0   # Current interest rate for the trove
    weighted_recorded_debt: float = 0 # Debt * interest rate for interest calculation
    accrued_interest: float = 0       # Interest accumulated since last update
    accrued_batch_management_fee: float = 0  # Management fee if in a batch
    entire_debt: float = 0            # Total debt including all components
    entire_coll: float = 0            # Total collateral including redistribution
    last_interest_rate_adj_time: int = 0  # When interest rate was last modified

@dataclass
class LatestBatchData:
    """
    Current state of a batch including interest and management fees.
    
    Similar to LatestTroveData, this structure holds the calculated current
    state of a batch after accounting for accrued interest and management fees.
    It's used when processing operations on troves that belong to batches
    to ensure correct accounting and fair distribution of interest.
    """
    recorded_debt: float = 0          # Debt as recorded in the batch's state
    annual_interest_rate: float = 0   # Current interest rate for all troves in batch
    annual_management_fee: float = 0  # Fee percentage for the batch manager
    weighted_recorded_debt: float = 0 # Debt * interest rate for interest calculation
    weighted_recorded_batch_management_fee: float = 0 # For management fee calculation
    accured_interest: float = 0       # Interest accumulated since last batch update
    accured_management_fee: float = 0 # Management fee accumulated since last update
    entire_debt_without_redistribution: float = 0  # Total batch debt + interest
    entire_coll_without_redistribution: float = 0  # Total batch collateral
    last_interest_rate_adj_time: int = 0  # When batch interest rate was last modified

@dataclass
class TroveChange:
    """
    Represents changes to a trove for accounting purposes.
    
    This structure tracks all changes to a trove's state during an operation,
    making it easier to update all connected components (like pools) correctly.
    It's a comprehensive record of how a trove's debt and collateral have
    changed, which is critical for maintaining the system's overall accounting.
    """
    coll_increase: float = 0          # Amount of collateral added
    coll_decrease: float = 0          # Amount of collateral removed
    debt_increase: float = 0          # Amount of debt added
    debt_decrease: float = 0          # Amount of debt paid back
    upfront_fee: float = 0            # Fee charged during trove operations
    applied_redist_coll_gain: float = 0  # Redistribution collateral being claimed
    applied_redist_bold_debt_gain: float = 0 # Redistribution debt being applied
    batch_accrued_management_fee: float = 0  # Management fee if in batch
    old_weighted_recorded_debt: float = 0    # Previous value for interest calculation
    new_weighted_recorded_debt: float = 0    # New value for interest calculation
    old_weighted_recorded_batch_management_fee: float = 0  # For management fee accounting
    new_weighted_recorded_batch_management_fee: float = 0  # Updated management fee value

@dataclass
class LiquidationValues:
    """
    Values calculated during the liquidation of a trove.
    
    When a trove is liquidated for being undercollateralized, its debt and
    collateral are processed in a specific way. This class tracks all the
    components of that process, including:
    1. Gas compensation for the liquidator
    2. Portions of debt offset using Stability Pool
    3. Portions of debt and collateral redistributed to other troves
    4. Any collateral surplus returned to the trove owner
    
    These detailed calculations ensure proper accounting and fair treatment
    of all parties involved in a liquidation.
    """
    coll_gas_compensation: float = 0   # Collateral reserved for liquidation gas costs
    debt_to_offset: float = 0          # Debt to be offset using Stability Pool
    coll_to_send_to_sp: float = 0      # Collateral sent to SP depositors as reward
    debt_to_redistribute: float = 0    # Debt to be spread among other troves
    coll_to_redistribute: float = 0    # Collateral to be spread among other troves
    coll_surplus: float = 0            # Excess collateral returned to trove owner
    eth_gas_compensation: float = 0    # Fixed ETH compensation for liquidator
    old_weighted_recorded_debt: float = 0  # For interest calculation
    new_weighted_recorded_debt: float = 0  # Updated interest calculation value

@dataclass
class SingleRedemptionValues:
    """
    Values calculated during a single BOLD redemption for collateral.
    
    Redemption is a key mechanism allowing BOLD holders to exchange their tokens
    for collateral at face value (minus fees). This structure tracks all the
    details of a redemption from a single trove, including:
    1. The amount of BOLD being redeemed (bold_lot)
    2. The amount of collateral being drawn (coll_lot)
    3. The redemption fee being charged
    4. How the trove's state changes after redemption
    
    Redemptions process troves in order of interest rate (lowest first) to ensure
    fairness and predictability for borrowers.
    """
    trove_id: int = 0                  # ID of the trove being redeemed from
    batch_address: Optional[str] = None  # Batch address if trove is in a batch
    bold_lot: float = 0                # Amount of BOLD being redeemed
    coll_lot: float = 0                # Amount of collateral being retrieved
    coll_fee: float = 0                # Redemption fee in collateral
    applied_redist_bold_debt_gain: float = 0  # Redistribution being applied
    old_weighted_recorded_debt: float = 0     # For interest calculation
    new_weighted_recorded_debt: float = 0     # Updated interest calculation value
    new_stake: float = 0               # Updated stake after redemption
    is_zombie_trove: bool = False      # Whether trove is in zombie state
    trove: LatestTroveData = field(default_factory=LatestTroveData)  # Current trove state
    batch: LatestBatchData = field(default_factory=LatestBatchData)  # Batch state if applicable

class TroveManager:
    """
    Simulates the TroveManager contract which handles trove operations.
    
    The TroveManager is the core operational component of the Bold Protocol, responsible for:
    
    1. Collateral Management:
       - Tracking all deposited collateral
       - Managing collateralization ratios and requirements
       - Enforcing minimum collateral requirements
    
    2. Debt Management:
       - Tracking all outstanding BOLD debt
       - Applying interest based on time and rates
       - Managing minimum debt requirements
    
    3. Liquidation Mechanism:
       - Identifying undercollateralized troves
       - Processing liquidations through the Stability Pool
       - Redistributing debt and collateral when needed
    
    4. Redemption Mechanism:
       - Allowing BOLD holders to exchange tokens for collateral
       - Calculating and applying redemption fees
       - Ensuring fair processing order based on interest rates
    
    5. Batch Management:
       - Tracking batches of troves with shared parameters
       - Applying interest and management fees to batches
       - Managing trove membership in batches
    
    The TroveManager interacts with several other components including:
    - ActivePool: Holds active collateral and debt
    - StabilityPool: Holds BOLD deposits for liquidations
    - DefaultPool: Holds redistributed collateral and debt
    - CollSurplusPool: Holds excess collateral from liquidations
    """
    
    def __init__(self, active_pool=None, stability_pool=None, default_pool=None, 
                 coll_surplus_pool=None, bold_token=None, sorted_troves=None,
                 price_feed=None, collateral_registry=None):
        # Connected contracts
        self.active_pool = active_pool
        self.stability_pool = stability_pool
        self.default_pool = default_pool
        self.coll_surplus_pool = coll_surplus_pool
        self.bold_token = bold_token
        self.sorted_troves = sorted_troves
        self.price_feed = price_feed
        self.collateral_registry = collateral_registry
        
        # Critical system parameters
        self.CCR = 1.5  # Critical Collateral Ratio (150%)
        self.MCR = 1.1  # Minimum Collateral Ratio (110%)
        self.SCR = 1.05  # Shutdown Collateral Ratio (105%)
        
        # Liquidation penalties
        self.LIQUIDATION_PENALTY_SP = 0.05  # 5% liquidation penalty for SP offset
        self.LIQUIDATION_PENALTY_REDISTRIBUTION = 0.10  # 10% liquidation penalty for redistribution
        
        # State variables
        self.troves = {}  # id -> Trove
        self.batches = {}  # manager -> Batch
        
        self.total_stakes = 0
        self.total_stakes_snapshot = 0
        self.total_collateral_snapshot = 0
        
        # L_coll and L_boldDebt track accumulated liquidation rewards per unit staked
        self.L_coll = 0
        self.L_bold_debt = 0
        
        # Map trove id to reward snapshots
        self.reward_snapshots = {}  # trove_id -> RewardSnapshot
        
        # Arrays of trove IDs and batch managers
        self.trove_ids = []
        self.batch_ids = []
        
        self.last_zombie_trove_id = 0
        
        # Error trackers for redistribution calculation
        self.last_coll_error_redistribution = 0
        self.last_bold_debt_error_redistribution = 0
        
        # Timestamp when system was shut down (0 if not shut down)
        self.shutdown_time = 0
        
        # Constants
        self.DECIMAL_PRECISION = 1e18
        self.MIN_DEBT = 2000 * self.DECIMAL_PRECISION  # Minimum debt for a trove
        self.ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60
        self.COLL_GAS_COMPENSATION_DIVISOR = 200  # 0.5% of collateral as gas comp
        self.COLL_GAS_COMPENSATION_CAP = 2 * 1e18  # Max 2 tokens as gas comp
        self.ETH_GAS_COMPENSATION = 0.0375 * 1e18  # Fixed ETH gas compensation
        self._100pct = 1e18  # 100% in decimal precision
        
        # Extra constants for redemptions
        self.URGENT_REDEMPTION_BONUS = 0.01 * self.DECIMAL_PRECISION  # 1% bonus for urgent redemptions
        
        # Next trove ID to use
        self.next_trove_id = 1
    
    # --- Getter functions ---
    
    def get_trove_ids_count(self):
        """Returns the number of troves in the system."""
        return len(self.trove_ids)
    
    def get_trove_from_trove_ids_array(self, index):
        """Returns the trove ID at the given index in the array."""
        if index < 0 or index >= len(self.trove_ids):
            raise IndexError("Index out of range")
        return self.trove_ids[index]
    
    # --- Liquidation functions ---
    
    def liquidate(self, trove_id):
        """
        Liquidates a single undercollateralized trove.
        
        Liquidation is a critical stability mechanism in the Bold Protocol that
        removes risky positions before they can become undercollateralized. When
        a trove's collateralization ratio falls below the MCR (110%), anyone can
        call this function to liquidate it.
        
        The liquidation process follows these steps:
        1. Check if the trove is eligible for liquidation (ICR < MCR)
        2. Calculate gas compensation for the liquidator
        3. Attempt to offset the trove's debt using the Stability Pool
        4. Redistribute any remaining debt and collateral to other troves
        5. Send any collateral surplus to the CollSurplusPool for the owner to claim
        6. Close the trove and update system accounting
        
        Liquidators are incentivized with gas compensation and potentially favorable
        collateral acquisition through the Stability Pool mechanism.
        
        Args:
            trove_id: ID of the trove to liquidate
        
        Returns:
            LiquidationValues with the detailed results of the liquidation
            
        Raises:
            ValueError: If the system is shut down or the trove isn't eligible for liquidation
        """
        # Check if the system is shut down
        if self.shutdown_time != 0:
            raise ValueError("System is shut down")
        
        # Get the current price
        price = self.price_feed.fetch_price() if self.price_feed else 0
        if price <= 0:
            raise ValueError("Invalid price")
        
        # Check if the trove is below MCR
        icr = self.get_current_icr(trove_id, price)
        if icr >= self.MCR:
            raise ValueError(f"Cannot liquidate trove with ICR >= MCR. Current ICR: {icr}")
        
        # Get the total BOLD in the stability pool
        bold_in_stability_pool = self.stability_pool.get_total_bold_deposits() if self.stability_pool else 0
        
        # Create containers for liquidation data
        trove = LatestTroveData()
        single_liquidation = LiquidationValues()
        
        # Perform the liquidation
        self._liquidate(trove_id, bold_in_stability_pool, price, trove, single_liquidation)
        
        # Apply the liquidation to the pools
        trove_change = TroveChange(
            coll_decrease=trove.entire_coll,
            debt_decrease=trove.entire_debt,
            applied_redist_coll_gain=trove.redist_coll_gain,
            applied_redist_bold_debt_gain=trove.redist_bold_debt_gain,
            old_weighted_recorded_debt=single_liquidation.old_weighted_recorded_debt,
            new_weighted_recorded_debt=single_liquidation.new_weighted_recorded_debt
        )
        
        # Update Active Pool
        if self.active_pool:
            self.active_pool.mint_agg_interest_and_account_for_trove_change(trove_change, None)
        
        # Process SP offset
        if single_liquidation.debt_to_offset > 0 and self.stability_pool:
            self.stability_pool.offset(single_liquidation.debt_to_offset, single_liquidation.coll_to_send_to_sp)
        
        # Process redistribution
        if single_liquidation.debt_to_redistribute > 0:
            self._redistribute_debt_and_coll(
                single_liquidation.debt_to_redistribute, single_liquidation.coll_to_redistribute
            )
        
        # Process collateral surplus
        if single_liquidation.coll_surplus > 0 and self.coll_surplus_pool:
            self.active_pool.send_coll(self.coll_surplus_pool, single_liquidation.coll_surplus)
        
        # Update system snapshots
        self._update_system_snapshots_exclude_coll_remainder(single_liquidation.coll_gas_compensation)
        
        return single_liquidation
    
    def batch_liquidate_troves(self, trove_array):
        """
        Liquidates multiple troves in a batch for gas efficiency.
        
        This function allows liquidators to process multiple troves in a single
        transaction, which is both gas-efficient and helps maintain system health
        during market downturns when many troves might become undercollateralized
        simultaneously.
        
        The batch liquidation process:
        1. Checks each trove in the array for eligibility (ICR < MCR)
        2. Liquidates eligible troves following the same process as individual liquidation
        3. Tracks and accumulates results across all liquidations
        4. Applies the combined effects to all system pools at once
        
        This is particularly useful during market volatility when rapid price
        changes might affect many troves. It allows the system to maintain
        its health by efficiently removing risky positions.
        
        Args:
            trove_array: Array of trove IDs to attempt to liquidate
        
        Returns:
            LiquidationValues with the combined results of all liquidations
            
        Raises:
            ValueError: If no troves were eligible for liquidation
        """
        if not trove_array:
            raise ValueError("Empty trove array")
        
        # Get the current price
        price = self.price_feed.fetch_price() if self.price_feed else 0
        if price <= 0:
            raise ValueError("Invalid price")
        
        # Calculate how much BOLD is available in the Stability Pool for offsets
        # Leave at least 1 BOLD in the SP (MIN_BOLD_IN_SP)
        total_bold_deposits = self.stability_pool.get_total_bold_deposits() if self.stability_pool else 0
        min_bold_in_sp = 1e18  # Minimum 1 BOLD must remain in SP
        bold_in_sp_for_offsets = max(0, total_bold_deposits - min_bold_in_sp)
        
        # Create containers for batch liquidation data
        trove_change = TroveChange()
        totals = LiquidationValues()
        
        # Process each trove in the array
        for trove_id in trove_array:
            # Skip non-liquidatable troves
            if trove_id not in self.troves or not self._is_active_or_zombie(self.troves[trove_id].status):
                continue
            
            # Check if the trove is below MCR
            icr = self.get_current_icr(trove_id, price)
            if icr < self.MCR:
                # Create containers for single liquidation
                single_liquidation = LiquidationValues()
                trove = LatestTroveData()
                
                # Liquidate the trove
                self._liquidate(trove_id, bold_in_sp_for_offsets, price, trove, single_liquidation)
                
                # Update remaining BOLD in SP for offsets
                bold_in_sp_for_offsets -= single_liquidation.debt_to_offset
                
                # Add liquidation values to totals
                self._add_liquidation_values_to_totals(trove, single_liquidation, totals, trove_change)
        
        # Verify that at least one trove was liquidated
        if trove_change.debt_decrease == 0:
            raise ValueError("Nothing to liquidate")
        
        # Apply the batch liquidation to the pools
        if self.active_pool:
            self.active_pool.mint_agg_interest_and_account_for_trove_change(trove_change, None)
        
        # Process SP offset
        if totals.debt_to_offset > 0 and self.stability_pool:
            self.stability_pool.offset(totals.debt_to_offset, totals.coll_to_send_to_sp)
        
        # Process redistribution
        if totals.debt_to_redistribute > 0:
            self._redistribute_debt_and_coll(
                totals.debt_to_redistribute, totals.coll_to_redistribute
            )
        
        # Process collateral surplus
        if totals.coll_surplus > 0 and self.coll_surplus_pool and self.active_pool:
            self.active_pool.send_coll(self.coll_surplus_pool, totals.coll_surplus)
        
        # Update system snapshots
        self._update_system_snapshots_exclude_coll_remainder(totals.coll_gas_compensation)
        
        return totals
    
    def _liquidate(self, trove_id, bold_in_sp_for_offsets, price, trove, single_liquidation):
        """
        Internal function to liquidate a single trove.
        
        Args:
            trove_id: ID of the trove to liquidate
            bold_in_sp_for_offsets: Amount of BOLD available in SP for offsets
            price: Current price of collateral
            trove: LatestTroveData object to store trove data
            single_liquidation: LiquidationValues object to store results
            
        Returns:
            None (updates the provided objects)
        """
        # Get latest trove data including redistribution gains
        self._get_latest_trove_data(trove_id, trove)
        
        # Get batch manager if trove is in a batch
        batch_address = self._get_batch_manager(trove_id)
        is_trove_in_batch = batch_address is not None
        
        batch = LatestBatchData()
        if is_trove_in_batch:
            self._get_latest_batch_data(batch_address, batch)
        
        # Move pending trove rewards to Active Pool
        if self.default_pool:
            self._move_pending_trove_rewards_to_active_pool(
                trove.redist_bold_debt_gain, trove.redist_coll_gain
            )
        
        # Calculate gas compensation
        single_liquidation.coll_gas_compensation = self._get_coll_gas_compensation(trove.entire_coll)
        coll_to_liquidate = trove.entire_coll - single_liquidation.coll_gas_compensation
        
        # Calculate how much debt to offset with SP and how much to redistribute
        (
            single_liquidation.debt_to_offset,
            single_liquidation.coll_to_send_to_sp,
            single_liquidation.debt_to_redistribute,
            single_liquidation.coll_to_redistribute,
            single_liquidation.coll_surplus
        ) = self._get_offset_and_redistribution_vals(
            trove.entire_debt, coll_to_liquidate, bold_in_sp_for_offsets, price
        )
        
        # Close the trove
        trove_change = TroveChange(
            coll_decrease=trove.entire_coll,
            debt_decrease=trove.entire_debt,
            applied_redist_coll_gain=trove.redist_coll_gain,
            applied_redist_bold_debt_gain=trove.redist_bold_debt_gain
        )
        
        self._close_trove(
            trove_id,
            trove_change,
            batch_address,
            batch.entire_coll_without_redistribution if is_trove_in_batch else 0,
            batch.entire_debt_without_redistribution if is_trove_in_batch else 0,
            Status.CLOSED_BY_LIQUIDATION
        )
        
        # Handle batch management fee if trove is in a batch
        if is_trove_in_batch:
            single_liquidation.old_weighted_recorded_debt = (
                batch.weighted_recorded_debt + 
                (trove.entire_debt - trove.redist_bold_debt_gain) * batch.annual_interest_rate
            )
            single_liquidation.new_weighted_recorded_debt = batch.entire_debt_without_redistribution * batch.annual_interest_rate
            
            # Handle batch management fee
            trove_change.batch_accrued_management_fee = batch.accured_management_fee
            trove_change.old_weighted_recorded_batch_management_fee = (
                batch.weighted_recorded_batch_management_fee +
                (trove.entire_debt - trove.redist_bold_debt_gain) * batch.annual_management_fee
            )
            trove_change.new_weighted_recorded_batch_management_fee = (
                batch.entire_debt_without_redistribution * batch.annual_management_fee
            )
            
            if self.active_pool:
                self.active_pool.mint_batch_management_fee(
                    time.time(),
                    trove_change.batch_accrued_management_fee,
                    trove_change.old_weighted_recorded_batch_management_fee,
                    trove_change.new_weighted_recorded_batch_management_fee,
                    batch_address
                )
        else:
            single_liquidation.old_weighted_recorded_debt = trove.weighted_recorded_debt
        
        # Handle collateral surplus
        if single_liquidation.coll_surplus > 0 and self.coll_surplus_pool:
            owner = self._get_trove_owner(trove_id)
            self.coll_surplus_pool.account_surplus(owner, single_liquidation.coll_surplus)
    
    def _get_coll_gas_compensation(self, entire_coll):
        """
        Returns the amount of collateral to be drawn as gas compensation.
        
        Args:
            entire_coll: Total collateral in the trove
            
        Returns:
            Amount of collateral for gas compensation
        """
        return min(entire_coll / self.COLL_GAS_COMPENSATION_DIVISOR, self.COLL_GAS_COMPENSATION_CAP)
    
    def _get_offset_and_redistribution_vals(self, entire_trove_debt, coll_to_liquidate, bold_in_sp_for_offsets, price):
        """
        Calculates the values for a trove's collateral and debt to be offset and redistributed.
        
        Args:
            entire_trove_debt: Total debt in the trove
            coll_to_liquidate: Amount of collateral to liquidate (after gas compensation)
            bold_in_sp_for_offsets: Amount of BOLD available in SP for offsets
            price: Current price of collateral
            
        Returns:
            Tuple of (debt_to_offset, coll_to_send_to_sp, debt_to_redistribute, coll_to_redistribute, coll_surplus)
        """
        debt_to_offset = 0
        coll_to_send_to_sp = 0
        coll_surplus_sp = 0
        
        # Calculate SP portion first
        if bold_in_sp_for_offsets > 0:
            debt_to_offset = min(entire_trove_debt, bold_in_sp_for_offsets)
            coll_sp_portion = coll_to_liquidate * debt_to_offset / entire_trove_debt
            
            # Calculate coll penalty and surplus for SP portion
            coll_to_send_to_sp, coll_surplus_sp = self._get_coll_penalty_and_surplus(
                coll_sp_portion, debt_to_offset, self.LIQUIDATION_PENALTY_SP, price
            )
        
        # Calculate redistribution portion
        debt_to_redistribute = entire_trove_debt - debt_to_offset
        coll_to_redistribute = 0
        coll_surplus_redist = 0
        
        if debt_to_redistribute > 0:
            coll_redistribution_portion = coll_to_liquidate - coll_sp_portion
            if coll_redistribution_portion > 0:
                # Calculate coll penalty and surplus for redistribution portion
                # Include any surplus from SP portion to potentially be eaten by redistribution penalty
                coll_to_redistribute, coll_surplus_redist = self._get_coll_penalty_and_surplus(
                    coll_redistribution_portion + coll_surplus_sp,
                    debt_to_redistribute,
                    self.LIQUIDATION_PENALTY_REDISTRIBUTION,
                    price
                )
        
        # Total collateral surplus is the sum of both surpluses
        coll_surplus = coll_surplus_sp + coll_surplus_redist
        
        return (debt_to_offset, coll_to_send_to_sp, debt_to_redistribute, coll_to_redistribute, coll_surplus)
    
    def _get_coll_penalty_and_surplus(self, coll_to_liquidate, debt_to_liquidate, penalty_ratio, price):
        """
        Calculates the collateral penalty and surplus for a liquidation portion.
        
        Args:
            coll_to_liquidate: Amount of collateral being liquidated
            debt_to_liquidate: Amount of debt being liquidated
            penalty_ratio: Liquidation penalty ratio (decimal precision)
            price: Current price of collateral
            
        Returns:
            Tuple of (seized_coll, coll_surplus)
        """
        # Calculate the maximum amount of collateral that can be seized based on debt and penalty
        max_seized_coll = debt_to_liquidate * (self.DECIMAL_PRECISION + penalty_ratio) / price
        
        # If available collateral exceeds the maximum seizable amount, return surplus
        if coll_to_liquidate > max_seized_coll:
            seized_coll = max_seized_coll
            coll_surplus = coll_to_liquidate - max_seized_coll
        else:
            seized_coll = coll_to_liquidate
            coll_surplus = 0
            
        return (seized_coll, coll_surplus)
    
    def _add_liquidation_values_to_totals(self, trove, single_liquidation, totals, trove_change):
        """
        Adds the values from a single liquidation to running totals.
        
        Args:
            trove: LatestTroveData for the liquidated trove
            single_liquidation: LiquidationValues from the single liquidation
            totals: LiquidationValues for running totals to update
            trove_change: TroveChange for running changes to update
            
        Returns:
            None (updates the provided objects)
        """
        # Update liquidation totals
        totals.coll_gas_compensation += single_liquidation.coll_gas_compensation
        totals.eth_gas_compensation += self.ETH_GAS_COMPENSATION
        totals.debt_to_offset += single_liquidation.debt_to_offset
        totals.coll_to_send_to_sp += single_liquidation.coll_to_send_to_sp
        totals.debt_to_redistribute += single_liquidation.debt_to_redistribute
        totals.coll_to_redistribute += single_liquidation.coll_to_redistribute
        totals.coll_surplus += single_liquidation.coll_surplus
        
        # Update trove change totals
        trove_change.debt_decrease += trove.entire_debt
        trove_change.coll_decrease += trove.entire_coll
        trove_change.applied_redist_bold_debt_gain += trove.redist_bold_debt_gain
        trove_change.old_weighted_recorded_debt += single_liquidation.old_weighted_recorded_debt
        trove_change.new_weighted_recorded_debt += single_liquidation.new_weighted_recorded_debt
    
    # --- Redistribution functions ---
    
    def _redistribute_debt_and_coll(self, debt, coll):
        """
        Redistributes debt and collateral to all active troves.
        
        Args:
            debt: Amount of debt to redistribute
            coll: Amount of collateral to redistribute
            
        Returns:
            None
        """
        if debt == 0:
            return
            
        # Get active pool and default pool
        active_pool = self.active_pool
        default_pool = self.default_pool
        
        if active_pool is None or default_pool is None:
            raise ValueError("Active Pool and Default Pool must be initialized")
        
        active_coll = active_pool.get_coll_balance()
        active_debt = active_pool.get_bold_debt(time.time())
        
        default_coll = default_pool.get_coll_balance()
        default_debt = default_pool.get_bold_debt()
        
        total_active_coll = active_coll - self.total_collateral_snapshot
        total_active_debt = active_debt - default_debt
        
        if total_active_debt == 0:
            return
            
        # Add redistributed debt and coll to DefaultPool
        default_pool.increase_bold_debt(debt)
        active_pool.send_coll_to_default_pool(coll)
        
        # Update L_coll and L_boldDebt factors for redistributing rewards
        coll_numerator = coll * self.DECIMAL_PRECISION + self.last_coll_error_redistribution
        coll_increase_per_unit_staked = coll_numerator / self.total_stakes
        self.last_coll_error_redistribution = coll_numerator % self.total_stakes
        self.L_coll += coll_increase_per_unit_staked
        
        debt_numerator = debt * self.DECIMAL_PRECISION + self.last_bold_debt_error_redistribution
        debt_increase_per_unit_staked = debt_numerator / self.total_stakes
        self.last_bold_debt_error_redistribution = debt_numerator % self.total_stakes
        self.L_bold_debt += debt_increase_per_unit_staked
    
    def _update_trove_reward_snapshots(self, trove_id):
        """
        Updates a trove's reward snapshots to current values.
        
        Args:
            trove_id: ID of the trove to update
            
        Returns:
            None
        """
        if trove_id not in self.reward_snapshots:
            self.reward_snapshots[trove_id] = RewardSnapshot()
            
        self.reward_snapshots[trove_id].coll = self.L_coll
        self.reward_snapshots[trove_id].bold_debt = self.L_bold_debt
    
    def _update_system_snapshots_exclude_coll_remainder(self, coll_remainder):
        """
        Updates system snapshots after liquidations, excluding collateral remainder.
        
        Args:
            coll_remainder: Amount of collateral to exclude from snapshot
            
        Returns:
            None
        """
        self.total_stakes_snapshot = self.total_stakes
        
        active_coll = self.active_pool.get_coll_balance() if self.active_pool else 0
        default_coll = self.default_pool.get_coll_balance() if self.default_pool else 0
        
        # Exclude the gas compensation from the snapshot
        self.total_collateral_snapshot = active_coll - coll_remainder + default_coll
    
    # --- Redemption functions ---
    
    def redeem_collateral(self, redeemer, bold_amount, max_iterations=0):
        """
        Redeems BOLD tokens for underlying collateral from troves.
        
        Redemption is a fundamental mechanism that allows BOLD holders to exchange
        their tokens for collateral at face value (minus a fee). This helps maintain
        the value of BOLD by providing a price floor and a way to exit the system.
        
        The redemption process works as follows:
        1. BOLD holder specifies how much BOLD they want to redeem
        2. System processes troves in order of interest rate (lowest first)
        3. BOLD is exchanged for collateral at current price
        4. A variable redemption fee is charged on the collateral
        5. The redeemed BOLD is burned, reducing supply
        
        Troves with ICR < 100% are skipped during redemption to avoid reducing
        their collateralization ratio further. This protects the system's stability.
        
        Redemptions are particularly attractive during market downturns when
        BOLD might trade below its target value, as they provide arbitrage opportunities.
        
        Args:
            redeemer: Address of the BOLD holder redeeming tokens
            bold_amount: Amount of BOLD tokens to redeem
            max_iterations: Maximum number of troves to process (0 for unlimited)
            
        Returns:
            Tuple of (redeemed_amount, total_coll_fee, total_coll_drawn)
            
        Raises:
            ValueError: If system is shut down or redemption conditions aren't met
        """
        if self.shutdown_time != 0:
            raise ValueError("System is shut down")
            
        if bold_amount <= 0:
            raise ValueError("BOLD amount must be greater than zero")
            
        # Check if redeemer has enough BOLD
        if self.bold_token and self.bold_token.balance_of(redeemer) < bold_amount:
            raise ValueError("Insufficient BOLD balance")
            
        # Get the current price
        price = self.price_feed.fetch_price() if self.price_feed else 0
        if price <= 0:
            raise ValueError("Invalid price")
            
        # Redemption fee calculation
        redemption_rate = self._get_redemption_rate(price)
        
        # Track total changes
        total_trove_change = TroveChange()
        total_coll_fee = 0
        
        # Amount of BOLD still to redeem
        remaining_bold = bold_amount
        
        # Keep track of troves processed for redemption
        single_redemption = SingleRedemptionValues()
        
        # Check if there's a pending zombie trove from previous redemption
        if self.last_zombie_trove_id != 0:
            single_redemption.trove_id = self.last_zombie_trove_id
            single_redemption.is_zombie_trove = True
        else:
            # Get the trove with lowest interest rate (last in sorted list)
            single_redemption.trove_id = self._get_last_trove_id()
            
        # Track batches that have already had interest updated
        last_batch_updated_interest = None
        
        # Iterate through troves from lowest to highest interest rate
        if max_iterations <= 0:
            max_iterations = float('inf')
            
        iterations = 0
        while (single_redemption.trove_id != 0 and 
               remaining_bold > 0 and 
               iterations < max_iterations):
            iterations += 1
            
            # Save next trove to check
            if single_redemption.is_zombie_trove:
                next_trove_to_check = self._get_last_trove_id()
            else:
                next_trove_to_check = self._get_prev_trove_id(single_redemption.trove_id)
                
            # Skip if ICR < 100% to ensure redemptions don't decrease CR of hit troves
            if self.get_current_icr(single_redemption.trove_id, price) < self._100pct:
                single_redemption.trove_id = next_trove_to_check
                single_redemption.is_zombie_trove = False
                continue
                
            # If trove is in a batch, update batch interest first
            single_redemption.batch_address = self._get_batch_manager(single_redemption.trove_id)
            if (single_redemption.batch_address is not None and 
                single_redemption.batch_address != last_batch_updated_interest):
                self._update_batch_interest_prior_to_redemption(single_redemption.batch_address)
                last_batch_updated_interest = single_redemption.batch_address
                
            # Redeem collateral from the trove
            self._redeem_collateral_from_trove(
                single_redemption, remaining_bold, price, redemption_rate
            )
            
            # Update running totals
            total_trove_change.coll_decrease += single_redemption.coll_lot
            total_trove_change.debt_decrease += single_redemption.bold_lot
            total_trove_change.applied_redist_bold_debt_gain += single_redemption.applied_redist_bold_debt_gain
            total_trove_change.old_weighted_recorded_debt += single_redemption.old_weighted_recorded_debt
            total_trove_change.new_weighted_recorded_debt += single_redemption.new_weighted_recorded_debt
            total_coll_fee += single_redemption.coll_fee
            
            # Update remaining BOLD to redeem
            remaining_bold -= single_redemption.bold_lot
            
            # Move to next trove
            single_redemption.trove_id = next_trove_to_check
            single_redemption.is_zombie_trove = False
        
        # Update ActivePool with total trove changes
        if self.active_pool:
            self.active_pool.mint_agg_interest_and_account_for_trove_change(total_trove_change, None)
            
        # Send redeemed collateral to redeemer
        redeemed_amount = total_trove_change.debt_decrease
        if self.active_pool and total_trove_change.coll_decrease > 0:
            self.active_pool.send_coll(redeemer, total_trove_change.coll_decrease)
            
        # The Bold will be burned by the calling contract
        
        return (redeemed_amount, total_coll_fee, total_trove_change.coll_decrease)
    
    def _redeem_collateral_from_trove(self, single_redemption, max_bold_amount, price, redemption_rate):
        """
        Redeems collateral from a specific trove.
        
        Args:
            single_redemption: SingleRedemptionValues object to populate
            max_bold_amount: Maximum amount of BOLD to redeem
            price: Current price of collateral
            redemption_rate: Redemption fee rate
            
        Returns:
            None (updates the provided SingleRedemptionValues object)
        """
        # Get the latest trove data including redistribution gains
        self._get_latest_trove_data(single_redemption.trove_id, single_redemption.trove)
        
        # Determine the amount of BOLD to redeem from this trove
        single_redemption.bold_lot = min(max_bold_amount, single_redemption.trove.entire_debt)
        
        # Calculate collateral amount and fee
        corresponding_coll = single_redemption.bold_lot * self.DECIMAL_PRECISION / price
        single_redemption.coll_fee = corresponding_coll * redemption_rate / self.DECIMAL_PRECISION
        single_redemption.coll_lot = corresponding_coll - single_redemption.coll_fee
        
        # Apply the redemption to the trove
        is_trove_in_batch = single_redemption.batch_address is not None
        new_debt = self._apply_single_redemption(single_redemption, is_trove_in_batch)
        
        # Check if the trove should be made zombie
        if new_debt < self.MIN_DEBT / self.DECIMAL_PRECISION:
            # Only make it zombie if it wasn't already
            if not single_redemption.is_zombie_trove:
                # Mark as zombie
                self.troves[single_redemption.trove_id].status = Status.ZOMBIE
                
                # Remove from sorted list
                if is_trove_in_batch:
                    if self.sorted_troves:
                        self.sorted_troves.remove_from_batch(single_redemption.trove_id)
                else:
                    if self.sorted_troves:
                        self.sorted_troves.remove(single_redemption.trove_id)
                        
                # If it's a partial redemption, store pointer for next redemption
                if new_debt > 0:
                    self.last_zombie_trove_id = single_redemption.trove_id
            elif new_debt == 0:
                # Reset last zombie trove pointer if fully redeemed
                self.last_zombie_trove_id = 0
    
    def _apply_single_redemption(self, single_redemption, is_trove_in_batch):
        """
        Applies a single redemption to a trove.
        
        Args:
            single_redemption: SingleRedemptionValues object with redemption data
            is_trove_in_batch: Whether the trove is in a batch
            
        Returns:
            New debt amount after redemption
        """
        # Calculate new debt and collateral after redemption
        new_debt = single_redemption.trove.entire_debt - single_redemption.bold_lot
        new_coll = single_redemption.trove.entire_coll - single_redemption.coll_lot
        
        # Store applied redistribution gain
        single_redemption.applied_redist_bold_debt_gain = single_redemption.trove.redist_bold_debt_gain
        
        if is_trove_in_batch:
            # Get latest batch data
            self._get_latest_batch_data(single_redemption.batch_address, single_redemption.batch)
            
            # Calculate weighted debt changes for the batch
            new_amount_for_weighted_debt = (
                single_redemption.batch.entire_debt_without_redistribution +
                single_redemption.trove.redist_bold_debt_gain - 
                single_redemption.bold_lot
            )
            
            single_redemption.old_weighted_recorded_debt = single_redemption.batch.weighted_recorded_debt
            single_redemption.new_weighted_recorded_debt = (
                new_amount_for_weighted_debt * single_redemption.batch.annual_interest_rate
            )
            
            # Create trove change for batch management fee calculation
            trove_change = TroveChange(
                debt_decrease=single_redemption.bold_lot,
                coll_decrease=single_redemption.coll_lot,
                applied_redist_bold_debt_gain=single_redemption.trove.redist_bold_debt_gain,
                applied_redist_coll_gain=single_redemption.trove.redist_coll_gain,
                old_weighted_recorded_batch_management_fee=single_redemption.batch.weighted_recorded_batch_management_fee,
                new_weighted_recorded_batch_management_fee=(
                    new_amount_for_weighted_debt * single_redemption.batch.annual_management_fee
                )
            )
            
            # Update batch management fee
            if self.active_pool:
                self.active_pool.mint_batch_management_fee(
                    time.time(),
                    0,  # batch_accrued_management_fee handled in outer function
                    trove_change.old_weighted_recorded_batch_management_fee,
                    trove_change.new_weighted_recorded_batch_management_fee,
                    single_redemption.batch_address
                )
            
            # Update trove collateral
            self.troves[single_redemption.trove_id].coll = new_coll
            
            # Update batch shares (skip batch shares ratio check to avoid blocking redemptions)
            self._update_batch_shares(
                single_redemption.trove_id,
                single_redemption.batch_address,
                trove_change,
                new_debt,
                single_redemption.batch.entire_coll_without_redistribution,
                single_redemption.batch.entire_debt_without_redistribution,
                False  # _check_batch_shares_ratio
            )
        else:
            # Update normal trove
            single_redemption.old_weighted_recorded_debt = single_redemption.trove.weighted_recorded_debt
            single_redemption.new_weighted_recorded_debt = new_debt * single_redemption.trove.annual_interest_rate
            
            self.troves[single_redemption.trove_id].debt = new_debt
            self.troves[single_redemption.trove_id].coll = new_coll
            self.troves[single_redemption.trove_id].last_debt_update_time = int(time.time())
        
        # Update trove stake and total stakes
        single_redemption.new_stake = self._update_stake_and_total_stakes(
            single_redemption.trove_id, new_coll
        )
        
        # Move pending trove rewards to Active Pool
        if self.default_pool:
            self._move_pending_trove_rewards_to_active_pool(
                single_redemption.trove.redist_bold_debt_gain,
                single_redemption.trove.redist_coll_gain
            )
        
        # Update trove reward snapshots
        self._update_trove_reward_snapshots(single_redemption.trove_id)
        
        return new_debt
    
    def _update_batch_interest_prior_to_redemption(self, batch_address):
        """
        Updates batch interest before a redemption.
        
        Args:
            batch_address: Address of the batch manager
            
        Returns:
            None
        """
        batch = LatestBatchData()
        self._get_latest_batch_data(batch_address, batch)
        
        # Update batch debt
        self.batches[batch_address].debt = batch.entire_debt_without_redistribution
        self.batches[batch_address].last_debt_update_time = int(time.time())
        
        # Create batch trove change
        batch_trove_change = TroveChange(
            old_weighted_recorded_debt=batch.weighted_recorded_debt,
            new_weighted_recorded_debt=batch.entire_debt_without_redistribution * batch.annual_interest_rate,
            batch_accrued_management_fee=batch.accured_management_fee,
            old_weighted_recorded_batch_management_fee=batch.weighted_recorded_batch_management_fee,
            new_weighted_recorded_batch_management_fee=(
                batch.entire_debt_without_redistribution * batch.annual_management_fee
            )
        )
        
        # Update Active Pool
        if self.active_pool:
            self.active_pool.mint_agg_interest_and_account_for_trove_change(
                batch_trove_change, batch_address
            )
    
    # --- Urgent redemption functions (for system shutdown) ---
    
    def urgent_redemption(self, redeemer, bold_amount, trove_ids, min_collateral):
        """
        Performs urgent redemption when the system is in shutdown mode.
        
        System shutdown is an emergency safety mechanism activated when extreme
        market conditions threaten the stability of the protocol. During shutdown,
        normal operations are paused, but users can still:
        1. Close their troves by repaying debt
        2. Perform urgent redemptions to recover their collateral
        
        Urgent redemption differs from regular redemption in several ways:
        1. Redeemers can specify which troves to redeem from
        2. A redemption bonus is applied (currently 1%)
        3. ICR checks are bypassed to ensure all redemptions can succeed
        4. Minimum collateral requirements can be specified
        
        This process ensures that even during a system emergency, BOLD holders
        can exit the system and recover their underlying collateral, maintaining
        trust in the protocol's ability to honor its obligations.
        
        Args:
            redeemer: Address of the BOLD holder redeeming tokens
            bold_amount: Amount of BOLD to redeem
            trove_ids: Array of trove IDs to redeem from
            min_collateral: Minimum collateral to receive
            
        Returns:
            Tuple of (redeemed_amount, total_coll_drawn)
            
        Raises:
            ValueError: If system is not in shutdown mode or redemption conditions aren't met
        """
        if self.shutdown_time == 0:
            raise ValueError("System is not shut down")
            
        if bold_amount <= 0:
            raise ValueError("BOLD amount must be greater than zero")
            
        # Check if redeemer has enough BOLD
        if self.bold_token and self.bold_token.balance_of(redeemer) < bold_amount:
            raise ValueError("Insufficient BOLD balance")
            
        # Get the current price
        price = self.price_feed.fetch_price() if self.price_feed else 0
        if price <= 0:
            raise ValueError("Invalid price")
            
        # Track total changes
        total_trove_change = TroveChange()
        
        # Amount of BOLD still to redeem
        remaining_bold = bold_amount
        
        # Process each trove in the provided array
        for trove_id in trove_ids:
            if remaining_bold == 0:
                break
                
            # Skip non-existent or already closed troves
            if (trove_id not in self.troves or
                not self._is_active_or_zombie(self.troves[trove_id].status) or
                self.troves[trove_id].debt == 0):
                continue
                
            # Create redemption values object
            single_redemption = SingleRedemptionValues(trove_id=trove_id)
            self._get_latest_trove_data(trove_id, single_redemption.trove)
            
            # If trove is in a batch, update batch interest first
            single_redemption.batch_address = self._get_batch_manager(trove_id)
            if single_redemption.batch_address is not None:
                self._update_batch_interest_prior_to_redemption(single_redemption.batch_address)
                
            # Perform urgent redemption
            self._urgent_redeem_collateral_from_trove(
                single_redemption, remaining_bold, price
            )
            
            # Update running totals
            total_trove_change.coll_decrease += single_redemption.coll_lot
            total_trove_change.debt_decrease += single_redemption.bold_lot
            total_trove_change.applied_redist_bold_debt_gain += single_redemption.applied_redist_bold_debt_gain
            total_trove_change.old_weighted_recorded_debt += single_redemption.old_weighted_recorded_debt
            total_trove_change.new_weighted_recorded_debt += single_redemption.new_weighted_recorded_debt
            
            # Update remaining BOLD to redeem
            remaining_bold -= single_redemption.bold_lot
        
        # Check if minimum collateral requirement is met
        if total_trove_change.coll_decrease < min_collateral:
            raise ValueError(f"Collateral amount below minimum: {total_trove_change.coll_decrease} < {min_collateral}")
            
        # Update ActivePool with total trove changes
        if self.active_pool:
            self.active_pool.mint_agg_interest_and_account_for_trove_change(total_trove_change, None)
            
        # Send redeemed collateral to redeemer
        redeemed_amount = total_trove_change.debt_decrease
        if self.active_pool and total_trove_change.coll_decrease > 0:
            self.active_pool.send_coll(redeemer, total_trove_change.coll_decrease)
            
        # Burn redeemed BOLD
        if self.bold_token:
            self.bold_token.burn(redeemer, redeemed_amount)
            
        return (redeemed_amount, total_trove_change.coll_decrease)
    
    def _urgent_redeem_collateral_from_trove(self, single_redemption, max_bold_amount, price):
        """
        Performs urgent redemption from a trove during system shutdown.
        
        Args:
            single_redemption: SingleRedemptionValues object to populate
            max_bold_amount: Maximum amount of BOLD to redeem
            price: Current price of collateral
            
        Returns:
            None (updates the provided SingleRedemptionValues object)
        """
        # Determine the amount of BOLD to redeem from this trove
        single_redemption.bold_lot = min(max_bold_amount, single_redemption.trove.entire_debt)
        
        # Calculate collateral amount with bonus
        single_redemption.coll_lot = (
            single_redemption.bold_lot * 
            (self.DECIMAL_PRECISION + self.URGENT_REDEMPTION_BONUS) / 
            price
        )
        
        # Cap by available collateral
        if single_redemption.coll_lot > single_redemption.trove.entire_coll:
            single_redemption.coll_lot = single_redemption.trove.entire_coll
            single_redemption.bold_lot = (
                single_redemption.trove.entire_coll * 
                price / 
                (self.DECIMAL_PRECISION + self.URGENT_REDEMPTION_BONUS)
            )
        
        # Apply the redemption
        is_trove_in_batch = single_redemption.batch_address is not None
        self._apply_single_redemption(single_redemption, is_trove_in_batch)
    
    # --- Shutdown function ---
    
    def shutdown(self):
        """
        Shuts down the system, preventing new borrowing operations.
        
        System shutdown is a critical emergency mechanism designed to protect
        the protocol in extreme circumstances, such as:
        1. Severe market crashes that threaten system solvency
        2. Discovery of critical vulnerabilities
        3. Regulatory actions requiring cessation of operations
        
        When shutdown is triggered:
        1. No new troves can be opened
        2. No existing troves can increase their debt
        3. Regular redemptions are blocked
        4. Only urgent redemptions and trove closures are allowed
        5. Interest accrual stops at the shutdown timestamp
        
        This creates an orderly wind-down process that prioritizes system stability
        and ensures all users can eventually exit their positions.
        
        Returns:
            None
        """
        self.shutdown_time = int(time.time())
        
        # Set shutdown flag in Active Pool
        if self.active_pool:
            self.active_pool.set_shutdown_flag()
    
    # --- Helper functions ---
    
    def get_current_icr(self, trove_id, price):
        """
        Calculates the current ICR (Individual Collateral Ratio) of a trove.
        
        The ICR is the most important health metric for a trove, calculated as:
        
            ICR = (collateral * price) / debt
        
        This ratio determines:
        1. Whether a trove can be created or modified (must be >= MCR, which is 110%)
        2. Whether a trove is eligible for liquidation (if ICR < MCR)
        3. The order of troves for redemption (prioritizing higher ICR troves)
        4. Whether a trove can join a batch (usually requires higher ICR than MCR)
        
        This function accounts for all components of a trove's state:
        - Direct collateral and debt
        - Redistribution gains
        - Accrued interest
        - Batch management fees if applicable
        
        Args:
            trove_id: ID of the trove
            price: Current price of collateral in USD
            
        Returns:
            ICR as a decimal (e.g., 1.5 for 150%)
        """
        trove = LatestTroveData()
        self._get_latest_trove_data(trove_id, trove)
        
        # Calculate ICR: (coll * price) / debt
        if trove.entire_debt == 0:
            return float('inf')  # Avoid division by zero
            
        return (trove.entire_coll * price) / trove.entire_debt
    
    def _get_latest_trove_data(self, trove_id, trove):
        """
        Populates a LatestTroveData object with current trove data.
        
        Args:
            trove_id: ID of the trove
            trove: LatestTroveData object to populate
            
        Returns:
            None (updates the provided LatestTroveData object)
        """
        if trove_id not in self.troves:
            raise ValueError(f"Trove {trove_id} does not exist")
            
        # If trove belongs to a batch, get data from batch
        batch_address = self._get_batch_manager(trove_id)
        if batch_address is not None:
            batch = LatestBatchData()
            self._get_latest_batch_data(batch_address, batch)
            self._get_latest_trove_data_from_batch(trove_id, batch_address, trove, batch)
            return
            
        # Calculate redistribution gains
        stake = self.troves[trove_id].stake
        snapshot = self.reward_snapshots.get(trove_id, RewardSnapshot())
        
        trove.redist_bold_debt_gain = stake * (self.L_bold_debt - snapshot.bold_debt) / self.DECIMAL_PRECISION
        trove.redist_coll_gain = stake * (self.L_coll - snapshot.coll) / self.DECIMAL_PRECISION
        
        # Get recorded debt and interest rate
        trove.recorded_debt = self.troves[trove_id].debt
        trove.annual_interest_rate = self.troves[trove_id].annual_interest_rate
        trove.weighted_recorded_debt = trove.recorded_debt * trove.annual_interest_rate
        
        # Calculate accrued interest
        period = self._get_interest_period(self.troves[trove_id].last_debt_update_time)
        trove.accrued_interest = self._calc_interest(trove.weighted_recorded_debt, period)
        
        # Calculate entire debt and collateral
        trove.entire_debt = trove.recorded_debt + trove.redist_bold_debt_gain + trove.accrued_interest
        trove.entire_coll = self.troves[trove_id].coll + trove.redist_coll_gain
        
        # Store last interest rate adjustment time
        trove.last_interest_rate_adj_time = self.troves[trove_id].last_interest_rate_adj_time
    
    def _get_latest_trove_data_from_batch(self, trove_id, batch_address, trove, batch):
        """
        Populates a LatestTroveData object for a trove in a batch.
        
        Args:
            trove_id: ID of the trove
            batch_address: Address of the batch manager
            trove: LatestTroveData object to populate
            batch: LatestBatchData object with batch data
            
        Returns:
            None (updates the provided LatestTroveData object)
        """
        t = self.troves[trove_id]
        batch_debt_shares = t.batch_debt_shares
        total_debt_shares = self.batches[batch_address].total_debt_shares
        
        # Calculate redistribution gains
        stake = t.stake
        snapshot = self.reward_snapshots.get(trove_id, RewardSnapshot())
        
        trove.redist_bold_debt_gain = stake * (self.L_bold_debt - snapshot.bold_debt) / self.DECIMAL_PRECISION
        trove.redist_coll_gain = stake * (self.L_coll - snapshot.coll) / self.DECIMAL_PRECISION
        
        # Calculate pro-rata debt and interest from batch
        if total_debt_shares > 0:
            trove.recorded_debt = batch.recorded_debt * batch_debt_shares / total_debt_shares
            trove.weighted_recorded_debt = trove.recorded_debt * batch.annual_interest_rate
            trove.accrued_interest = batch.accured_interest * batch_debt_shares / total_debt_shares
            trove.accrued_batch_management_fee = batch.accured_management_fee * batch_debt_shares / total_debt_shares
            
        # Get interest rate from batch
        trove.annual_interest_rate = batch.annual_interest_rate
        
        # Calculate entire debt and collateral
        trove.entire_debt = (
            trove.recorded_debt + 
            trove.redist_bold_debt_gain + 
            trove.accrued_interest + 
            trove.accrued_batch_management_fee
        )
        trove.entire_coll = t.coll + trove.redist_coll_gain
        
        # Get last interest rate adjustment time (max of trove and batch)
        trove.last_interest_rate_adj_time = max(
            batch.last_interest_rate_adj_time,
            t.last_interest_rate_adj_time
        )
    
    def _get_latest_batch_data(self, batch_address, batch):
        """
        Populates a LatestBatchData object with current batch data.
        
        Args:
            batch_address: Address of the batch manager
            batch: LatestBatchData object to populate
            
        Returns:
            None (updates the provided LatestBatchData object)
        """
        if batch_address not in self.batches:
            raise ValueError(f"Batch {batch_address} does not exist")
            
        b = self.batches[batch_address]
        
        # Store interest rate and management fee
        batch.annual_interest_rate = b.annual_interest_rate
        batch.annual_management_fee = b.annual_management_fee
        
        # Calculate weighted recorded debt and management fee
        batch.recorded_debt = b.debt
        batch.weighted_recorded_debt = batch.recorded_debt * batch.annual_interest_rate
        batch.weighted_recorded_batch_management_fee = batch.recorded_debt * batch.annual_management_fee
        
        # Calculate accrued interest and management fee
        period = self._get_interest_period(b.last_debt_update_time)
        batch.accured_interest = self._calc_interest(batch.weighted_recorded_debt, period)
        batch.accured_management_fee = self._calc_interest(batch.weighted_recorded_batch_management_fee, period)
        
        # Calculate debt without redistribution
        batch.entire_debt_without_redistribution = batch.recorded_debt + batch.accured_interest
        
        # Calculate collateral without redistribution
        batch.entire_coll_without_redistribution = b.coll
        
        # Store last interest rate adjustment time
        batch.last_interest_rate_adj_time = b.last_interest_rate_adj_time
    
    def _get_interest_period(self, last_update_time):
        """
        Calculates the interest period since the last update.
        
        Args:
            last_update_time: Timestamp of the last update
            
        Returns:
            Time period in seconds
        """
        current_time = int(time.time())
        
        # If system is shut down, use shutdown time instead of current time
        if self.shutdown_time != 0:
            current_time = min(current_time, self.shutdown_time)
            
        return max(0, current_time - last_update_time)
    
    def _calc_interest(self, weighted_debt, period):
        """
        Calculates interest for a given weighted debt and time period.
        
        Args:
            weighted_debt: Debt * interest rate
            period: Time period in seconds
            
        Returns:
            Interest amount
        """
        if period == 0:
            return 0
            
        return (weighted_debt * period) // (self.ONE_YEAR_IN_SECONDS * self.DECIMAL_PRECISION)
    
    def _get_batch_manager(self, trove_id):
        """
        Gets the batch manager for a trove.
        
        Args:
            trove_id: ID of the trove
            
        Returns:
            Batch manager address or None if trove is not in a batch
        """
        if trove_id not in self.troves:
            return None
            
        return self.troves[trove_id].interest_batch_manager
    
    def _is_active_or_zombie(self, status):
        """
        Checks if a trove status is active or zombie.
        
        Args:
            status: Status enum value
            
        Returns:
            True if active or zombie, False otherwise
        """
        return status == Status.ACTIVE or status == Status.ZOMBIE
    
    def _get_trove_owner(self, trove_id):
        """
        Gets the owner of a trove.
        
        Args:
            trove_id: ID of the trove
            
        Returns:
            Address of the trove owner
        """
        # In the actual contract, this would call troveNFT.ownerOf(trove_id)
        # Here we'll return a placeholder
        return f"owner_{trove_id}"
    
    def _get_last_trove_id(self):
        """
        Gets the ID of the trove with the lowest interest rate.
        
        Returns:
            Trove ID or 0 if no troves exist
        """
        # In the actual contract, this would call sortedTroves.getLast()
        # Here we'll return the last trove ID in our array or 0 if empty
        return self.trove_ids[-1] if self.trove_ids else 0
    
    def _get_prev_trove_id(self, trove_id):
        """
        Gets the ID of the trove with the next lower interest rate.
        
        Args:
            trove_id: ID of the current trove
            
        Returns:
            Trove ID or 0 if no previous trove exists
        """
        # In the actual contract, this would call sortedTroves.getPrev(trove_id)
        # Here we'll find the trove ID in our array and return the previous one
        try:
            index = self.trove_ids.index(trove_id)
            return self.trove_ids[index - 1] if index > 0 else 0
        except ValueError:
            return 0
    
    def _update_stake_and_total_stakes(self, trove_id, new_coll):
        """
        Updates a trove's stake and the total stakes.
        
        Args:
            trove_id: ID of the trove
            new_coll: New collateral amount
            
        Returns:
            New stake value
        """
        if trove_id not in self.troves:
            raise ValueError(f"Trove {trove_id} does not exist")
            
        # Subtract old stake from total
        old_stake = self.troves[trove_id].stake
        self.total_stakes -= old_stake
        
        # Calculate and set new stake
        new_stake = new_coll
        self.troves[trove_id].stake = new_stake
        
        # Add new stake to total
        self.total_stakes += new_stake
        
        return new_stake
    
    def _get_redemption_rate(self, price):
        """
        Calculates the redemption fee rate.
        
        Args:
            price: Current price of collateral
            
        Returns:
            Redemption fee rate
        """
        # In the actual contract, this would calculate a dynamic fee
        # For simplicity, we'll use a fixed rate
        return 0.005 * self.DECIMAL_PRECISION  # 0.5%
    
    def _close_trove(self, trove_id, trove_change, batch_address, batch_coll, batch_debt, status):
        """
        Closes a trove.
        
        Args:
            trove_id: ID of the trove to close
            trove_change: TroveChange object with debt and collateral changes
            batch_address: Address of the batch manager (if in batch)
            batch_coll: Batch collateral amount (if in batch)
            batch_debt: Batch debt amount (if in batch)
            status: New status for the trove
            
        Returns:
            None
        """
        if trove_id not in self.troves:
            raise ValueError(f"Trove {trove_id} does not exist")
            
        # Remove stake from total
        self.total_stakes -= self.troves[trove_id].stake
        
        # Update batch if trove is in one
        if batch_address is not None:
            # Update batch data
            batch = self.batches[batch_address]
            batch.debt = batch_debt
            batch.coll = batch_coll
            batch.total_debt_shares -= self.troves[trove_id].batch_debt_shares
            
            # Remove trove from batch's list if applicable
            # In the actual contract, this might be tracked differently
        
        # Remove from sortedTroves
        if self.sorted_troves:
            if batch_address is not None:
                self.sorted_troves.remove_from_batch(trove_id)
            else:
                self.sorted_troves.remove(trove_id)
        
        # Update trove status
        self.troves[trove_id].status = status
        
        # Zero out trove data
        self.troves[trove_id].debt = 0
        self.troves[trove_id].coll = 0
        self.troves[trove_id].stake = 0
        self.troves[trove_id].annual_interest_rate = 0
        
        # Remove from trove IDs array
        if trove_id in self.trove_ids:
            self.trove_ids.remove(trove_id)
    
    def _update_batch_shares(self, trove_id, batch_address, trove_change, new_debt, 
                            batch_coll, batch_debt, check_batch_shares_ratio=True):
        """
        Updates a trove's batch debt shares and batch totals.
        
        Args:
            trove_id: ID of the trove
            batch_address: Address of the batch manager
            trove_change: TroveChange object with debt and collateral changes
            new_debt: New debt amount for the trove
            batch_coll: Batch collateral amount
            batch_debt: Batch debt amount
            check_batch_shares_ratio: Whether to check batch shares ratio
            
        Returns:
            None
        """
        if trove_id not in self.troves or batch_address not in self.batches:
            raise ValueError("Invalid trove or batch")
            
        # Update batch totals
        batch = self.batches[batch_address]
        batch.debt = batch_debt
        batch.coll = batch_coll
        
        # Calculate new debt shares based on change in debt
        old_shares = self.troves[trove_id].batch_debt_shares
        old_debt = new_debt + trove_change.debt_decrease - trove_change.debt_increase
        
        # Calculate new shares
        if batch.total_debt_shares == 0 or old_debt == 0:
            # First trove in batch or trove had zero debt
            new_shares = new_debt
        else:
            # Proportional to debt change
            new_shares = old_shares * new_debt / old_debt
        
        # Check batch shares ratio if required
        if check_batch_shares_ratio and batch.debt > 0:
            shares_ratio = new_shares / batch.total_debt_shares
            debt_ratio = new_debt / batch.debt
            
            # Ensure shares ratio doesn't exceed debt ratio by too much
            max_ratio_difference = 0.01  # 1% maximum difference
            if shares_ratio > debt_ratio * (1 + max_ratio_difference):
                raise ValueError("Batch shares ratio too high")
        
        # Update batch total shares
        batch.total_debt_shares = batch.total_debt_shares - old_shares + new_shares
        
        # Update trove batch shares
        self.troves[trove_id].batch_debt_shares = new_shares
    
    def _move_pending_trove_rewards_to_active_pool(self, bold, coll):
        """
        Moves pending trove rewards from Default Pool to Active Pool.
        
        Args:
            bold: Amount of BOLD debt to move
            coll: Amount of collateral to move
            
        Returns:
            None
        """
        if bold == 0 and coll == 0:
            return
            
        if self.default_pool is None:
            raise ValueError("Default Pool not initialized")
            
        # Move BOLD debt
        if bold > 0:
            self.default_pool.decrease_bold_debt(bold)
            
        # Move collateral
        if coll > 0:
            self.default_pool.send_coll_to_active_pool(coll)