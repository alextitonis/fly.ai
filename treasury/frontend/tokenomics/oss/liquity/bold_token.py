"""
Bold Token Model for Bold Protocol.

This module simulates the BoldToken contract which is the protocol's stablecoin.
It handles minting, burning, and transfers of BOLD tokens.
"""

class BoldToken:
    """
    Simulates the BoldToken contract which is the protocol's stablecoin.
    """
    
    def __init__(self, initial_supply=0):
        # Total token supply
        self.total_supply = initial_supply
        
        # Mapping of addresses to token balances
        self.balances = {}
        
        # Mapping of accounts that are allowed to mint tokens
        self.minters = set()
        
        # Owner of the contract
        self.owner = None
    
    def set_owner(self, owner):
        """Sets the owner of the contract."""
        self.owner = owner
    
    def add_minter(self, minter):
        """
        Adds an address to the list of allowed minters.
        Only callable by the owner.
        """
        if not self.owner:
            raise ValueError("Owner not set")
        
        self.minters.add(minter)
    
    def remove_minter(self, minter):
        """
        Removes an address from the list of allowed minters.
        Only callable by the owner.
        """
        if not self.owner:
            raise ValueError("Owner not set")
            
        if minter in self.minters:
            self.minters.remove(minter)
    
    def balance_of(self, account):
        """Returns the token balance of the given account."""
        return self.balances.get(account, 0)
    
    def transfer(self, sender, recipient, amount):
        """
        Transfers tokens from sender to recipient.
        
        Args:
            sender: Address sending the tokens
            recipient: Address receiving the tokens
            amount: Amount of tokens to transfer
            
        Returns:
            True if successful
        """
        if amount <= 0:
            raise ValueError("Amount must be greater than zero")
            
        sender_balance = self.balances.get(sender, 0)
        
        if sender_balance < amount:
            raise ValueError("Insufficient balance")
            
        # Update balances
        self.balances[sender] = sender_balance - amount
        self.balances[recipient] = self.balances.get(recipient, 0) + amount
        
        return True
    
    def mint(self, recipient, amount):
        """
        Mints new tokens to the recipient account.
        Only callable by authorized minters.
        
        Args:
            recipient: Address receiving the minted tokens
            amount: Amount of tokens to mint
            
        Returns:
            True if successful
        """
        if amount <= 0:
            raise ValueError("Amount must be greater than zero")
            
        # Update recipient balance
        self.balances[recipient] = self.balances.get(recipient, 0) + amount
        
        # Update total supply
        self.total_supply += amount
        
        return True
    
    def burn(self, from_account, amount):
        """
        Burns tokens from the given account.
        
        Args:
            from_account: Address to burn tokens from
            amount: Amount of tokens to burn
            
        Returns:
            True if successful
        """
        if amount <= 0:
            raise ValueError("Amount must be greater than zero")
            
        from_balance = self.balances.get(from_account, 0)
        
        if from_balance < amount:
            raise ValueError("Insufficient balance")
            
        # Update balance
        self.balances[from_account] = from_balance - amount
        
        # Update total supply
        self.total_supply -= amount
        
        return True
    
    def send_to_pool(self, sender, pool, amount):
        """
        Transfers tokens from sender to a pool (e.g., Stability Pool).
        Used when depositing to the Stability Pool.
        
        Args:
            sender: Address sending the tokens
            pool: Address of the pool receiving the tokens
            amount: Amount of tokens to transfer
            
        Returns:
            True if successful
        """
        return self.transfer(sender, pool, amount)
    
    def return_from_pool(self, pool, recipient, amount):
        """
        Transfers tokens from a pool back to a recipient.
        Used when withdrawing from the Stability Pool.
        
        Args:
            pool: Address of the pool sending the tokens
            recipient: Address receiving the tokens
            amount: Amount of tokens to transfer
            
        Returns:
            True if successful
        """
        return self.transfer(pool, recipient, amount)