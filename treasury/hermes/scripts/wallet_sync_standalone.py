#!/usr/bin/env python3
"""
Standalone Wallet Sync - Scanning wallet token balances and updating active_positions.json
"""

import os
import sys
import json
import time
import requests

POSITIONS_FILE = os.path.join(os.path.expanduser("~"), ".hermes", "hermes-token-screener", "data", "active_positions.json")

def get_wallet_token_balances():
    """Scan actual token balances from the wallet."""
    balances = {}
    solana_wallet = os.environ.get("WALLET_ADDRESS_SOLANA", "")
    
    if not solana_wallet:
        print("ERROR: No Solana wallet address configured")
        return balances
    
    print(f"  Wallet: {solana_wallet}")
    
    # Get SOL balance via RPC
    try:
        rpc_url = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [solana_wallet],
        }
        r = requests.post(rpc_url, json=payload, timeout=15)
        data = r.json()
        if "result" in data:
            lamports = data.get("result", {}).get("value", 0)
            sol_balance = lamports / 1e9
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
    
    # Get SPL token balances via getTokenAccountsByOwner
    try:
        rpc_url = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTokenAccountsByOwner",
            "params": [
                solana_wallet,
                {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Gs623VQ5DA"},
                {"encoding": "jsonParsed"}
            ],
        }
        r = requests.post(rpc_url, json=payload, timeout=15)
        data = r.json()
        if "result" in data:
            accounts = data.get("result", {}).get("value", [])
            for acc in accounts:
                info = acc.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
                mint = info.get("mint", "")
                amount = info.get("tokenAmount", {}).get("uiAmountString", "0")
                balance = float(amount)
                if balance > 0.000001 and mint:
                    # Use mint address as symbol key (could be improved with name lookup)
                    symbol = mint[:8] + "..." if len(mint) > 8 else mint
                    balances[symbol] = {
                        "symbol": symbol,
                        "address": mint,
                        "chain": "solana",
                        "balance": balance
                    }
                    print(f"  {symbol}: {balance}")
    except Exception as e:
        print(f"  ERROR getting SPL tokens: {e}")
    
    return balances


def load_positions():
    """Load existing positions from file."""
    if os.path.exists(POSITIONS_FILE):
        try:
            with open(POSITIONS_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading positions: {e}")
    return {"positions": [], "updated_at": 0}


def save_positions(positions_data):
    """Save positions to file."""
    os.makedirs(os.path.dirname(POSITIONS_FILE), exist_ok=True)
    with open(POSITIONS_FILE, "w") as f:
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

            # Update balance, status, and last_synced timestamp
            pos["balance"] = new_balance
            pos["current_balance"] = new_balance
            pos["status"] = "active" if new_balance > 0.000001 else "closed"
            pos["last_synced"] = current_time

            # Preserve entry metadata if it was set
            if pos.get("entry_time", 0) == 0:
                pos["entry_time"] = current_time

            print(f"  Updated {sym}: {old_balance} -> {new_balance}")
        else:
            # Token no longer in wallet - mark as closed but keep record
            pos["status"] = "closed"
            pos["last_synced"] = current_time
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
                "current_balance": wallet_entry.get("balance", 0),
                "usd_value": 0,
                "status": "active",
                "entry_time": current_time,
                "entry_price": 0,
                "ai_confidence": None,
                "ai_reason": "Added via wallet synchronization",
                "is_synthetic": False,
                "last_synced": current_time
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