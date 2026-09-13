"""
Stability Pool Model for Bold Protocol.

This module simulates the StabilityPool contract which holds Bold tokens deposited by Stability Pool depositors.
When a trove is liquidated, the Stability Pool offsets the debt and receives collateral as compensation.
"""

import numpy as np
from dataclasses import dataclass

@dataclass
class Deposit:
    """Represents a user's deposit in the Stability Pool."""
    initial_value: float  # Initial deposit amount

@dataclass
class Snapshots:
    """Snapshots of system state when a deposit was made."""
    S: float  # Coll reward sum from liquidations
    P: float  # Product used to track compounded deposits
    B: float  # Bold reward sum from minted interest
    scale: int  # Current scale factor

class StabilityPool:
    """
    Simulates the StabilityPool contract which holds BOLD deposits and facilitates liquidations.
    """
    
    def __init__(self, bold_token=None, trove_manager=None, active_pool=None):
        # Deposited collateral tracker
        self.coll_balance = 0
        
        # Tracker for Bold held in the pool
        self.total_bold_deposits = 0
        
        # Total remaining Bold yield gains from interest mints, not yet paid to depositors
        self.yield_gains_owed = 0
        
        # Yield gains not yet accounted for because total deposits were too small
        self.yield_gains_pending = 0
        
        # User deposits and snapshots
        self.deposits = {}  # address -> Deposit
        self.deposit_snapshots = {}  # address -> Snapshots
        self.stashed_coll = {}  # address -> stashed collateral
        
        # Product 'P': Running product for compounded deposits
        self.P = 1e36  # P_PRECISION
        
        # Scale factor constants
        self.P_PRECISION = 1e36
        self.SCALE_FACTOR = 1e9
        self.MAX_SCALE_FACTOR_EXPONENT = 8
        self.SCALE_SPAN = 2
        
        # Current scale
        self.current_scale = 0
        
        # Maps from scale to sum S (collateral gains) and B (yield gains)
        self.scale_to_S = {}  # scale -> S
        self.scale_to_B = {}  # scale -> B
        
        # Initialize maps with zeros for current scale
        self.scale_to_S[0] = 0
        self.scale_to_B[0] = 0
        
        # External contracts
        self.bold_token = bold_token
        self.trove_manager = trove_manager
        self.active_pool = active_pool
        
        # Constants
        self.MIN_BOLD_IN_SP = 1e18  # Minimum 1 BOLD must remain in the pool
        self.DECIMAL_PRECISION = 1e18
        
    def get_coll_balance(self):
        """Returns the collateral balance in the Stability Pool."""
        return self.coll_balance
    
    def get_total_bold_deposits(self):
        """Returns the total BOLD deposits in the Stability Pool."""
        return self.total_bold_deposits
    
    def get_yield_gains_owed(self):
        """Returns the total yield gains owed to depositors."""
        return self.yield_gains_owed
    
    def get_yield_gains_pending(self):
        """Returns the pending yield gains not yet accounted for."""
        return self.yield_gains_pending
    
    def provide_to_sp(self, depositor, top_up_amount, do_claim=True):
        """
        Allows a user to provide BOLD to the Stability Pool.
        
        Args:
            depositor: Address of the depositor
            top_up_amount: Amount of BOLD to add to the pool
            do_claim: Whether to claim collateral/yield gains or keep them stashed
            
        Returns:
            True if successful
        """
        if top_up_amount <= 0:
            raise ValueError("Amount must be greater than zero")
        
        # Mint any pending interest in the active pool first
        if self.active_pool:
            self.active_pool.mint_agg_interest(time.time())
        
        # Get initial deposit amount
        initial_deposit = self.deposits.get(depositor, Deposit(0)).initial_value
        
        # Calculate current gains
        current_coll_gain = self.get_depositor_coll_gain(depositor)
        current_yield_gain = self.get_depositor_yield_gain(depositor)
        
        # Calculate compounded BOLD deposit
        compounded_bold_deposit = self.get_compounded_bold_deposit(depositor)
        
        # Determine how much yield to keep vs. send
        if do_claim:
            kept_yield_gain = 0
            yield_gain_to_send = current_yield_gain
        else:
            kept_yield_gain = current_yield_gain
            yield_gain_to_send = 0
        
        # Calculate new deposit amount
        new_deposit = compounded_bold_deposit + top_up_amount + kept_yield_gain
        
        # Determine how much collateral to keep stashed vs. send
        if do_claim:
            new_stashed_coll = 0
            coll_to_send = self.stashed_coll.get(depositor, 0) + current_coll_gain
        else:
            new_stashed_coll = self.stashed_coll.get(depositor, 0) + current_coll_gain
            coll_to_send = 0
        
        # Update deposit and snapshots
        self._update_deposit_and_snapshots(depositor, new_deposit, new_stashed_coll)
        
        # Transfer BOLD from depositor to pool
        if self.bold_token:
            self.bold_token.transfer_to_pool(depositor, self, top_up_amount)
        
        # Update total deposits
        self._update_total_bold_deposits(top_up_amount + kept_yield_gain, 0)
        
        # Decrease yield gains owed
        self._decrease_yield_gains_owed(current_yield_gain)
        
        # Send BOLD yield to depositor if applicable
        if yield_gain_to_send > 0 and self.bold_token:
            self._send_bold_to_depositor(depositor, yield_gain_to_send)
        
        # Send collateral to depositor if applicable
        if coll_to_send > 0:
            self._send_coll_gain_to_depositor(depositor, coll_to_send)
        
        # Check if there were pending yields and update if threshold is reached
        self._update_yield_rewards_sum(0)
        
        return True
    
    def withdraw_from_sp(self, depositor, amount, do_claim=True):
        """
        Allows a user to withdraw BOLD from the Stability Pool.
        
        Args:
            depositor: Address of the depositor
            amount: Amount of BOLD to withdraw
            do_claim: Whether to claim collateral/yield gains or keep them stashed
            
        Returns:
            The amount of BOLD withdrawn
        """
        # Get initial deposit amount
        initial_deposit = self.deposits.get(depositor, Deposit(0)).initial_value
        
        if initial_deposit <= 0:
            raise ValueError("User must have a non-zero deposit")
        
        # Mint any pending interest in the active pool first
        if self.active_pool:
            self.active_pool.mint_agg_interest(time.time())
        
        # Calculate current gains
        current_coll_gain = self.get_depositor_coll_gain(depositor)
        current_yield_gain = self.get_depositor_yield_gain(depositor)
        
        # Calculate compounded BOLD deposit
        compounded_bold_deposit = self.get_compounded_bold_deposit(depositor)
        
        # Determine how much BOLD to withdraw (capped by compounded deposit)
        bold_to_withdraw = min(amount, compounded_bold_deposit)
        
        # Determine how much yield to keep vs. send
        if do_claim:
            kept_yield_gain = 0
            yield_gain_to_send = current_yield_gain
        else:
            kept_yield_gain = current_yield_gain
            yield_gain_to_send = 0
        
        # Calculate new deposit amount
        new_deposit = compounded_bold_deposit - bold_to_withdraw + kept_yield_gain
        
        # Determine how much collateral to keep stashed vs. send
        if do_claim:
            new_stashed_coll = 0
            coll_to_send = self.stashed_coll.get(depositor, 0) + current_coll_gain
        else:
            new_stashed_coll = self.stashed_coll.get(depositor, 0) + current_coll_gain
            coll_to_send = 0
        
        # Update deposit and snapshots
        self._update_deposit_and_snapshots(depositor, new_deposit, new_stashed_coll)
        
        # Decrease yield gains owed
        self._decrease_yield_gains_owed(current_yield_gain)
        
        # Update total deposits
        new_total_bold_deposits = self._update_total_bold_deposits(kept_yield_gain, bold_to_withdraw)
        
        # Send BOLD to depositor (withdrawn amount + any claimed yield)
        if self.bold_token and (bold_to_withdraw > 0 or yield_gain_to_send > 0):
            self._send_bold_to_depositor(depositor, bold_to_withdraw + yield_gain_to_send)
        
        # Send collateral to depositor if applicable
        if coll_to_send > 0:
            self._send_coll_gain_to_depositor(depositor, coll_to_send)
        
        # Check that we maintain minimum BOLD in the pool
        if new_total_bold_deposits < self.MIN_BOLD_IN_SP:
            raise ValueError("Withdrawal must leave totalBoldDeposits >= MIN_BOLD_IN_SP")
        
        return bold_to_withdraw
    
    def claim_all_coll_gains(self, depositor):
        """
        Allows a user to claim all stashed collateral gains even if they have no deposit.
        
        Args:
            depositor: Address of the user claiming collateral
            
        Returns:
            The amount of collateral sent to the user
        """
        # Check that user has no deposit
        if self.deposits.get(depositor, Deposit(0)).initial_value > 0:
            raise ValueError("User must have no deposit")
        
        # Mint any pending interest in the active pool first
        if self.active_pool:
            self.active_pool.mint_agg_interest(time.time())
        
        # Get stashed collateral
        coll_to_send = self.stashed_coll.get(depositor, 0)
        
        if coll_to_send <= 0:
            raise ValueError("No collateral available to claim")
        
        # Reset stashed collateral
        self.stashed_coll[depositor] = 0
        
        # Send collateral to depositor
        self._send_coll_gain_to_depositor(depositor, coll_to_send)
        
        return coll_to_send
    
    def trigger_bold_rewards(self, bold_yield):
        """
        Triggered by the Active Pool when BOLD interest is minted to the Stability Pool.
        
        Args:
            bold_yield: Amount of BOLD yield minted to the Stability Pool
            
        Returns:
            True if successful
        """
        self._update_yield_rewards_sum(bold_yield)
        return True
    
    def _update_yield_rewards_sum(self, new_yield):
        """
        Updates the yield rewards sum with new yield.
        
        Args:
            new_yield: Amount of new BOLD yield to add
            
        Returns:
            None
        """
        accumulated_yield_gains = self.yield_gains_pending + new_yield
        if accumulated_yield_gains == 0:
            return
        
        # When total deposits is very small, B is not updated
        # The BOLD issued is held until total deposits reach MIN_BOLD_IN_SP
        if self.total_bold_deposits < self.MIN_BOLD_IN_SP:
            self.yield_gains_pending = accumulated_yield_gains
            return
        
        # Move pending gains to owed and update B
        self.yield_gains_owed += accumulated_yield_gains
        self.yield_gains_pending = 0
        
        # Update B for current scale
        self.scale_to_B[self.current_scale] += (self.P * accumulated_yield_gains) // self.total_bold_deposits
    
    def offset(self, debt_to_offset, coll_to_add):
        """
        Offsets debt with BOLD in the Stability Pool during liquidations.
        
        Args:
            debt_to_offset: Amount of debt to cancel with BOLD in the pool
            coll_to_add: Amount of collateral to add to the pool
            
        Returns:
            True if successful
        """
        # Update S for the current scale (collateral rewards per unit staked)
        self.scale_to_S[self.current_scale] += (self.P * coll_to_add) // self.total_bold_deposits
        
        # Calculate new P value
        numerator = self.P * (self.total_bold_deposits - debt_to_offset)
        new_P = numerator // self.total_bold_deposits
        
        # P must never decrease to 0
        if new_P <= 0:
            raise ValueError("P must never decrease to 0")
        
        # Check if we need to apply scaling
        while new_P < self.P_PRECISION // self.SCALE_FACTOR:
            numerator *= self.SCALE_FACTOR
            new_P = numerator // self.total_bold_deposits
            self.current_scale += 1
            
            # Initialize maps for the new scale
            if self.current_scale not in self.scale_to_S:
                self.scale_to_S[self.current_scale] = 0
            if self.current_scale not in self.scale_to_B:
                self.scale_to_B[self.current_scale] = 0
        
        # Update P
        self.P = new_P
        
        # Move offset collateral and debt
        self._move_offset_coll_and_debt(coll_to_add, debt_to_offset)
        
        return True
    
    def _move_offset_coll_and_debt(self, coll_to_add, debt_to_offset):
        """
        Moves collateral and debt during offset operations.
        
        Args:
            coll_to_add: Amount of collateral to add to the pool
            debt_to_offset: Amount of debt to offset
            
        Returns:
            None
        """
        # Cancel BOLD debt with BOLD in the stability pool
        self._update_total_bold_deposits(0, debt_to_offset)
        
        # Burn the debt that was successfully offset
        if self.bold_token:
            self.bold_token.burn(self, debt_to_offset)
        
        # Update internal collateral balance
        self.coll_balance += coll_to_add
        
        # Pull collateral from Active Pool
        if self.active_pool:
            self.active_pool.send_coll(self, coll_to_add)
    
    def _update_total_bold_deposits(self, deposit_increase, deposit_decrease):
        """
        Updates the total BOLD deposits in the pool.
        
        Args:
            deposit_increase: Amount to increase deposits by
            deposit_decrease: Amount to decrease deposits by
            
        Returns:
            New total BOLD deposits
        """
        if deposit_increase == 0 and deposit_decrease == 0:
            return self.total_bold_deposits
            
        new_total_bold_deposits = self.total_bold_deposits + deposit_increase - deposit_decrease
        self.total_bold_deposits = new_total_bold_deposits
        
        return new_total_bold_deposits
    
    def _decrease_yield_gains_owed(self, amount):
        """
        Decreases the yield gains owed by the given amount.
        
        Args:
            amount: Amount to decrease by
            
        Returns:
            None
        """
        if amount == 0:
            return
            
        new_yield_gains_owed = self.yield_gains_owed - amount
        self.yield_gains_owed = new_yield_gains_owed
    
    def get_depositor_coll_gain(self, depositor):
        """
        Calculates a depositor's collateral gain.
        
        Args:
            depositor: Address of the depositor
            
        Returns:
            The depositor's collateral gain
        """
        initial_deposit = self.deposits.get(depositor, Deposit(0)).initial_value
        if initial_deposit == 0:
            return 0
        
        snapshots = self.deposit_snapshots.get(depositor, Snapshots(S=0, P=self.P_PRECISION, B=0, scale=0))
        
        # Collateral gains from the same scale need no scaling
        normalized_gains = self.scale_to_S.get(snapshots.scale, 0) - snapshots.S
        
        # Scale down further collateral gains by powers of SCALE_FACTOR
        for i in range(1, self.SCALE_SPAN + 1):
            scale_i = snapshots.scale + i
            if scale_i in self.scale_to_S:
                normalized_gains += self.scale_to_S[scale_i] // (self.SCALE_FACTOR ** i)
        
        # Calculate collateral gain (capped by total collateral balance)
        coll_gain = (initial_deposit * normalized_gains) // snapshots.P
        return min(coll_gain, self.coll_balance)
    
    def get_depositor_yield_gain(self, depositor):
        """
        Calculates a depositor's yield gain.
        
        Args:
            depositor: Address of the depositor
            
        Returns:
            The depositor's yield gain
        """
        initial_deposit = self.deposits.get(depositor, Deposit(0)).initial_value
        if initial_deposit == 0:
            return 0
        
        snapshots = self.deposit_snapshots.get(depositor, Snapshots(S=0, P=self.P_PRECISION, B=0, scale=0))
        
        # Yield gains from the same scale need no scaling
        normalized_gains = self.scale_to_B.get(snapshots.scale, 0) - snapshots.B
        
        # Scale down further yield gains by powers of SCALE_FACTOR
        for i in range(1, self.SCALE_SPAN + 1):
            scale_i = snapshots.scale + i
            if scale_i in self.scale_to_B:
                normalized_gains += self.scale_to_B[scale_i] // (self.SCALE_FACTOR ** i)
        
        # Calculate yield gain (capped by total yield gains owed)
        yield_gain = (initial_deposit * normalized_gains) // snapshots.P
        return min(yield_gain, self.yield_gains_owed)
    
    def get_compounded_bold_deposit(self, depositor):
        """
        Calculates a depositor's compounded BOLD deposit.
        
        Args:
            depositor: Address of the depositor
            
        Returns:
            The depositor's compounded BOLD deposit
        """
        initial_deposit = self.deposits.get(depositor, Deposit(0)).initial_value
        if initial_deposit == 0:
            return 0
        
        snapshots = self.deposit_snapshots.get(depositor, Snapshots(S=0, P=self.P_PRECISION, B=0, scale=0))
        
        scale_diff = self.current_scale - snapshots.scale
        
        # If scale changes exceed MAX_SCALE_FACTOR_EXPONENT, deposit is rounded to 0
        if scale_diff > self.MAX_SCALE_FACTOR_EXPONENT:
            return 0
        
        # Calculate compounded deposit with scale adjustments
        compounded_deposit = (initial_deposit * self.P) // snapshots.P
        if scale_diff > 0:
            compounded_deposit = compounded_deposit // (self.SCALE_FACTOR ** scale_diff)
        
        return compounded_deposit
    
    def _send_coll_gain_to_depositor(self, depositor, coll_amount):
        """
        Sends collateral gain to a depositor.
        
        Args:
            depositor: Address of the depositor
            coll_amount: Amount of collateral to send
            
        Returns:
            None
        """
        if coll_amount == 0:
            return
        
        # Update internal collateral balance
        self.coll_balance -= coll_amount
        
        # In the real contract, this would transfer tokens
        # Here we just deduct from our balance
    
    def _send_bold_to_depositor(self, depositor, bold_amount):
        """
        Sends BOLD to a depositor.
        
        Args:
            depositor: Address of the depositor
            bold_amount: Amount of BOLD to send
            
        Returns:
            None
        """
        if bold_amount == 0:
            return
        
        # In the real contract, this would transfer tokens from the pool
        if self.bold_token:
            self.bold_token.return_from_pool(self, depositor, bold_amount)
    
    def _update_deposit_and_snapshots(self, depositor, new_deposit, new_stashed_coll):
        """
        Updates a depositor's deposit and snapshots.
        
        Args:
            depositor: Address of the depositor
            new_deposit: New deposit amount
            new_stashed_coll: New stashed collateral amount
            
        Returns:
            None
        """
        # Update deposit and stashed collateral
        if depositor not in self.deposits:
            self.deposits[depositor] = Deposit(0)
        self.deposits[depositor].initial_value = new_deposit
        self.stashed_coll[depositor] = new_stashed_coll
        
        # If deposit is 0, delete snapshots
        if new_deposit == 0:
            if depositor in self.deposit_snapshots:
                del self.deposit_snapshots[depositor]
            return
        
        # Get current values for snapshots
        current_scale = self.current_scale
        current_P = self.P
        current_S = self.scale_to_S.get(current_scale, 0)
        current_B = self.scale_to_B.get(current_scale, 0)
        
        # Update snapshots
        if depositor not in self.deposit_snapshots:
            self.deposit_snapshots[depositor] = Snapshots(S=0, P=self.P_PRECISION, B=0, scale=0)
        
        self.deposit_snapshots[depositor].P = current_P
        self.deposit_snapshots[depositor].S = current_S
        self.deposit_snapshots[depositor].B = current_B
        self.deposit_snapshots[depositor].scale = current_scale