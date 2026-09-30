#!/usr/bin/env python3
"""fly.ai's pay-per-request API from the command line: each call is paid on its own over x402.

    python flyai_x402.py products                          what is sold and what each costs (free)

    python flyai_x402.py market <link | id | slug>         the desk model's read of one Polymarket market
    python flyai_x402.py picks [--limit 10]                open markets where the model and the price disagree most
    python flyai_x402.py record                            the model's record against the market (free)

    python flyai_x402.py forecast <symbol | address> [--horizon 8]     a token the desk tracks, 15-minute bars
    python flyai_x402.py forecast-series <file.json | -> [--step 3600] [--horizon 8]
                                                           your own numbers: a JSON list, oldest first
    python flyai_x402.py forecast-record                   how the forecasts have scored (free)

    python flyai_x402.py cost <symbol | address> [--usd 100]   real round-trip cost on Robinhood Chain, best pool
    python flyai_x402.py token <address>                   facts about a Robinhood Chain token

    python flyai_x402.py brain --sense threat              run the real fly connectome on one sense
    python flyai_x402.py brain "someone brought pizza"     ...or on a message (mapped to a sense)
    python flyai_x402.py senses                            the senses (free)

    python flyai_x402.py meme "monday meetings" [--style classic] [--top TEXT] [--bottom TEXT] [--out meme.webp]
    python flyai_x402.py styles                            the meme styles (free)

A paid command first prints what it would cost and stops. Add --yes to pay. Paying needs a wallet key in the
environment variable FLYAI_X402_KEY (set by the person, never passed as an argument) holding a little USDG on
Robinhood Chain, or USDC on Base with --network base. The payment is a signed authorization (EIP-3009): no gas is
needed, and nothing can be taken beyond the amount shown. A request that can't be answered is not charged.

Needs: pip install requests eth-account
Notes for the person go to stderr; one JSON document for the caller goes to stdout.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import sys
import time
from urllib.parse import quote, urlencode

import requests

API = os.environ.get("FLYAI_X402_URL", "https://flyai-x402.fly.dev").rstrip("/")
NETWORKS = {"robinhood": "eip155:4663", "base": "eip155:8453"}
TOKEN = {"eip155:4663": "USDG", "eip155:8453": "USDC"}
FREE = {"products": "/", "record": "/record", "forecast-record": "/forecast/record", "senses": "/brain/senses",
        "styles": "/meme/styles"}


def note(text: str) -> None:
    print(text, file=sys.stderr, flush=True)


def out(doc) -> None:
    print(json.dumps(doc, ensure_ascii=False, indent=1))


def challenge_of(res: requests.Response) -> dict:
    """The payment terms of a 402: the PAYMENT-REQUIRED header (x402 v2), else the body."""
    head = res.headers.get("PAYMENT-REQUIRED")
    if head:
        return json.loads(base64.b64decode(head))
    return res.json()


def sign(accept: dict, key: str) -> str:
    """The payment header for one `accepts` entry: an EIP-3009 TransferWithAuthorization signed with `key`."""
    from eth_account import Account
    acct = Account.from_key(key)
    now = int(time.time())
    auth = {"from": acct.address, "to": accept["payTo"], "value": str(accept["amount"]),
            "validAfter": str(now - 600), "validBefore": str(now + int(accept.get("maxTimeoutSeconds") or 60) + 600),
            "nonce": "0x" + secrets.token_hex(32)}
    extra = accept.get("extra") or {}
    typed = {
        "types": {
            "EIP712Domain": [{"name": "name", "type": "string"}, {"name": "version", "type": "string"},
                             {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}],
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"}, {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"}],
        },
        "primaryType": "TransferWithAuthorization",
        "domain": {"name": extra["name"], "version": extra["version"],
                   "chainId": int(accept["network"].split(":")[1]), "verifyingContract": accept["asset"]},
        "message": {**auth, "value": int(auth["value"]), "validAfter": int(auth["validAfter"]),
                    "validBefore": int(auth["validBefore"]), "nonce": bytes.fromhex(auth["nonce"][2:])},
    }
    sig = acct.sign_typed_data(full_message=typed).signature.hex()
    envelope = {"x402Version": 2, "accepted": accept,
                "payload": {"signature": sig if sig.startswith("0x") else "0x" + sig, "authorization": auth}}
    return base64.b64encode(json.dumps(envelope).encode()).decode()


def call(path: str, body, headers: dict | None = None, timeout: float = 60) -> requests.Response:
    if body is None:
        return requests.get(API + path, headers=headers, timeout=timeout)
    return requests.post(API + path, json=body, headers=headers, timeout=timeout)


def paid(path: str, args, body=None) -> dict | None:
    """The answer of a paid endpoint, or None when it only showed the cost (no --yes)."""
    res = call(path, body)
    if res.status_code != 402:                       # an error that costs nothing (400, 404, 409, 503)
        return finish(res)
    terms = challenge_of(res)
    want = NETWORKS[args.network]
    accept = next((a for a in terms.get("accepts", []) if a.get("network") == want and a.get("scheme") == "exact"), None)
    if not accept:
        sys.exit(f"the service doesn't take {args.network}; it offers: {[a.get('network') for a in terms.get('accepts', [])]}")
    cost = int(accept["amount"]) / 1e6                # USDG and USDC both have 6 decimals
    quote_ = {"cost": cost, "token": TOKEN[want], "network": args.network, "pay_to": accept["payTo"], "for": API + path}
    if cost > args.max_price:
        sys.exit(f"it costs ${cost:g}, above --max-price ${args.max_price:g}: not paying")
    if not args.yes:
        note(f"This request costs ${cost:g} in {TOKEN[want]} on {args.network}. Run it again with --yes to pay.")
        out({"needs_payment": quote_})
        return None
    key = os.environ.get("FLYAI_X402_KEY")
    if not key:
        sys.exit("set FLYAI_X402_KEY (a wallet key holding a little " + TOKEN[want] + ") in your environment first")
    header = sign(accept, key)
    note(f"paying ${cost:g} in {TOKEN[want]} on {args.network}...")
    return finish(call(path, body, {"PAYMENT-SIGNATURE": header, "X-PAYMENT": header}, timeout=240), paying=True)


def finish(res: requests.Response, paying: bool = False) -> dict:
    try:
        doc = res.json()
    except ValueError:
        doc = {"error": res.text[:300]}
    if res.status_code != 200:
        note(f"HTTP {res.status_code}" + (": the payment was not taken" if paying and res.status_code in (400, 402, 404, 409, 503) else ""))
        out({"status": res.status_code, **(doc if isinstance(doc, dict) else {"body": doc})})
        sys.exit(1)
    return doc


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=[*FREE, "market", "picks", "forecast", "forecast-series", "cost", "token", "brain", "meme"])
    p.add_argument("ref", nargs="*", help="what the command is about (a link, symbol, address, file, message or idea)")
    p.add_argument("--limit", type=int, default=10)
    p.add_argument("--horizon", type=int, default=8)
    p.add_argument("--step", type=int, default=3600, help="forecast-series: seconds between two numbers")
    p.add_argument("--usd", type=float, default=100.0)
    p.add_argument("--sense")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--style", default="classic")
    p.add_argument("--top", default="")
    p.add_argument("--bottom", default="")
    p.add_argument("--out", default="fly-meme.webp", help="meme: where the image is saved")
    p.add_argument("--network", choices=list(NETWORKS), default="robinhood")
    p.add_argument("--max-price", type=float, default=0.5, help="never pay more than this many dollars for one request")
    p.add_argument("--yes", action="store_true", help="pay (without it the cost is shown and nothing is paid)")
    args = p.parse_args()
    cmd, ref = args.command, " ".join(args.ref).strip()
    need = lambda what: ref or sys.exit(f"{cmd} needs {what}")

    if cmd in FREE:
        out(finish(requests.get(API + FREE[cmd], timeout=60)))
        return
    body = None
    if cmd == "picks":
        path = f"/picks?limit={max(1, min(25, args.limit))}"
    elif cmd == "market":
        need("a polymarket.com link, a market id or a slug")
        path = "/market?url=" + quote(ref, safe="") if "polymarket.com" in ref else "/market/" + quote(ref, safe="")
    elif cmd == "forecast":
        need("a symbol the desk tracks, or a Robinhood Chain token address")
        path = f"/forecast/{quote(ref, safe=':')}?horizon={args.horizon}"
    elif cmd == "forecast-series":
        need("a JSON file with a list of numbers (or - for stdin)")
        raw = sys.stdin.read() if ref == "-" else open(ref, encoding="utf-8").read()
        path, body = "/forecast", {"series": json.loads(raw), "step_seconds": args.step, "horizon": args.horizon}
    elif cmd == "cost":
        need("a symbol or a token address")
        path = f"/cost/{quote(ref, safe=':')}?usd={args.usd:g}"
    elif cmd == "token":
        need("a token's contract address")
        path = "/token/" + quote(ref, safe="")
    elif cmd == "brain":
        if not (args.sense or ref):
            sys.exit("brain needs --sense or a message")
        path = "/brain?" + urlencode({k: v for k, v in {"sense": args.sense, "message": ref, "seed": args.seed}.items() if v not in (None, "")})
    else:
        need("an idea for the meme")
        path = "/meme?" + urlencode({k: v for k, v in {"idea": ref, "style": args.style, "top": args.top, "bottom": args.bottom}.items() if v})
    doc = paid(path, args, body)
    if doc is None:
        return
    if cmd == "meme" and doc.get("image_webp_base64"):
        with open(args.out, "wb") as f:
            f.write(base64.b64decode(doc.pop("image_webp_base64")))
        doc["saved_to"] = os.path.abspath(args.out)
        note(f"saved {args.out}")
    out(doc)


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as e:             # the service can't be reached: nothing was paid
        note(f"couldn't reach {API}: {type(e).__name__}")
        out({"error": "unreachable", "service": API})
        sys.exit(1)
