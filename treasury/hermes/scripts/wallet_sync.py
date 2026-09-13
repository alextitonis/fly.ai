#!/usr/bin/env python3
"""
Wallet Synchronization Script
Scans wallet token balances and updates active_positions.json
"""

import os
import sys
import json
import time
import requests

# Add scripts to path
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".hermes", "scripts"))

# Load trading bot module
import trading_bot as tb


def get_wallet_token_balances():
    """Scan actual token balances from the wallet."""
    balances = {}
    solana_wallet = os.environ.get("WALLET_ADDRESS_SOLANA", "")
    
    if not solana_wallet:
        print("ERROR: No Solana wallet address configured")
        return balances
    
    # Get SOL balance via direct RPC or Gateway
    try:
        # Try direct RPC first since Gateway might not be running
        rpc_url = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [solana_wallet],
        }
        r = requests.post(rpc_url, json=payload, timeout=15)
        data = r.json()
        print(f"    RPC Response: {data}")
        if "result" in data:
            lamports = data.get("result", {}).get("value", 0)
            sol_balance = lamports / 1e9
            print(f"    Lamports: {lamports}")
            if sol_balance > 0.000001:  # Above dust threshold
                balances["SOL"] = {
                    "symbol": "SOL",
                    "address": "So11111111111111111111111111111111111111112",
                    "chain": "solana",
                    "balance": sol_balance
                }
                print(f"  SOL: {sol_balance} (via RPC)")
            else:
                print(f"  SOL: {sol_balance} (below dust threshold)")
    except Exception as e:
        print(f"  ERROR getting SOL via RPC: {e}")
        # Fallback: try Gateway
        try:
            sol_balance = tb.get_native_balance("solana")
            if sol_balance > 0.000001:
                balances["SOL"] = {
                    "symbol": "SOL",
                    "address": "So11111111111111111111111111111111111111112",
                    "chain": "solana",
                    "balance": sol_balance
                }
                print(f"  SOL: {sol_balance} (via Gateway)")
        except Exception as e2:
            print(f"  ERROR getting SOL via Gateway: {e2}")
    
    # Get all token balances via Gateway (if running)
    try:
        gw = tb.gw_client
        resp = gw.solana_balances(address=solana_wallet)
        if "error" not in resp:
            bal_data = resp.get("balances", {})
            # Handle various response formats
            if isinstance(bal_data, dict):
                for sym, bal in bal_data.items():
                    if sym != "SOL" and float(bal) > 0.000001:
                        balances[sym] = {
                            "symbol": sym,
                            "address": "",
                            "chain": "solana",
                            "balance": float(bal)
                        }
                        print(f"  {sym}: {bal}")
            elif isinstance(bal_data, list):
                for item in bal_data:
                    sym = item.get("symbol", "")
                    bal = float(item.get("balance", 0))
                    if sym != "SOL" and bal > 0.000001:
                        balances[sym] = {
                            "symbol": sym,
                            "address": item.get("address", ""),
                            "chain": "solana",
                            "balance": bal
                        }
                        print(f"  {sym}: {bal}")
    except Exception as e:
        print(f"  Gateway not available for token balances: {e}")
    
    return balances


def load_positions():
    """Load existing positions from file."""
    pos_file = os.path.join(os.path.expanduser("~"), ".hermes", "hermes-token-screener", "data", "active_positions.json")
    if os.path.exists(pos_file):
        try:
            with open(pos_file, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading positions: {e}")
    return {"positions": [], "updated_at": 0}


def save_positions(positions_data):
    """Save positions to file."""
    pos_file = os.path.join(os.path.expanduser("~"), ".hermes", "hermes-token-screener", "data", "active_positions.json")
    os.makedirs(os.path.dirname(pos_file), exist_ok=True)
    with open(pos_file, "w") as f:
        json.dump(positions_data, f, indent=2)


def update_positions_from_wallet(current_balances, existing_positions):
    """Update internal position state to match wallet."""
    positions = existing_positions.get("positions", [])
    existing_symbols = {p["symbol"]: i for i, p in enumerate(positions)}
    
    updated_positions = []
    current_time = time.time()
    
    # Update existing positions
    for pos in positions:
        sym = pos.get("symbol", "")
        
        # Find matching balance from current wallet
        if sym in current_balances:
            wallet_entry = current_balances[sym]
            new_balance = wallet_entry.get("balance", 0)
            old_balance = pos.get("balance", 0)
            
            # Update balance but preserve most metadata
            pos["balance"] = new_balance
            pos["status"] = "active" if new_balance > 0.000001 else "closed"
            
            # Preserve entry metadata if it was set
            if pos.get("entry_time", 0) == 0:
                pos["entry_time"] = current_time
            
            print(f"  Updated {sym}: {old_balance} -> {new_balance}")
        else:
            # Token no longer in wallet - mark as closed but keep record
            pos["status"] = "closed"
            print(f"  Marked closed: {sym}")
        
        updated_positions.append(pos)
    
    # Add any untracked holdings as new positions
    for sym, wallet_entry in current_balances.items():
        if sym not in existing_symbols:
            # New position discovered
            new_pos = {
                "symbol": sym,
                "address": wallet_entry.get("address", ""),
                "chain": wallet_entry.get("chain", "solana"),
                "balance": wallet_entry.get("balance", 0),
                "usd_value": 0,
                "status": "active",
                "entry_time": current_time,
                "entry_price": 0,
                "ai_confidence": None,
                "ai_reason": "Added via wallet synchronization",
                "is_synthetic": False
            }
            updated_positions.append(new_pos)
            print(f"  Added new position: {sym}")
    
    return {
        "positions": updated_positions,
        "updated_at": current_time
    }


def main():
    print("=" * 60)
    print("WALLET SYNCHRONIZATION")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Step 1: Get current wallet balances
    print("\n[1] Scanning wallet token balances...")
    current_balances = get_wallet_token_balances()
    print(f"  Found {len(current_balances)} tokens with balance > dust threshold")
    
    # Step 2: Load existing positions
    print("\n[2] Loading existing positions...")
    existing_positions = load_positions()
    existing_count = len(existing_positions.get("positions", []))
    print(f"  Loaded {existing_count} existing positions")
    
    # Step 3: Update positions to match wallet
    print("\n[3] Synchronizing positions...")
    updated_data = update_positions_from_wallet(current_balances, existing_positions)
    updated_count = len(updated_data.get("positions", []))
    print(f"  Result: {updated_count} total positions")
    
    # Step 4: Save updated positions
    print("\n[4] Saving updated positions...")
    save_positions(updated_data)
    print("  Saved to active_positions.json")
    
    # Summary
    print("\n" + "=" * 60)
    print("SYNCHRONIZATION COMPLETE")
    print("=" * 60)
    
    # Print summary table
    active_positions = [p for p in updated_data.get("positions", []) if p.get("status") == "active"]
    print(f"Active positions: {len(active_positions)}")
    for pos in active_positions:
        print(f"  {pos.get('symbol')}: {pos.get('balance', 0):.6f} ({pos.get('chain')})")
    
    return updated_data


if __name__ == "__main__":
    main()