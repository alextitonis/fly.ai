"""
Active Pool Model for Bold Protocol.

This module simulates the ActivePool contract which holds the collateral and Bold debt for all active troves.
When a trove is liquidated, its Coll and Bold debt are transferred from the Active Pool to either the 
Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
"""

class ActivePool:
    """
    Simulates the ActivePool contract which manages collateral and debt for active troves.
    """
    
    def __init__(self):
        # Deposited collateral tracker
        self.coll_balance = 0
        
        # Aggregate recorded debt tracker (updated when a Trove's debt is touched or when interest is minted)
        self.agg_recorded_debt = 0
        
        # Sum of individual recorded Trove debts weighted by their respective chosen interest rates
        self.agg_weighted_debt_sum = 0
        
        # Last time at which the aggregate recorded debt and weighted sum were updated
        self.last_agg_update_time = 0
        
        # Shutdown time (0 if not shut down)
        self.shutdown_time = 0
        
        # Aggregate batch fees tracker
        self.agg_batch_management_fees = 0
        
        # Sum of individual recorded Trove debts weighted by respective batch management fees
        self.agg_weighted_batch_management_fee_sum = 0
        
        # Last time at which the aggregate batch fees and weighted sum were updated
        self.last_agg_batch_management_fees_update_time = 0
        
        # References to other contracts
        self.default_pool = None
        self.stability_pool = None
        self.bold_token = None
        self.interest_router = None
        
        # Constants
        self.DECIMAL_PRECISION = 1e18
        self.ONE_YEAR = 31536000  # 365 * 24 * 60 * 60 seconds
        self.SP_YIELD_SPLIT = 0.5 * self.DECIMAL_PRECISION  # 50% of interest goes to stability pool
    
    def get_coll_balance(self):
        """Returns the collateral balance in the Active Pool."""
        return self.coll_balance
    
    def calc_pending_agg_interest(self, current_time):
        """
        Calculates pending aggregate interest.
        Uses ceiling division to ensure positive error, making sure system debt >= sum(trove debt).
        """
        if self.shutdown_time != 0:
            return 0
        
        time_passed = current_time - self.last_agg_update_time
        if time_passed == 0:
            return 0
            
        # We use ceiling division to ensure positive error
        interest = (self.agg_weighted_debt_sum * time_passed) / (self.ONE_YEAR * self.DECIMAL_PRECISION)
        # Add ceiling effect
        if (self.agg_weighted_debt_sum * time_passed) % (self.ONE_YEAR * self.DECIMAL_PRECISION) > 0:
            interest += 1
        
        return interest
    
    def calc_pending_sp_yield(self, current_time):
        """Calculates pending yield for the Stability Pool."""
        return (self.calc_pending_agg_interest(current_time) * self.SP_YIELD_SPLIT) // self.DECIMAL_PRECISION
    
    def calc_pending_agg_batch_management_fee(self, current_time):
        """Calculates pending aggregate batch management fee."""
        period_end = self.shutdown_time if self.shutdown_time != 0 else current_time
        period_start = min(self.last_agg_batch_management_fees_update_time, period_end)
        
        if period_end == period_start:
            return 0
            
        fee = (self.agg_weighted_batch_management_fee_sum * (period_end - period_start)) // (self.ONE_YEAR * self.DECIMAL_PRECISION)
        # Add ceiling effect
        if (self.agg_weighted_batch_management_fee_sum * (period_end - period_start)) % (self.ONE_YEAR * self.DECIMAL_PRECISION) > 0:
            fee += 1
            
        return fee
    
    def get_bold_debt(self, current_time):
        """Returns sum of aggregate recorded debt plus aggregate pending interest and fees."""
        return (self.agg_recorded_debt + 
                self.calc_pending_agg_interest(current_time) + 
                self.agg_batch_management_fees + 
                self.calc_pending_agg_batch_management_fee(current_time))
    
    def send_coll(self, account, amount):
        """Send collateral to an account (stability pool, borrower, etc.)."""
        if amount <= 0 or amount > self.coll_balance:
            raise ValueError(f"Invalid collateral amount: {amount}")
        
        self.coll_balance -= amount
        # The actual transfer would happen in the contract
        # Here we just update our internal state
        
        return True
    
    def send_coll_to_default_pool(self, amount):
        """Send collateral to the Default Pool."""
        if amount <= 0 or amount > self.coll_balance:
            raise ValueError(f"Invalid collateral amount: {amount}")
        
        self.coll_balance -= amount
        
        # Update Default Pool's collateral balance
        if self.default_pool:
            self.default_pool.receive_coll(amount)
        
        return True
    
    def receive_coll(self, amount):
        """Receive collateral from an external source."""
        if amount <= 0:
            raise ValueError(f"Invalid collateral amount: {amount}")
        
        self.coll_balance += amount
        return True
    
    def mint_agg_interest(self, current_time, upfront_fee=0):
        """
        Mint aggregate interest and upfront fee BOLD tokens.
        Returns the amount of BOLD minted.
        """
        minted_amount = self.calc_pending_agg_interest(current_time) + upfront_fee
        
        if minted_amount > 0:
            # Mint part to SP and part to router for LPs
            sp_yield = (self.SP_YIELD_SPLIT * minted_amount) // self.DECIMAL_PRECISION
            remainder_to_lps = minted_amount - sp_yield
            
            # In the actual contract, tokens would be minted here
            if self.bold_token:
                self.bold_token.mint(self.interest_router, remainder_to_lps)
            
                if sp_yield > 0:
                    self.bold_token.mint(self.stability_pool, sp_yield)
                    if self.stability_pool:
                        self.stability_pool.trigger_bold_rewards(sp_yield)
        
        self.last_agg_update_time = current_time
        return minted_amount
    
    def mint_batch_management_fee(self, current_time, batch_accrued_fee, 
                                 old_weighted_recorded_batch_fee, new_weighted_recorded_batch_fee, 
                                 batch_address):
        """
        Mint batch management fee BOLD tokens.
        Updates internal accounting and mints fee to batch address.
        """
        # Update aggregate accounting
        self.agg_recorded_debt += batch_accrued_fee
        
        # Calculate pending batch management fee
        pending_fee = self.calc_pending_agg_batch_management_fee(current_time)
        
        # Update batch management fee accounting
        self.agg_batch_management_fees = self.agg_batch_management_fees + pending_fee - batch_accrued_fee
        
        # Update weighted batch management fee sum
        self.agg_weighted_batch_management_fee_sum = (
            self.agg_weighted_batch_management_fee_sum
            + new_weighted_recorded_batch_fee
            - old_weighted_recorded_batch_fee
        )
        
        # Mint fee to batch address
        if batch_accrued_fee > 0 and self.bold_token:
            self.bold_token.mint(batch_address, batch_accrued_fee)
        
        self.last_agg_batch_management_fees_update_time = current_time
    
    def set_shutdown_flag(self):
        """Set the shutdown flag, recording the current time."""
        self.shutdown_time = int(time())
        
    def has_been_shut_down(self):
        """Check if the system has been shut down."""
        return self.shutdown_time != 0