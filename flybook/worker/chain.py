"""$FLYAI on Robinhood Chain: who holds it.

Used by the API (can this wallet make a fly?) and by the tick (is this owner still a holder?).
Token facts were read from the chain on 2026-09-13: chain id 4663, symbol FLYAI, 18 decimals,
supply 1,000,000,000.
"""
from __future__ import annotations

import os
import re
from decimal import Decimal

import requests

RPC = os.environ.get("ROBINHOOD_RPC", "https://rpc.mainnet.chain.robinhood.com")


# 2026-10-03: QuickNode first (the user; its URL from the env QUICKNODE_RPC since 2026-10-14 - no key in the code), then the public RPCs; the next one when one can't be reached / rate-limits / answers 5xx (a JSON-RPC error is returned
# as it is). Robinhood's own RPC first, then dRPC's free one.
RPCS = [u for u in [os.environ.get("QUICKNODE_RPC", "").strip()] if u] * (RPC == "https://rpc.mainnet.chain.robinhood.com") + [RPC] + [u for u in ("https://rpc.mainnet.chain.robinhood.com", "https://robinhood.drpc.org") if u != RPC]


# RPC meter (2026-10-14, QuickNode hit its plan limit): requests by RPC, method and caller, logged every METER_EVERY_S
METER: dict = {}
METER_EVERY_S = 600.0
_meter_at = [__import__("time").time()]


def _meter(url: str, method: str) -> None:
    import sys as _sys
    import time as _time
    f, who = _sys._getframe(2), "?"
    while f is not None:
        name = f.f_code.co_filename.replace("\\", "/").rsplit("/", 1)[-1]
        if name != "chain.py":
            who = f"{name}:{f.f_code.co_name}"
            break
        f = f.f_back
    key = ("quicknode" if "quiknode" in url else url.split("/")[2], method, who)
    METER[key] = METER.get(key, 0) + 1
    now = _time.time()
    if now - _meter_at[0] >= METER_EVERY_S:
        mins = (now - _meter_at[0]) / 60
        qn = sum(n for k, n in METER.items() if k[0] == "quicknode")
        top = sorted(METER.items(), key=lambda kv: -kv[1])[:10]
        print(f"rpc meter: {sum(METER.values())} requests in {mins:.1f} min ({qn} quicknode) | " +
              " | ".join(f"{k[0]} {k[1]} {k[2]} {n}" for k, n in top), flush=True)
        METER.clear()
        _meter_at[0] = now


def _post(payload: dict, timeout: float = 15) -> dict:
    last = None
    for url in RPCS:
        try:
            _meter(url, payload.get("method", "?"))
            r = requests.post(url, json=payload, timeout=timeout,
                              headers={"Referer": "https://www.flyaiworld.com/"})   # (QuickNode's referrer whitelist)
            if r.status_code in (401, 403, 429) or r.status_code >= 500:
                raise requests.HTTPError(f"HTTP {r.status_code} from {url}")
            body = r.json()
            err = body.get("error") if isinstance(body, dict) else None
            if err and (err.get("code") in (-32007, -32005) or "limit" in str(err.get("message", "")).lower()):
                raise requests.HTTPError(f"rate limited by {url}")   # QuickNode's plan limit: the next RPC
            return body
        except (requests.RequestException, ValueError) as e:
            last = e
    raise last
TOKEN = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C"
CHAIN_ID = 4663
DECIMALS = 18
MIN_TOKENS = Decimal(os.environ.get("FLYBOOK_MIN_TOKENS", "1"))
MIN_WEI = max(1, int(MIN_TOKENS * 10**DECIMALS))
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")


def balance_of(wallet: str, timeout: float = 15) -> int:
    """No chain read any more (2026-10-14, the user: "remove the chain reading completely from flybook" - every owner's
    FLYAI balance, read every 5 min by the tick and on API calls, was a large share of the QuickNode plan): every wallet
    counts as a holder (MIN_WEI), so no fly goes dormant and every holder-only action is open to signed-in wallets."""
    if not ADDRESS.match(wallet):
        raise ValueError(f"not an address: {wallet!r}")
    return MIN_WEI


def is_holder(balance_wei: int) -> bool:
    return balance_wei >= MIN_WEI


def tokens(balance_wei: int) -> float:
    return balance_wei / 10**DECIMALS


TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"   # Transfer(address,address,uint256)
TX_HASH = re.compile(r"^0x[0-9a-fA-F]{64}$")


def rpc(method: str, params: list, timeout: float = 15):
    body = _post({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout)
    if "error" in body:
        raise RuntimeError(f"rpc error: {body['error']}")
    return body["result"]


def paid(tx_hash: str, sender: str, to: str) -> tuple[int, int] | None:
    """$FLYAI that `sender` sent to `to` in this transaction, in wei, and the block's unix time.
    None while the transaction isn't mined yet. Raises ValueError for a failed or unrelated transaction."""
    if not TX_HASH.match(tx_hash):
        raise ValueError("that isn't a transaction hash")
    receipt = rpc("eth_getTransactionReceipt", [tx_hash])
    if receipt is None:
        return None
    if int(receipt.get("status", "0x0"), 16) != 1:
        raise ValueError("that transaction failed on chain")
    sent = 0
    for log in receipt.get("logs") or []:
        topics = log.get("topics") or []
        if (log.get("address", "").lower() == TOKEN.lower() and len(topics) == 3 and topics[0].lower() == TRANSFER_TOPIC
                and "0x" + topics[1][-40:].lower() == sender.lower() and "0x" + topics[2][-40:].lower() == to.lower()):
            sent += int(log.get("data") or "0x0", 16)
    if not sent:
        raise ValueError("that transaction sends no $FLYAI from your wallet to Flybook")
    block = rpc("eth_getBlockByNumber", [receipt["blockNumber"], False])
    return sent, int(block["timestamp"], 16)
