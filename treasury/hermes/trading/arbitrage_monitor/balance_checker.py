import os, requests
from typing import Dict, List

ANKR_ENDPOINT = os.getenv(
    "ANKR_MULTICHAIN_RPC",
    "https://rpc.ankr.com/multichain/0e8c5d238f6a82f29d32988cccc7094b7435463936045a913be32563e16b5792"
)

def get_multi_chain_balances(wallet: str, chains: List[str]) -> Dict[str, Dict[str, int]]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "ankr_getAccountBalance",
        "params": {"blockchain": chains, "walletAddress": wallet}
    }
    try:
        r = requests.post(ANKR_ENDPOINT, json=payload, timeout=10)
        r.raise_for_status()
        raw = r.json().get("result", {})
        out = {}
        for chain, tokens in raw.items():
            out[chain] = {t["contractAddress"]: int(t["tokenBalance"]) for t in tokens}
        return out
    except Exception as e:
        print(f"[BalanceChecker] Error: {e}")
        return {}
