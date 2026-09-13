"""
Default Pool Model for Bold Protocol.

This module simulates the DefaultPool contract which holds the collateral and Bold debt
from liquidated troves that couldn't be offset with the StabilityPool.
This redistributes collateral and debt to remaining active troves.
"""

class DefaultPool:
    """
    Simulates the DefaultPool contract which holds collateral and debt for redistribution.
    """
    
    def __init__(self, active_pool=None):
        # Deposited collateral tracker
        self.coll_balance = 0
        
        # Bold debt tracker
        self.bold_debt = 0
        
        # Reference to ActivePool
        self.active_pool = active_pool
    
    def get_coll_balance(self):
        """Returns the collateral balance in the Default Pool."""
        return self.coll_balance
    
    def get_bold_debt(self):
        """Returns the Bold debt in the Default Pool."""
        return self.bold_debt
    
    def receive_coll(self, amount):
        """
        Receives collateral into the Default Pool.
        Called by the Active Pool when trove collateral is redistributed.
        """
        if amount <= 0:
            raise ValueError(f"Invalid collateral amount: {amount}")
        
        self.coll_balance += amount
        return True
    
    def send_coll_to_active_pool(self, amount):
        """
        Sends collateral from the Default Pool to the Active Pool.
        Called when trove's pending collateral rewards are being claimed.
        """
        if amount <= 0 or amount > self.coll_balance:
            raise ValueError(f"Invalid collateral amount: {amount}")
        
        self.coll_balance -= amount
        
        # Transfer collateral to Active Pool
        if self.active_pool:
            self.active_pool.receive_coll(amount)
            
        return True
    
    def increase_bold_debt(self, amount):
        """
        Increases the Bold debt in the Default Pool.
        Called during liquidations when debt is redistributed.
        """
        if amount <= 0:
            raise ValueError(f"Invalid debt amount: {amount}")
        
        self.bold_debt += amount
        return True
    
    def decrease_bold_debt(self, amount):
        """
        Decreases the Bold debt in the Default Pool.
        Called when trove's pending debt rewards are being claimed.
        """
        if amount <= 0 or amount > self.bold_debt:
            raise ValueError(f"Invalid debt amount: {amount}")
        
        self.bold_debt -= amount
        return True