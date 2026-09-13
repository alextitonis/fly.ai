"""
Collateral Surplus Pool Model for Bold Protocol.

This module simulates the CollSurplusPool contract which holds collateral that was
sent back to users during liquidations when their collateral was worth more than their debt,
accounting for the liquidation penalty. Users can claim this collateral at any time.
"""

class CollSurplusPool:
    """
    Simulates the CollSurplusPool contract which manages surplus collateral.
    """
    
    def __init__(self):
        # Total collateral stored in this contract
        self.coll_balance = 0
        
        # Mapping of user address to their claimable collateral balance
        self.balances = {}
    
    def get_coll_balance(self):
        """
        Returns the total collateral in the CollSurplusPool.
        """
        return self.coll_balance
    
    def get_collateral(self, account):
        """
        Returns the claimable collateral balance for a specific account.
        """
        return self.balances.get(account, 0)
    
    def account_surplus(self, account, amount):
        """
        Records a surplus collateral amount for an account.
        Called by TroveManager during liquidations.
        """
        if amount <= 0:
            raise ValueError(f"Invalid collateral amount: {amount}")
            
        # Initialize account balance if it doesn't exist
        if account not in self.balances:
            self.balances[account] = 0
            
        # Add surplus collateral to account
        self.balances[account] += amount
        
        # Update total collateral balance
        self.coll_balance += amount
        
        return True
    
    def claim_coll(self, account):
        """
        Allows a user to claim their surplus collateral.
        Called by BorrowerOperations when a user wants to claim their surplus.
        """
        claimable_coll = self.balances.get(account, 0)
        
        if claimable_coll <= 0:
            raise ValueError("No collateral available to claim")
            
        # Reset the account's balance
        self.balances[account] = 0
        
        # Reduce the total collateral balance
        self.coll_balance -= claimable_coll
        
        # In the actual contract, collateral tokens would be transferred here
        # We just return the amount that would be transferred
        
        return claimable_coll