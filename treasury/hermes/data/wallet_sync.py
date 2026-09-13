#!/usr/bin/env python3
"""
Wallet Synchronization Script
Keeps trading bot's internal position state aligned with actual wallet holdings.
"""

import json
import time
import os
from pathlib import Path
from solana.rpc.api import Client
from solana.rpc.commitment import Confirmed
from solders.pubkey import Pubkey

# Configuration
SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com"
WALLET_ADDRESS = "HaDbEJKwmPkh54PCMjvirtBfde4175WCBDEjyA1u6h6F"
POSITIONS_FILE = Path("/home/terexitarius/.hermes/hermes-token-screener/data/active_positions.json")
DUST_THRESHOLD = 0.000001  # SOL equivalent

# Common SPL tokens to check (symbol -> mint address)
COMMON_TOKENS = {
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    "SRM": "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
    "MNGO": "MangoCzJ36DicZyWjttJnXSEMiTrSRsj8HveCKZt7Y7",
    "ORCA": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    "SMB": "SMPLXmC4vFrLDAxBvz6x2DXx7K1JNpZBw2Pk7W6V24H",
    "bSOL": "7goLEpWkVhBvPTQ5TK4zMX39T7GY7v77HyiC5mR5EKL",
    "stSOL": "7LpWkC6qV2xW127rjT7Lgbv7RxyV6Aa7GJR2yJMencK",
    "mSOL": "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcVp7Xq",
    "LIQD": " liquidation bot placeholder",
    "FIDA": "EchesyfXePKkuLNLvJHfMzxgW1XjGsaTB1wyRR6yNBJk",
    "KURO": "KuroMpWAiZMG6R12NMjxs5cGZQRZv2NbZHRnZubPdD",
    "SAMO": "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    "DUST": "DUSTawucrTsAU8MuqKFbsHjFNBwbJDG9GfBfvTEF3Ao",
    "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopnLxdFGRHBfQDa",
    "BODEN": "A8C3huNdspmLNi5he7zr8uHN4q7VJTcpVsD3k7GbT8K",
    "FORM": "formE4YheU2tXEWqjNPcBinK4R4DgBzWvAsVPRaM4z1W",
    "CAT": "G7W3NyNJDMt7rGcWfFEfgJpWz2W5BWa2m1sDkj5xdLmo",
    "MOO": "Mo8147y2C17xX57sQCVkdVPLsSxzVKjEVQX4NXZrG3t",
    "PYTH": "HZ1JovNiVodL4aS5BFc7uKn6jJHFbLGZ3J9jP3mGv3r",
    "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "W": "/wV4vCABtVhYPvYCT4x7dD2Ypw2xVEMPj8t5BqJg7pYN",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRLixiWVEajB4YYVbkZQDq",
    "RENDER": "RN74eZ9Bv2TA1oyur6LLRXDvgJJhxKpw54gZ7t2jgr",
}

def get_solana_client():
    """Initialize Solana RPC client."""
    return Client(SOLANA_RPC_URL)

def get_native_balance(client, wallet_pubkey):
    """Get SOL balance."""
    try:
        response = client.get_balance(wallet_pubkey, commitment=Confirmed)
        if response.value:
            lamports = response.value
            return lamports / 1e9  # Convert to SOL
    except Exception as e:
        print(f"Error fetching SOL balance: {e}")
    return 0.0

def get_token_balance(client, wallet_pubkey, token_mint):
    """Get SPL token balance."""
    try:
        token_pubkey = Pubkey.from_string(token_mint)
        # Using get_token_accounts_by_owner
        response = client.get_token_accounts_by_owner(
            wallet_pubkey,
            {"mint": token_pubkey},
            commitment=Confirmed,
            encoding="jsonParsed"
        )
        
        if response.value:
            for account in response.value:
                # Parse the token balance from parsed data
                if hasattr(account, 'pubkey') and hasattr(account, 'account'):
                    data = account.account.data.parsed
                    if 'info' in data and 'tokenAmount' in data['info']:
                        amount = int(data['info']['tokenAmount']['amount'])
                        decimals = int(data['info']['tokenAmount']['decimals'])
                        ui_amount = amount / (10 ** decimals)
                        return ui_amount
        return 0.0
    except Exception as e:
        # Token account may not exist
        return 0.0

def get_wallet_token_balances():
    """Scan actual token balances from the wallet."""
    client = get_solana_client()
    wallet_pubkey = Pubkey.from_string(WALLET_ADDRESS)
    
    balances = {}
    
    # Get SOL balance
    sol_balance = get_native_balance(client, wallet_pubkey)
    balances["SOL"] = sol_balance
    print(f"SOL balance: {sol_balance}")
    
    # Get common SPL token balances
    for symbol, mint in COMMON_TOKENS.items():
        balance = get_token_balance(client, wallet_pubkey, mint)
        if balance > DUST_THRESHOLD:
            balances[symbol] = balance
            print(f"{symbol} balance: {balance}")
        time.sleep(0.1)  # Rate limiting
    
    return balances

def load_positions():
    """Load existing positions from file."""
    if POSITIONS_FILE.exists():
        with open(POSITIONS_FILE, 'r') as f:
            return json.load(f)
    return {"positions": [], "updated_at": 0}

def save_positions(data):
    """Save positions to file with automatic backup."""
    # Create backup with timestamp
    if POSITIONS_FILE.exists():
        backup_name = f"active_positions.bak_sync_{time.strftime('%Y%m%d_%H%M%S')}"
        backup_path = POSITIONS_FILE.parent / backup_name
        POSITIONS_FILE.rename(backup_path)
        print(f"Created backup: {backup_name}")
    
    data["updated_at"] = time.time()
    with open(POSITIONS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def update_positions_from_wallet(current_balances):
    """Update internal position state to match wallet."""
    data = load_positions()
    positions = data["positions"]
    
    updated_symbols = set()
    
    # Update existing positions
    for pos in positions:
        symbol = pos.get("symbol")
        if symbol in current_balances:
            new_balance = current_balances[symbol]
            pos["balance"] = new_balance
            if new_balance > DUST_THRESHOLD:
                pos["status"] = "active"
            else:
                pos["status"] = "closed"
            updated_symbols.add(symbol)
        elif pos.get("status") != "closed":
            pos["status"] = "closed"
    
    # Add untracked holdings
    for symbol, balance in current_balances.items():
        if symbol not in updated_symbols and balance > DUST_THRESHOLD:
            # Find mint address
            mint = None
            if symbol == "SOL":
                mint = "So11111111111111111111111111111111111111112"
            else:
                mint = COMMON_TOKENS.get(symbol)
            
            if mint:
                new_pos = {
                    "symbol": symbol,
                    "address": mint,
                    "chain": "solana",
                    "balance": balance,
                    "usd_value": 0,
                    "status": "active",
                    "entry_time": time.time(),
                    "entry_price": 0,
                    "ai_confidence": None,
                    "ai_reason": f"Wallet sync - {symbol} holding",
                    "is_synthetic": False
                }
                positions.append(new_pos)
                print(f"Added new position: {symbol} ({balance})")
    
    data["positions"] = positions
    return data

def sync_wallet_positions():
    """Main synchronization function."""
    print(f"Starting wallet sync at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Wallet: {WALLET_ADDRESS}")
    print("-" * 50)
    
    # Get current wallet balances
    current_balances = get_wallet_token_balances()
    
    print("-" * 50)
    print(f"Found {len(current_balances)} token(s) with balance > dust threshold")
    
    # Update positions
    data = update_positions_from_wallet(current_balances)
    
    # Save updated positions
    save_positions(data)
    
    print("-" * 50)
    print(f"Position sync complete. Updated at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total positions: {len(data['positions'])}")
    
    return data

if __name__ == "__main__":
    sync_wallet_positions()
