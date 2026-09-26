"""FLYAI price keeper for the Trader Flies NFT (TraderFly.setFlyaiPrice), run as the flybook-worker "keeper" process.

The contract takes $FLYAI payments at a price the keeper posts (FLYAI base units per $1), refuses them once that price is
older than an hour, and caps one post at a 30% move. This loop keeps it fresh (Python port of
flytrade/contracts/tools/flyai-price.mjs, same rules):

  every 5 min: price = DexScreener's most liquid FLYAI pair, checked against GeckoTerminal (skip if they differ > 10%)
  post when it moved >= 3% from the contract's price, or the last post is >= 45 min old
  a move past the 30% cap is followed in 28% steps, one per check

    python flybook/worker/flyai_keeper.py            one check
    python flybook/worker/flyai_keeper.py --loop     forever (fly.toml process "keeper")

Env: TRADERFLY_ADDRESS (the proxy), KEEPER_KEY (the key set as priceKeeper; it can only post prices), RPC (optional).
Without KEEPER_KEY it only prints what it would post.
"""
from __future__ import annotations

import os
import sys
import time

import requests
from eth_account import Account
from eth_utils import keccak

FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C"
RPC = os.environ.get("RPC", "https://rpc.mainnet.chain.robinhood.com")
FLY = os.environ.get("TRADERFLY_ADDRESS", "")
MOVE, MAX_AGE, STEP, AGREE, EVERY, CAP = 0.03, 45 * 60, 0.28, 0.10, 300, 0.30


def sel(sig: str) -> str:
    return "0x" + keccak(text=sig)[:4].hex()


def rpc(method: str, params: list):
    r = requests.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=20).json()
    if "error" in r:
        raise RuntimeError(f"{method}: {r['error'].get('message', r['error'])}")
    return r["result"]


def call_uint(sig: str) -> int:
    return int(rpc("eth_call", [{"to": FLY, "data": sel(sig)}, "latest"]), 16)


def dexscreener() -> float | None:
    pairs = requests.get(f"https://api.dexscreener.com/tokens/v1/robinhood/{FLYAI}", timeout=12).json() or []
    best = sorted([p for p in pairs if (p.get("baseToken") or {}).get("address", "").lower() == FLYAI.lower()
                   and float(p.get("priceUsd") or 0) > 0], key=lambda p: -((p.get("liquidity") or {}).get("usd") or 0))
    return float(best[0]["priceUsd"]) if best else None


def gecko() -> float | None:
    r = requests.get(f"https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/{FLYAI}", timeout=12).json()
    p = float((((r or {}).get("data") or {}).get("attributes") or {}).get("price_usd") or 0)
    return p if p > 0 else None


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def post(target: int, key: str) -> str:
    acct = Account.from_key(key)
    data = sel("setFlyaiPrice(uint256)") + target.to_bytes(32, "big").hex()
    tx = {"to": FLY, "from": acct.address, "data": data, "value": "0x0"}
    gas = int(int(rpc("eth_estimateGas", [tx]), 16) * 1.3)          # also refuses a post the contract would reject
    base = int(rpc("eth_getBlockByNumber", ["latest", False])["baseFeePerGas"], 16)
    signed = acct.sign_transaction({
        "chainId": int(rpc("eth_chainId", []), 16), "type": 2,
        "nonce": int(rpc("eth_getTransactionCount", [acct.address, "pending"]), 16),
        "to": FLY, "value": 0, "data": data, "gas": gas,
        "maxFeePerGas": base * 2 + 1_000_000, "maxPriorityFeePerGas": 1_000_000,
    })
    raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
    h = rpc("eth_sendRawTransaction", ["0x" + raw.hex().removeprefix("0x")])
    for _ in range(60):
        rc = rpc("eth_getTransactionReceipt", [h])
        if rc:
            return f"posted {'ok' if rc['status'] == '0x1' else 'REVERTED'} {h}"
        time.sleep(2)
    return f"sent {h} (no receipt yet)"


def tick() -> None:
    try:
        a = dexscreener()
    except Exception:
        a = None
    try:
        b = gecko()
    except Exception:
        b = None
    usd = a or b
    if not usd:
        return print(f"{now()} no price from either source; not posting", flush=True)
    if a and b and abs(a - b) / min(a, b) > AGREE:
        return print(f"{now()} sources disagree (DexScreener ${a}, GeckoTerminal ${b}); not posting", flush=True)
    target = round(10**18 / usd)
    cur, at = call_uint("flyaiPerDollar()"), call_uint("priceUpdatedAt()")
    age = int(rpc("eth_getBlockByNumber", ["latest", False])["timestamp"], 16) - at
    if cur == 0:
        return print(f"{now()} no price on the contract yet: the owner posts the first one", flush=True)
    moved = abs(target - cur) / cur
    if moved < MOVE and age < MAX_AGE:
        return print(f"{now()} ${usd} ({moved * 100:.2f}% off, posted {age}s ago): nothing to do", flush=True)
    if moved > CAP:
        target = cur + cur * int(STEP * 100) // 100 if target > cur else cur - cur * int(STEP * 100) // 100
    line = f"{now()} ${usd} -> {target // 10**18} FLYAI per $1 (was {cur // 10**18}, {age}s old)"
    key = os.environ.get("KEEPER_KEY", "")
    if not key:
        return print(f"{line}  [dry run: no KEEPER_KEY]", flush=True)
    print(f"{line}  {post(target, key if key.startswith('0x') else '0x' + key)}", flush=True)


def main() -> None:
    if not FLY:
        sys.exit("set TRADERFLY_ADDRESS")
    if "--loop" not in sys.argv:
        return tick()
    while True:
        try:
            tick()
        except Exception as e:                      # one bad check (RPC, API) must not stop the keeper
            print(f"{now()} error: {type(e).__name__}: {e}", flush=True)
        time.sleep(EVERY)


if __name__ == "__main__":
    main()
