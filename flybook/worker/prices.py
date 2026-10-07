"""Real prices for the fly market: an allowlist of Robinhood Chain tokens, priced in USD from their live pools.

The flies paper-trade these with paper USDG: nothing is bought or sold on chain. Picked 2026-09-18 (20 tokens), widened
2026-09-19 to 41 for more data to improve the encoders and trading on (stocks with ~$500k+ liquidity and daily trades,
memes with ~$1M liquidity and weeks of history). Picked from
Robinhood Chain's most traded pools on GeckoTerminal: the chain's ETH; its ecosystem and meme tokens with weeks of history, steady volume and $1M+ of liquidity ($FLYAI is ours and smaller); and
Robinhood's tokenized stocks and ETFs, only the official ones named "<company> • Robinhood Token" on chain.
Left out on purpose: WALLET (a scam token), TheGreenHood (0xdaa8…, a meme with the HOOD ticker), every SPCX/SpaceX
token (not an official Robinhood token, many copycats), thin stock tokens (TSM, DELL, NFLX and others under ~$500k),
and memes launched within the last week with large liquidity but thin volume (musebook, GOOSE, STANDARD).
USDG, the chain's main dollar and the same dollar the flies' cash is held in, is on the list as a place to park: it barely
moves, so when most tokens fall it is often the only one that looks like it's rising, and a fly turns toward it.

Prices: DexScreener (each token's most liquid pair, one call for all tokens), with GeckoTerminal's token prices
filling any gap (GeckoTerminal alone froze thinly traded tokens for hours). A token neither answers keeps its last price for that round; the round is skipped if none answer.
"""
from __future__ import annotations

import time

import requests

# symbol, name, address (Robinhood Chain, chain id 4663), category
TOKENS = [
    ("ETH", "Ether", "0x0bd7d308f8e1639fab988df18a8011f41eacad73", "major"),          # WETH
    ("FLYAI", "fly.ai", "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c", "meme"),
    ("PONS", "Pons", "0x39dbed3a2bd333467115de45665cc57f813c4571", "meme"),
    # GIGA DEX's token (2026-10-07, the user: "have that GIGA visible in the traders in general"; only GIGA DEX pools,
    # onchain "giga" routes). "major": the chain's DEX token, kept out of the meme pool floor (its main pool ~$126k)
    ("GIGA", "GIGA DEX", "0x5baaec1b70864f01dbdb747358ff59f2e2ccf7d5", "major"),
    ("AI", "Artificial Inu", "0x2e8c31162b855a2ffa90f6f8634643ad6f111e18", "meme"),
    ("MEME", "A Meme Coin", "0x385f4f8ae47651ce5f58f5265395a669f8281e18", "meme"),
    ("CASHCAT", "Cash Cat", "0x020bfc650a365f8bb26819deaabf3e21291018b4", "meme"),
    ("BLORB", "BLORB", "0x4d14284afe559b7c6b9e6fad6ebaeaa0f6051818", "meme"),
    ("NVDA", "NVIDIA", "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", "stock"),
    ("TSLA", "Tesla", "0x322f0929c4625ed5bad873c95208d54e1c003b2d", "stock"),
    ("AAPL", "Apple", "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", "stock"),
    ("MSFT", "Microsoft", "0xe93237c50d904957cf27e7b1133b510c669c2e74", "stock"),
    ("AMZN", "Amazon", "0x12f190a9f9d7d37a250758b26824b97ce941bf54", "stock"),
    ("GOOGL", "Alphabet", "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", "stock"),
    ("META", "Meta Platforms", "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", "stock"),
    ("MSTR", "Strategy", "0xec262a75e413fafd0df80480274532c79d42da09", "stock"),
    ("CRCL", "Circle", "0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5", "stock"),
    ("SPY", "S&P 500 ETF", "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", "stock"),
    ("QQQ", "Nasdaq-100 ETF", "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", "stock"),
    ("GLD", "Gold ETF", "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e", "stock"),
    # added 2026-09-19
    ("COIN", "Coinbase", "0x6330d8c3178a418788df01a47479c0ce7ccf450b", "stock"),
    ("PLTR", "Palantir", "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", "stock"),
    ("AMD", "AMD", "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", "stock"),
    ("INTC", "Intel", "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681", "stock"),
    ("MU", "Micron", "0xff080c8ce2e5feadaca0da81314ae59d232d4afd", "stock"),
    ("SNDK", "Sandisk", "0xb90a19ff0af67f7779aff50a882a9cff42446400", "stock"),
    ("AMC", "AMC Entertainment", "0x05a3d1cd21d0c88145e82600e62e7e496e0f222b", "stock"),
    ("GME", "GameStop", "0x1b0e319c6a659f002271b69db8a7df2f911c153e", "stock"),
    ("HIMS", "Hims & Hers", "0xccee82fe024c36fa15e1005ede3e9e4787e23d09", "stock"),
    ("RDDT", "Reddit", "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c", "stock"),
    ("DJT", "Trump Media", "0x1d11f0496982706c5e14a514d4e79f2e6bde4516", "stock"),
    ("LLY", "Eli Lilly", "0x8005d266423c7ea827372c9c864491e5786600ea", "stock"),
    ("COST", "Costco", "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", "stock"),
    ("RBLX", "Roblox", "0xf0c4bf4c582cb3836e98394b1d4e7b7281101be8", "stock"),
    ("TTWO", "Take-Two", "0x5e81213613b6b86eab4c6c50d718d34359459786", "stock"),
    ("GLXY", "Galaxy Digital", "0x2d427692e928fa156ec22acfabafa0447c5805b7", "stock"),
    ("USO", "Oil Fund ETF", "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344", "stock"),
    ("SLV", "Silver ETF", "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f", "stock"),
    ("SGOV", "0-3 Month Treasury ETF", "0x92fd66527192e3e61d4ddd13322aa222de86f9b5", "stock"),
    ("SHROOM", "MUSHROOM", "0xab093def657f15df31b33922a95e047add645b29", "meme"),
    ("HOOKR", "Hookr.fun", "0x18e674231a58c239dc7daedcffe15ec3a24cff5c", "meme"),
    ("USDG", "Global Dollar", "0x5fc5360d0400a0fd4f2af552add042d716f1d168", "stable"),   # the chain's main dollar
]
BY_SYMBOL = {t[0]: t for t in TOKENS}
BY_ADDRESS = {t[2]: t[0] for t in TOKENS}
GECKO = "https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/multi/"
DEXSCREENER = "https://api.dexscreener.com/tokens/v1/robinhood/"
BATCH = 30                      # both APIs take at most 30 addresses per call


def _batches(addresses: list[str]) -> list[list[str]]:
    return [addresses[i:i + BATCH] for i in range(0, len(addresses), BATCH)]


# GeckoTerminal only for what DexScreener left out, kept GECKO_TTL, and left alone GECKO_BACKOFF after it says 429
# (2026-10-04: every bar asked it for ALL ~60 tokens because DexScreener always misses one or two - in each of the
# desk's processes - and it answered 429 Too Many Requests about every other bar)
GECKO_TTL = 300.0
GECKO_BACKOFF = 600.0
GECKO_KEEP = 1800.0             # a cached price fills a gap this long while GeckoTerminal is backed off
_gecko_cache: dict[str, tuple[float, float]] = {}   # symbol -> (price, when)
_gecko_quiet_until = 0.0


def _gecko(timeout: float, symbols: list[str] | None = None) -> dict[str, float]:
    """Prices for `symbols` (all when None): fresh cache entries first, the rest asked in batches; after a 429 the
    cache answers alone (up to GECKO_KEEP old) until GECKO_BACKOFF has passed."""
    global _gecko_quiet_until
    now = time.time()
    want = list(BY_SYMBOL) if symbols is None else [s for s in symbols if s in BY_SYMBOL]
    out = {s: p for s in want if (c := _gecko_cache.get(s)) and now - c[1] < GECKO_TTL for p in (c[0],)}
    ask = [BY_SYMBOL[s][2] for s in want if s not in out]
    if ask and now < _gecko_quiet_until:
        out.update({s: c[0] for s in want if s not in out and (c := _gecko_cache.get(s)) and now - c[1] < GECKO_KEEP})
        return out
    for batch in _batches(ask):
        r = requests.get(GECKO + ",".join(batch), timeout=timeout, headers={"accept": "application/json"})
        if r.status_code == 429:
            _gecko_quiet_until = now + GECKO_BACKOFF
            out.update({s: c[0] for s in want if s not in out and (c := _gecko_cache.get(s)) and now - c[1] < GECKO_KEEP})
            print(f"prices: GeckoTerminal 429, quiet for {GECKO_BACKOFF:.0f} s (cached prices fill the gaps)", flush=True)
            return out
        r.raise_for_status()
        for t in r.json().get("data", []):
            a = t.get("attributes") or {}
            symbol = BY_ADDRESS.get((a.get("address") or "").lower())
            if symbol and a.get("price_usd"):
                out[symbol] = float(a["price_usd"])
                _gecko_cache[symbol] = (out[symbol], now)
    return out


def _dexscreener(addresses: list[str], timeout: float) -> dict[str, float]:
    pairs = []
    for batch in _batches(addresses):
        r = requests.get(DEXSCREENER + ",".join(batch), timeout=timeout, headers={"accept": "application/json"})
        r.raise_for_status()
        pairs += r.json() or []
    best: dict[str, tuple[float, float]] = {}                  # symbol -> (liquidity, price)
    for p in pairs:
        symbol = BY_ADDRESS.get(((p.get("baseToken") or {}).get("address") or "").lower())
        if not symbol or not p.get("priceUsd"):
            continue
        liquidity = float((p.get("liquidity") or {}).get("usd") or 0)
        if symbol not in best or liquidity > best[symbol][0]:
            best[symbol] = (liquidity, float(p["priceUsd"]))
    return {s: price for s, (_, price) in best.items()}


def fetch(timeout: float = 12) -> dict[str, float]:
    """USD price of every allowlisted token that either source answers for. Never raises; {} if both fail.
    DexScreener first (its most liquid pair, live); GeckoTerminal fills gaps. GeckoTerminal was the first source
    until 2026-09-18, when its prices for thinly traded tokens (FLYAI, BLORB) turned out to be frozen for hours."""
    prices: dict[str, float] = {}
    try:
        prices.update(_dexscreener([t[2] for t in TOKENS], timeout))
    except Exception as e:
        print(f"prices: DexScreener failed ({type(e).__name__}: {e})", flush=True)
    missing = [t[0] for t in TOKENS if t[0] not in prices]
    if missing:
        try:
            for s, p in _gecko(timeout, missing).items():
                prices.setdefault(s, p)
        except Exception as e:
            print(f"prices: GeckoTerminal failed ({type(e).__name__}: {e})", flush=True)
    return {s: p for s, p in prices.items() if p > 0}


if __name__ == "__main__":
    got = fetch()
    for symbol, name, _, category in TOKENS:
        print(f"{symbol:7} {category:6} {name:28} {got.get(symbol, 'n/a')}")
