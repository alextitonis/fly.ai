"""
Hermes Token Screener Dashboard — FastAPI with static HTML.

Serves live token/wallet data from SQLite + top100.json.
TradingView Lightweight Charts for token price charts.
"""

from __future__ import annotations

import json
import sqlite3
import sys
import time
import html
from typing import Any

import httpx
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse

from hermes_screener.config import settings

sys.path.insert(0, str(settings.hermes_home / "scripts"))
from token_lifecycle import _build_synthetic_candles as _tl_build_candles

app = FastAPI(
    title="Hermes Token Screener",
    description="Multi-source token screening & smart money tracking",
    version="9.0.0",
)


# ═══════════════════════════════════════════════════════════════════════════════
# DATA ACCESS
# ═══════════════════════════════════════════════════════════════════════════════


def _normalize_token(t: dict[str, Any]) -> dict[str, Any]:
    """Normalize token data: flatten nested dex.* fields to flat top-level fields.

    The enricher stores market data inside a nested 'dex' dict, but the dashboard
    templates expect flat fields like fdv, volume_h24, price_change_h1, etc.
    """
    dex = t.get("dex") or {}

    # Flatten dex fields → top-level (only if not already set)
    if not t.get("symbol"):
        t["symbol"] = dex.get("symbol")
    if not t.get("name"):
        t["name"] = dex.get("name")
    if not t.get("fdv"):
        t["fdv"] = dex.get("fdv") or dex.get("market_cap")
    if not t.get("volume_h24"):
        t["volume_h24"] = dex.get("volume_h24")
    if not t.get("volume_h1"):
        t["volume_h1"] = dex.get("volume_h1")
    if "price_change_h1" not in t:
        t["price_change_h1"] = dex.get("price_change_h1")
    if "price_change_h6" not in t:
        t["price_change_h6"] = dex.get("price_change_h6")
    if "price_change_h24" not in t:
        t["price_change_h24"] = dex.get("price_change_h24")
    if not t.get("price_usd"):
        t["price_usd"] = dex.get("price_usd")
    if not t.get("pair_address"):
        t["pair_address"] = dex.get("pair_address")
    if not t.get("dex_url"):
        pair = t.get("pair_address") or dex.get("pair_address")
        chain = t.get("chain", "")
        if chain == "solana" and pair:
            t["dex_url"] = f"https://dexscreener.com/solana/{pair}"
        elif chain == "base" and pair:
            t["dex_url"] = f"https://dexscreener.com/base/{pair}"
        elif chain in ("bsc", "binance-smart-chain") and pair:
            t["dex_url"] = f"https://dexscreener.com/bsc/{pair}"
        elif pair:
            t["dex_url"] = f"https://dexscreener.com/ethereum/{pair}"
    if not t.get("liquidity_usd"):
        t["liquidity_usd"] = dex.get("liquidity_usd") or dex.get("liquidity")
    if not t.get("twitter_url"):
        t["twitter_url"] = dex.get("twitter_url")
    if not t.get("telegram_url"):
        t["telegram_url"] = dex.get("telegram_url")

    # Compute age_hours from first_seen_at if not set
    if not t.get("age_hours"):
        fse = t.get("first_seen_at")
        if fse:
            t["age_hours"] = max(0, (time.time() - float(fse)) / 3600)
        else:
            age_dex = dex.get("age_hours")
            t["age_hours"] = age_dex if age_dex else 0

    # gmgn_smart_wallets ← gmgn_holder_count
    if not t.get("gmgn_smart_wallets"):
        t["gmgn_smart_wallets"] = t.get("gmgn_holder_count", 0) or 0

    # Brain score: composite from social/momentum fields available in top100
    # Fields available: social_score, tw_kol_score, tg_viral_score, mentions,
    #   social_momentum, social_quality, channel_count, mention_velocity
    social = t.get("social_score") or 0
    kol = t.get("tw_kol_score") or 0
    viral = t.get("tg_viral_score") or 0
    mentions = t.get("mentions") or 0
    mom_str = str(t.get("social_momentum") or "")
    momentum_map = {"very_high": 1.0, "high": 0.85, "medium": 0.5, "low": 0.2, "very_low": 0.1, "none": 0.0, "": 0.0}
    momentum = momentum_map.get(mom_str.lower(), 0.0)
    ch_count = t.get("channel_count") or 0
    vel = t.get("mention_velocity") or 0
    t["brain_score"] = round(
        social * 0.2 + kol * 0.2 + viral * 0.15 + mentions * 0.1
        + momentum * 0.15 + ch_count * 0.1 + vel * 0.1,
        1,
    )

    # Back-fill gmgn fields from flat enricher fields
    if not t.get("gmgn_symbol"):
        t["gmgn_symbol"] = t.get("symbol")
    if not t.get("gmgn_liquidity"):
        t["gmgn_liquidity"] = dex.get("liquidity")
    if not t.get("gmgn_burn_status"):
        t["gmgn_burn_status"] = t.get("gmgn_burn_status", "")

    return t


def _dedupe_tokens(tokens: list[dict]) -> list[dict]:
    """Deduplicate tokens by contract_address, keeping first occurrence."""
    seen = set()
    unique = []
    for t in tokens:
        addr = (t.get("contract_address") or "").lower()
        if addr and addr not in seen:
            seen.add(addr)
            unique.append(t)
    return unique


def _dedupe_active_tokens(tokens: list[dict]) -> list[dict]:
    """Deduplicate active tokens by token_address, keeping first occurrence."""
    seen = set()
    unique = []
    for t in tokens:
        addr = (t.get("token_address") or "").lower()
        if addr and addr not in seen:
            seen.add(addr)
            unique.append(t)
    return unique


def _load_top100() -> dict[str, Any]:
    path = settings.output_path
    if not path.exists():
        return {"tokens": [], "generated_at_iso": "Never", "total_candidates": 0}
    with open(path) as f:
        data = json.load(f)
    # Normalize: support both "tokens" and "top_tokens" keys
    if "tokens" not in data and "top_tokens" in data:
        data["tokens"] = data["top_tokens"]
    # Normalize total_tokens → total_candidates for dashboard compatibility
    if "total_candidates" not in data and "total_tokens" in data:
        data["total_candidates"] = data["total_tokens"]
    if "total_candidates" not in data and "top_n" in data:
        data["total_candidates"] = data["top_n"]
    # Normalize all tokens: flatten dex.* to flat fields
    if "tokens" in data:
        data["tokens"] = [_normalize_token(t) for t in data["tokens"]]
    # Deduplicate by contract address
    data["tokens"] = _dedupe_tokens(data.get("tokens", []))
    return data


def _get_wallet_db():
    try:
        conn = sqlite3.connect(f"file:{settings.wallets_db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception:
        return None


def _fmt_usd(v):
    if v is None:
        return "—"
    v = float(v)
    if v >= 1e9:
        return f"${v/1e9:.1f}B"
    if v >= 1e6:
        return f"${v/1e6:.1f}M"
    if v >= 1e3:
        return f"${v/1e3:.1f}K"
    return f"${v:,.0f}"


def _fmt_pct(v):
    if v is None:
        return "—"
    return f"{'+' if v > 0 else ''}{v:.1f}%"



def _fmt_tags(tags_str: str) -> str:
    """Render comma-separated wallet tags as colored HTML spans."""
    if not tags_str:
        return "—"
    html = ""
    for t in tags_str.split(","):
        t = t.strip()
        if not t:
            continue
        cls = "tag-r" if t in ("sniper", "insider") else "tag-g" if t in ("smart", "kol") else ""
        html += f'<span class="tag {cls}">{t}</span>'
    return html or "—"
def _pct_cls(v):
    if v is None:
        return ""
    return "pos" if v > 0 else "neg" if v < 0 else ""


def _score_cls(score):
    score = score or 0
    return "sc-h" if score >= 70 else "sc-m" if score >= 40 else "sc-l"


def _time_ago(ts):
    if not ts:
        return "—"
    d = time.time() - float(ts)
    if d < 60:
        return f"{int(d)}s"
    if d < 3600:
        return f"{int(d/60)}m"
    if d < 86400:
        return f"{int(d/3600)}h"
    return f"{int(d/86400)}d"


def _trunc(a, n=8):
    if not a or len(a) <= n * 2:
        return a or ""
    return f"{a[:n]}...{a[-n:]}"


def _explorer(chain, addr):
    if chain in ("solana", "sol"):
        return f"https://solscan.io/account/{addr}"
    if chain == "base":
        return f"https://basescan.org/address/{addr}"
    if chain in ("bsc", "binance-smart-chain"):
        return f"https://bscscan.com/address/{addr}"
    return f"https://etherscan.io/address/{addr}"


def _wallet_link(addr):
    """All wallet links go to Zerion portfolio view."""
    return f"https://app.zerion.io/{addr}/overview"


def _dexscreener_url(chain, addr):
    c = (chain or "").lower()
    if c in ("solana", "sol"):
        return f"https://dexscreener.com/solana/{addr}"
    if c == "base":
        return f"https://dexscreener.com/base/{addr}"
    if c in ("bsc", "binance-smart-chain"):
        return f"https://dexscreener.com/bsc/{addr}"
    return f"https://dexscreener.com/ethereum/{addr}"


def _chain_cls(chain):
    return f"chain-{chain}" if chain in ("solana", "sol", "base", "ethereum", "bsc") else ""


def _is_wsol(token_or_addr: dict | str = "", symbol: str = "") -> bool:
    if isinstance(token_or_addr, dict):
        sym = (token_or_addr.get("symbol") or token_or_addr.get("token_symbol") or "").upper()
        addr = (token_or_addr.get("contract_address") or token_or_addr.get("token_address") or "").lower()
    else:
        sym = (symbol or "").upper()
        addr = (token_or_addr or "").lower()
    return sym == "WSOL" or addr == "so11111111111111111111111111111111111111112"


# ═══════════════════════════════════════════════════════════════════════════════
# HTML RENDERING
# ═══════════════════════════════════════════════════════════════════════════════

CSS = """
:root{--bg:#0a0e17;--s:#111827;--s2:#1f2937;--b:#374151;--t:#e5e7eb;--t2:#9ca3af;
--g:#10b981;--r:#ef4444;--y:#f59e0b;--bl:#3b82f6;--p:#8b5cf6;--c:#06b6d4}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'SF Mono','Fira Code',monospace;background:var(--bg);color:var(--t)}
a{color:var(--c);text-decoration:none}a:hover{text-decoration:underline}
nav{background:var(--s);border-bottom:1px solid var(--b);padding:.75rem 1.5rem;display:flex;align-items:center;gap:2rem}
.logo{font-size:1.1rem;font-weight:bold;color:var(--c)}.logo span{color:var(--y)}
.nav{display:flex;gap:1.5rem}.nav a{color:var(--t2);font-size:.85rem}.nav a.active{color:var(--c)}
.stats{background:var(--s);border-bottom:1px solid var(--b);padding:.5rem 1.5rem;display:flex;gap:2rem;font-size:.8rem;color:var(--t2);flex-wrap:wrap}
.stats .v{color:var(--t);font-weight:bold}
.wrap{max-width:1400px;margin:0 auto;padding:1.5rem}
h1{font-size:1.3rem;margin-bottom:.25rem}.sub{color:var(--t2);font-size:.8rem;margin-bottom:1rem}
.tbl{overflow-x:auto;border:1px solid var(--b);border-radius:8px}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th{background:var(--s2);color:var(--t2);text-align:left;padding:.6rem .75rem;font-weight:600;position:sticky;top:0;white-space:nowrap}
td{padding:.5rem .75rem;border-top:1px solid var(--b);white-space:nowrap}
tr:hover td{background:var(--s2)}
.sc{font-weight:bold}.sc-h{color:var(--g)}.sc-m{color:var(--y)}.sc-l{color:var(--t2)}
.pos{color:var(--g)}.neg{color:var(--r)}
.badge{display:inline-block;padding:.1rem .4rem;border-radius:4px;font-size:.7rem;font-weight:bold}
.chain-solana,.chain-sol{background:#9945ff22;color:#9945ff}
.chain-base{background:#0052ff22;color:#0052ff}
.chain-ethereum{background:#627eea22;color:#627eea}
.chain-bsc{background:#f3ba2f22;color:#f3ba2f}
.tag{display:inline-block;padding:.1rem .35rem;border-radius:3px;font-size:.65rem;margin:.1rem}
.tag-g{background:#10b98133;color:#10b981}.tag-y{background:#f59e0b33;color:#f59e0b}.tag-r{background:#ef444433;color:#ef4444}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;margin-top:1rem}
.card{background:var(--s);border:1px solid var(--b);border-radius:8px;padding:1rem}
.card h3{font-size:.9rem;color:var(--c);margin-bottom:.75rem}
.row{display:flex;justify-content:space-between;padding:.3rem 0;font-size:.82rem}
.row .l{color:var(--t2)}
.mono{font-family:inherit;font-size:.72rem}
@media(max-width:768px){.stats{gap:.5rem}nav{flex-wrap:wrap}}
.trending{background:linear-gradient(90deg,#0a0e17,#111827);border-bottom:1px solid var(--b);padding:.6rem 1.5rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;font-size:.78rem}
.trending .label{color:var(--y);font-weight:bold;white-space:nowrap}
.trending .kw{display:inline-block;padding:.2rem .5rem;border-radius:4px;background:#06b6d422;color:var(--c);cursor:default;transition:all .2s}
.trending .kw:hover{background:#06b6d444}
.trending .kw .ct{font-size:.65rem;color:var(--t2);margin-left:.3rem}
.trending .sep{color:var(--b)}
"""

CHART_CSS = """
#chart-container{width:100%;height:500px;background:var(--bg);border:1px solid var(--b);border-radius:8px;position:relative}
#chart-container .loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--t2)}
.controls{display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center}
.controls button{background:var(--s2);color:var(--t);border:1px solid var(--b);padding:.35rem .75rem;border-radius:4px;cursor:pointer;font-family:inherit;font-size:.8rem}
.controls button:hover,.controls button.active{background:var(--c);color:#000;border-color:var(--c)}
.controls select{background:var(--s2);color:var(--t);border:1px solid var(--b);padding:.35rem .5rem;border-radius:4px;font-family:inherit;font-size:.8rem}
.price-info{display:flex;gap:1.5rem;margin-bottom:1rem;flex-wrap:wrap}
.price-info .item{font-size:.82rem}.price-info .item .label{color:var(--t2)}
.price-info .item .val{font-weight:bold;font-size:1rem}
.chart-footer{margin-top:.75rem;font-size:.72rem;color:var(--t2)}
"""


def _nav(active):
    return f"""<nav>
<div class="logo">HERMES <span>&#9670;</span> SCREENER</div>
<div class="nav">
  <a href="/" class="{'active' if active=='tokens' else ''}">Tokens</a>
  <a href="/wallets" class="{'active' if active=='wallets' else ''}">Smart Money</a>
  <a href="/cross/tokens" class="{'active' if active=='cross-tokens' else ''}">Tokens x Wallets</a>
  <a href="/cross/wallets" class="{'active' if active=='cross-wallets' else ''}">Wallets x Tokens</a>
  <a href="/active/tokens" class="{'active' if active=='active-tokens' else ''}">Active Tokens</a>
  <a href="/active/wallets" class="{'active' if active=='active-wallets' else ''}">Active Wallets</a>
  <a href="/api/top100" target="_blank">API</a>
  <a href="/health" target="_blank">Health</a>
  <a href="/trading_log">Trading Log</a>
</div></nav>"""


def _page(title, active, body, extra_css=""):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — Hermes</title><style>{CSS}{extra_css}</style></head>
<body>{_nav(active)}<div class="wrap">{body}</div>
<script>setTimeout(()=>location.reload(),30000)</script></body></html>"""


# ═══════════════════════════════════════════════════════════════════════════════
# CHART PAGE
# ═══════════════════════════════════════════════════════════════════════════════


def _dexscreener_embed_html(symbol, chain, address, dex_url, pair_address, fdv, vol24):
    """Generate chart page with embedded Dexscreener chart (replaces Dexscreener)."""
    # Use Dexscreener embed URL — works without API auth or TLS fingerprint
    dex_chain = "bsc" if chain in ("bsc", "binance-smart-chain") else chain
    embed_url = f"https://dexscreener.com/{dex_chain}/{address}?embed=1&theme=dark&info=0"
    detail_url = f"/token/{address}"
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{symbol} Chart — Hermes</title><style>{CSS}</style>
</head>
<body>
{_nav("tokens")}
<div class="wrap">
  <h1>{symbol} <span style="color:var(--t2);font-weight:normal">Chart</span></h1>
  <div class="sub">
    <span class="badge {_chain_cls(chain)}">{chain}</span>
    <a href="{detail_url}">&larr; Token Detail</a>
    &middot; <a href="{dex_url}" target="_blank">Dexscreener &nearr;</a>
  </div>

  <div class="price-info" style="display:flex;gap:1.5rem;margin-bottom:1rem;flex-wrap:wrap">
    <div class="item" style="font-size:.82rem"><span style="color:var(--t2)">FDV</span><br><span style="font-weight:bold;font-size:1rem">{_fmt_usd(fdv)}</span></div>
    <div class="item" style="font-size:.82rem"><span style="color:var(--t2)">Vol 24h</span><br><span style="font-weight:bold;font-size:1rem">{_fmt_usd(vol24)}</span></div>
  </div>

  <div style="width:100%;border:1px solid var(--b);border-radius:8px;overflow:hidden">
    <iframe
      src="{embed_url}"
      style="width:100%;height:600px;border:none;background:#0a0e17">
    </iframe>
  </div>
  <div style="margin-top:.75rem;font-size:.72rem;color:var(--t2)">
    Powered by Dexscreener &middot; Auto-updates in real-time
  </div>
</div>
</body></html>"""


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/", response_class=HTMLResponse)
async def index():
    data = _load_top100()
    tokens = data.get("tokens", [])

    # Load trending keywords
    tk_path = settings.output_path.parent / "trending_keywords.json"
    trending_html = ""
    if tk_path.exists():
        try:
            tk_data = json.loads(tk_path.read_text())
            kws = tk_data.get("keywords", [])[:12]
            if kws:
                kw_items = "".join(
                    f'<span class="kw">{kw["keyword"]}<span class="ct">{kw["count"]}</span></span>' for kw in kws
                )
                trending_html = f'<div class="trending"><span class="label">&#128293; TRENDING</span>{kw_items}</div>'
        except Exception:
            pass

    rows = ""
    for i, t in enumerate(tokens, 1):
        score = t.get("score", 0) or 0
        sc_cls = _score_cls(score)
        p1h = _pct_cls(t.get("price_change_h1"))
        p6h = _pct_cls(t.get("price_change_h6"))
        tags = "".join(f'<span class="tag tag-g">{p}</span>' for p in (t.get("positives") or [])[:2])
        addr = t.get("contract_address", "")
        rows += f"""<tr>
  <td>{i}</td>
  <td><a href="{t.get('dex_url', '/token/' + addr)}" target="_blank"><strong>{t.get('symbol','???')}</strong></a></td>
  <td><span class="badge {_chain_cls(t.get('chain',''))}">{t.get('chain','')}</span></td>
  <td class="mono"><a href="{_explorer(t.get('chain',''), addr)}" target="_blank">{_trunc(addr)}</a></td>
  <td class="sc {sc_cls}">{score:.1f}</td>
  <td>{t.get('channel_count',0)}</td>
  <td>{_fmt_usd(t.get('fdv'))}</td>
  <td>{_fmt_usd(t.get('volume_h24'))}</td>
  <td>{_fmt_usd(t.get('volume_h1'))}</td>
  <td class="{p1h}">{_fmt_pct(t.get('price_change_h1'))}</td>
  <td class="{p6h}">{_fmt_pct(t.get('price_change_h6'))}</td>
  <td>{t.get('age_hours',0):.1f}h</td>
  <td>{t.get('brain_score', 0)}</td>
  <td>{tags}</td>
</tr>"""

    return _page(
        "Tokens",
        "tokens",
        f"""
{trending_html}
<h1>Token Leaderboard</h1>
<div class="sub">Top {len(tokens)} tokens from {data.get('total_candidates',0)} candidates &middot; {data.get('generated_at_iso','')}</div>
<div class="tbl"><table>
<thead><tr><th>#</th><th>Token</th><th>Chain</th><th>Address</th><th>Score</th><th>Ch</th><th>FDV</th><th>Vol24h</th><th>Vol1h</th><th>1h</th><th>6h</th><th>Age</th><th>&#x1f9e0;</th><th>Signals</th></tr></thead>
<tbody>{rows}</tbody>
</table></div>""",
    )


def _cross_reference_tokens_by_wallets() -> list[dict]:
    """
    Rank top100 tokens by blended score: original token score + wallet boost.

    Each token starts with its base score from the top100 screener methodology.
    A wallet-activity boost (up to +30) is added based on:
      - Buyer breadth (super-linear unique active wallets)
      - Buy frequency (avg buys per wallet, conviction)
      - Recency (time-decayed, fresh buys score higher)
      - Wallet quality (avg percentile of buying wallets)
      - Volume (log-scaled, diminishing returns)
      - Conviction (avg USD per active wallet)

    This surfaces tokens that are BOTH high-quality by screener metrics AND
    actively bought by smart-money wallets. No blanket bonuses.
    """
    data = _load_top100()
    tokens = [t for t in data.get("tokens", []) if not _is_wsol(t)]
    if not tokens:
        return []

    token_addrs = [(t.get("contract_address") or "").lower() for t in tokens if t.get("contract_address")]
    token_lookup = {addr: t for addr, t in zip(token_addrs, tokens)}

    conn = _get_wallet_db()
    if not conn:
        for t in tokens:
            t["wallet_count"] = 0
            t["active_wallet_count"] = 0
            t["holding_wallets"] = []
            t["activity_score"] = 0.0
            t["blended_score"] = round(t.get("score", 0) or 0, 1)
        return tokens

    try:
        # Wallet quality baseline
        top_wallets = _cross_reference_wallets_by_tokens()
        rank_map = {w["address"]: i for i, w in enumerate(top_wallets)}
        total_wallets = len(rank_map)

        # ── Bulk load all buy activity for top100 tokens ──
        token_wallet_data: dict[str, dict[str, dict]] = {}
        batch_size = 50
        for i in range(0, len(token_addrs), batch_size):
            batch = token_addrs[i : i + batch_size]
            placeholders = ",".join("?" for _ in batch)
            rows = conn.execute(
                f"SELECT token_address, wallet_address, amount_usd, timestamp "
                f"FROM smart_money_purchases "
                f"WHERE LOWER(token_address) IN ({placeholders}) AND side = 'buy'",
                batch,
            ).fetchall()
            for taddr, waddr, amt, ts in rows:
                taddr = taddr.lower()
                if taddr not in token_wallet_data:
                    token_wallet_data[taddr] = {}
                if waddr not in token_wallet_data[taddr]:
                    token_wallet_data[taddr][waddr] = {"count": 0, "usd": 0.0, "last_ts": 0}
                d = token_wallet_data[taddr][waddr]
                d["count"] += 1
                d["usd"] += amt or 0
                if ts and ts > d["last_ts"]:
                    d["last_ts"] = ts

        # ── Bulk load discovery wallets ──
        import json as _json

        smt_rows = conn.execute("SELECT token_address, discovery_wallets FROM smart_money_tokens").fetchall()
        for taddr, disc_wallets in smt_rows:
            taddr = (taddr or "").lower()
            if taddr not in token_lookup:
                continue
            if not disc_wallets:
                continue
            try:
                wallets = _json.loads(disc_wallets) if disc_wallets.startswith("[") else disc_wallets.split(",")
            except Exception:
                wallets = disc_wallets.split(",")
            if taddr not in token_wallet_data:
                token_wallet_data[taddr] = {}
            for waddr in wallets:
                waddr = waddr.strip()
                if not waddr:
                    continue
                if waddr not in token_wallet_data[taddr]:
                    token_wallet_data[taddr][waddr] = {"count": 0, "usd": 0.0, "last_ts": 0}

        now = time.time()
        for t in tokens:
            taddr = (t.get("contract_address") or "").lower()
            wallets = token_wallet_data.get(taddr, {})

            if not wallets:
                t["wallet_count"] = 0
                t["active_wallet_count"] = 0
                t["holding_wallets"] = []
                t["activity_score"] = 0.0
                t["blended_score"] = round(t.get("score", 0) or 0, 1)
                t["total_buy_usd"] = 0.0
                t["buy_count"] = 0
                t["last_buy_at"] = 0
                continue
            ub = len(wallets)
            active_wallets = {w: d for w, d in wallets.items() if d["count"] > 0}
            active_count = len(active_wallets)
            discovery_count = ub - active_count

            # Aggregate buy stats from active wallets only
            recency_sum = 0.0
            total_usd = 0.0
            total_buys = 0
            last_buy = 0
            for waddr, d in active_wallets.items():
                total_usd += d["usd"]
                total_buys += d["count"]
                if d["last_ts"] > last_buy:
                    last_buy = d["last_ts"]
                hours_ago = (now - d["last_ts"]) / 3600.0 if d["last_ts"] else 999.0
                recency_sum += max(0.0, 1.0 - hours_ago / 48.0)

            # Token-level recency (time since last buy anywhere) with 48h decay
            token_hours_ago = (now - last_buy) / 3600.0 if last_buy else 999.0
            token_recency = max(0.0, 1.0 - token_hours_ago / 48.0)
            per_wallet_recency = recency_sum / active_count if active_count else 0.0
            recency = max(token_recency, per_wallet_recency * 0.5)

            # Wallet quality: only wallets with actual buys count
            wq_sum = 0.0
            for waddr in active_wallets:
                rank = rank_map.get(waddr)
                if rank is not None:
                    wq_sum += max(0.0, (total_wallets - rank) / total_wallets)
            wallet_quality = wq_sum / active_count if active_count else 0.5

            # Frequency: avg buys per active wallet, capped at 5
            freq = min(total_buys / active_count, 5.0) if active_count else 0.0

            # Volume: softer log curve, higher cap so real volume matters
            vol_score = min(50.0, (total_usd**0.35) * 3.0) if total_usd > 0 else 0.0

            # Conviction: avg USD per active wallet (high-value buyers signal quality)
            avg_usd = total_usd / active_count if active_count else 0.0
            conviction_score = min(30.0, (avg_usd**0.3) * 4.0) if avg_usd > 0 else 0.0

            # Buyer breadth: reward ONLY wallets with actual buys, super-linear
            buyer_score = (active_count**1.4) * 10.0

            # Discovery bonus: small sub-linear reward for wallets in smart_money_tokens
            discovery_bonus = min(10.0, (discovery_count**1.1)) if discovery_count > 0 else 0.0

            base = buyer_score + (freq * 8.0) + vol_score + conviction_score + discovery_bonus
            # Multipliers: 0.4-1.0 range, softer than before so stale tokens aren't crushed
            activity_score = base * (0.4 + 0.6 * recency) * (0.4 + 0.6 * wallet_quality)

            # Blend with original token score so top100 methodology still applies
            token_score = t.get("score", 0) or 0
            wallet_boost = min(activity_score / 4.0, 30.0)
            blended_score = token_score + wallet_boost

            # ── Derive brain signal from social/momentum fields in top100 ──
            # Combine multiple signals into a single composite brain score
            social_score = t.get("social_score") or 0
            tw_kol = t.get("tw_kol_score") or 0
            tg_viral = t.get("tg_viral_score") or 0
            mentions = t.get("mentions") or 0
            mom_str = str(t.get("social_momentum") or "")
            momentum_map = {"very_high": 1.0, "high": 0.85, "medium": 0.5, "low": 0.2, "very_low": 0.1, "none": 0.0, "": 0.0}
            momentum = momentum_map.get(mom_str.lower(), 0.0)
            brain = round(social_score * 0.3 + tw_kol * 0.25 + tg_viral * 0.2 + mentions * 0.15 + momentum * 0.1, 1)

            # ── Derive tags/signals from token sentiment fields ──
            pos_list = t.get("positives") or []
            neg_list = t.get("negatives") or []
            signal_tags = []
            # Tag tokens with momentum / price action
            if (t.get("price_change_h1") or 0) > 5:
                signal_tags.append("h1Pump")
            if (t.get("price_change_h1") or 0) < -10:
                signal_tags.append("h1Dump")
            if (t.get("price_change_h6") or 0) > 15:
                signal_tags.append("h6Pump")
            if (t.get("price_change_h6") or 0) < -20:
                signal_tags.append("h6Dump")
            if momentum >= 0.5:
                signal_tags.append("viral")
            if mentions > 20:
                signal_tags.append("hot")
            if tg_viral > 5:
                signal_tags.append("tgAlpha")
            if tw_kol > 5:
                signal_tags.append("kolBuzz")
            # Tag from top positives keywords
            for p in pos_list[:2]:
                tag = str(p)[:20]
                if tag and tag not in signal_tags:
                    signal_tags.append(tag)
            # Tag insider/rug flags from derived fields
            if t.get("derived_possible_rug"):
                signal_tags.append("rugWarn")
            if t.get("derived_massive_dump"):
                signal_tags.append("dumpRisk")

            t["brain_score"] = brain
            t["signal_tags"] = signal_tags
            t["wallet_count"] = ub
            t["active_wallet_count"] = active_count
            t["holding_wallets"] = list(wallets.keys())[:10]
            t["activity_score"] = round(activity_score, 1)
            t["blended_score"] = round(blended_score, 1)
            t["total_buy_usd"] = round(total_usd, 2)
            t["buy_count"] = total_buys
            t["last_buy_at"] = last_buy
            t["recency"] = round(recency, 2)
            t["wallet_quality"] = round(wallet_quality, 2)
            t["frequency"] = round(freq, 2)

        tokens = _dedupe_tokens(tokens)
        tokens.sort(key=lambda t: t.get("blended_score", 0), reverse=True)
        return tokens

    except Exception:
        return _dedupe_tokens(tokens)
    finally:
        if conn:
            conn.close()


def _cross_reference_wallets_by_tokens() -> list[dict]:
    """Discover wallets that bought top100 tokens, ranked by component-weighted quality."""
    import math, time as _time, json as _json

    data = _load_top100()
    tokens = data.get("tokens", [])
    token_map: dict[str, dict] = {}
    for t in tokens:
        addr = (t.get("contract_address") or "").lower()
        if addr:
            token_map[addr] = t

    if not token_map:
        return []

    conn = _get_wallet_db()
    if not conn:
        return []

    try:
        now = _time.time()

        # Load tracked wallet component scores
        tracked_map: dict[str, dict] = {}
        for row in conn.execute(
            "SELECT address, wallet_score, total_profit, entry_timing_score, win_rate, "
            "insider_flag, total_trades, avg_roi, smart_money_tag, zerion_defi_value, "
            "avg_hold_hours, copy_trade_flag, rug_history_count, wallet_tags, chain "
            "FROM tracked_wallets"
        ).fetchall():
            addr, ws, total_profit, entry_timing, win_rate, insider_flag, total_trades, avg_roi, smart_money_tag, zerion_defi_value, avg_hold_hours, copy_trade_flag, rug_history_count, wtags, chain = row
            tracked_map[addr] = {
                "wallet_score": ws or 0,
                "pnl_score": float(total_profit or 0) / 1000.0,
                "timing_score": float(entry_timing or 0),
                "winrate_score": float(win_rate or 0) / 10.0,
                "insider_score": 10.0 if int(insider_flag or 0) else 0.0,
                "trades_score": min(float(total_trades or 0) / 10.0, 20.0),
                "roi_score": float(avg_roi or 0) / 10.0,
                "tag_score": 5.0 if (smart_money_tag or "") else 0.0,
                "defi_score": min(float(zerion_defi_value or 0) / 10000.0, 10.0),
                "age_score": min(float(avg_hold_hours or 0) / 24.0, 10.0),
                "copy_penalty": -5.0 if int(copy_trade_flag or 0) else 0.0,
                "rug_penalty": -10.0 * float(rug_history_count or 0),
                "wallet_tags": wtags or "",
                "chain": chain or "",
            }

        # Pre-fetch smp_tags
        smp_tags: dict[str, str] = {}
        addr_list = list(token_map.keys())
        for i in range(0, len(addr_list), 50):
            batch = addr_list[i:i+50]
            ph = ",".join("?" for _ in batch)
            for waddr, wtags in conn.execute(
                f"SELECT DISTINCT wallet_address, wallet_tags FROM smart_money_purchases "
                f"WHERE wallet_address IN ({ph}) AND wallet_tags IS NOT NULL AND wallet_tags != ''",
                batch,
            ).fetchall():
                smp_tags.setdefault(waddr, wtags)

        wallet_map: dict[str, dict] = {}

        # Source 1: smart_money_purchases grouped by chain
        by_chain: dict[str, list[str]] = {}
        for addr in token_map:
            chain = token_map[addr].get("chain", "") or ""
            by_chain.setdefault(chain, []).append(addr)

        for chain, addrs in by_chain.items():
            for i in range(0, len(addrs), 50):
                batch = addrs[i:i+50]
                checks = " OR ".join(f"LOWER(smp.token_address) = ?" for _ in batch)
                rows = conn.execute(
                    f"SELECT smp.wallet_address, smp.token_address, smp.token_symbol, "
                    f"smp.amount_usd, smp.timestamp, smp.chain "
                    f"FROM smart_money_purchases smp "
                    f"WHERE ({checks}) AND smp.side = 'buy' "
                    f"AND smp.token_address IS NOT NULL AND smp.chain = ?",
                    batch + [chain],
                ).fetchall()
                for waddr, taddr, tsym, amt, ts, row_chain in rows:
                    taddr_low = (taddr or "").lower()
                    tok = token_map.get(taddr_low, {})
                    score = tok.get("score", 0) or 0
                    if waddr not in wallet_map:
                        tw = tracked_map.get(waddr, {})
                        wallet_map[waddr] = {
                            "address": waddr, "chain": row_chain,
                            "tracked": tw,
                            "token_scores": {}, "token_scores_weighted": 0.0,
                            "total_buy_usd": 0.0, "buy_count": 0,
                            "tokens_set": set(), "last_active": 0,
                            "wallet_tags": tw.get("wallet_tags", "") or smp_tags.get(waddr, ""),
                        }
                    w = wallet_map[waddr]
                    age_hours = (now - ts) / 3600 if ts else 48
                    recency_mult = max(0.1, 1.0 - (age_hours / 12))
                    conviction = min(math.log(max(amt, 1) + 1) / 5, 3.0)
                    w["token_scores_weighted"] += score * recency_mult * (1 + conviction * 0.3)
                    w["total_buy_usd"] += amt
                    w["buy_count"] += 1
                    w["tokens_set"].add(taddr_low)
                    w["token_scores"][tsym or "?"] = max(w["token_scores"].get(tsym or "?", 0), score)
                    if ts > w["last_active"]:
                        w["last_active"] = ts
                    if not w["chain"] and row_chain:
                        w["chain"] = row_chain

        # Source 2: smart_money_tokens discovery_wallets
        for taddr, sym, disc_wallets, chain in conn.execute(
            "SELECT token_address, symbol, discovery_wallets, chain FROM smart_money_tokens"
        ).fetchall():
            taddr_low = (taddr or "").lower()
            if taddr_low not in token_map:
                continue
            if not disc_wallets:
                continue
            try:
                dw = _json.loads(disc_wallets) if disc_wallets.startswith("[") else disc_wallets.split(",")
            except Exception:
                dw = disc_wallets.split(",")
            score = token_map[taddr_low].get("score", 0) or 0
            for waddr in dw:
                waddr = waddr.strip()
                if not waddr:
                    continue
                if waddr not in wallet_map:
                    tw = tracked_map.get(waddr, {})
                    # Derive a tag from the discovering token if no explicit tags exist
                    derived_tag = f"discovered_by_{sym.strip()}" if sym else "discovered"
                    wallet_map[waddr] = {
                        "address": waddr, "chain": chain or "",
                        "tracked": tw,
                        "token_scores": {}, "token_scores_weighted": 0.0,
                        "total_buy_usd": 0.0, "buy_count": 0,
                        "tokens_set": set(), "last_active": 0,
                        "wallet_tags": tw.get("wallet_tags", "") or smp_tags.get(waddr, "") or derived_tag,
                    }
                w = wallet_map[waddr]
                w["token_scores_weighted"] += score * 0.5
                w["tokens_set"].add(taddr_low)
                w["token_scores"][sym or "?"] = max(w["token_scores"].get(sym or "?", 0), score)
                if not w["chain"] and chain:
                    w["chain"] = chain

        # Build final list
        results = []
        for addr, w in wallet_map.items():
            token_count = len(w["tokens_set"])
            if token_count == 0:
                continue

            # Ensure every wallet has at least one tag
            tags = w.get("wallet_tags", "") or ""
            if not tags.strip():
                # Fallback: use top token as tag, or generic 'smart_money'
                top_sym = sorted(w["token_scores"].items(), key=lambda x: x[1], reverse=True)[0][0] if w["token_scores"] else ""
                tags = f"{top_sym}_buyer" if top_sym else "smart_money"
                w["wallet_tags"] = tags

            tracked = w["tracked"]
            wallet_quality = (
                (tracked.get("pnl_score", 0) or 0) * 1.0
                + (tracked.get("timing_score", 0) or 0) * 1.0
                + (tracked.get("winrate_score", 0) or 0) * 0.8
                + (tracked.get("insider_score", 0) or 0) * 0.7
                + (tracked.get("trades_score", 0) or 0) * 0.5
                + (tracked.get("roi_score", 0) or 0) * 0.4
                + (tracked.get("tag_score", 0) or 0) * 0.3
                + (tracked.get("defi_score", 0) or 0) * 0.2
                + (tracked.get("copy_penalty", 0) or 0) * 1.0
                + (tracked.get("rug_penalty", 0) or 0) * 2.0
            )
            avg_token_score = w["token_scores_weighted"] / max(token_count, 1)
            breadth_bonus = math.pow(token_count, 1.4) * 2
            activity_bonus = min(w["buy_count"] * 1.5, 20)
            volume_bonus = min(math.log(max(w["total_buy_usd"], 1) + 1) * 2, 15)
            final_score = (
                wallet_quality * 0.4
                + avg_token_score * 0.3
                + breadth_bonus * 0.15
                + activity_bonus * 0.1
                + volume_bonus * 0.05
            )
            sorted_tokens = sorted(w["token_scores"].items(), key=lambda x: x[1], reverse=True)
            results.append({
                "address": addr,
                "chain": w["chain"],
                "weighted_score": round(final_score, 1),
                "wallet_quality": round(wallet_quality, 1),
                "avg_token_score": round(avg_token_score, 1),
                "total_buy_usd": round(w["total_buy_usd"], 2),
                "token_count": token_count,
                "buy_count": w["buy_count"],
                "top_tokens": [t[0] for t in sorted_tokens[:10]],
                "wallet_tags": w.get("wallet_tags", "") or smp_tags.get(addr, ""),
                "last_active_at": w["last_active"],
            })

        results.sort(key=lambda x: x["weighted_score"], reverse=True)
        return results

    except Exception as e:
        return [{"error": str(e)}]
    finally:
        conn.close()


def _get_active_tokens(top_n_wallets: int = 50) -> list[dict]:
    """
    Tokens that top wallets (from cross/wallets) are actively buying.
    Aggregated from smart_money_purchases, sorted by unique buyers then volume.
    """
    top_wallets = _cross_reference_wallets_by_tokens()
    wallet_addrs = [w["address"] for w in top_wallets[:top_n_wallets]]
    if not wallet_addrs:
        return []

    # Build wallet rank map for weighted scoring
    rank_map = {w["address"]: i for i, w in enumerate(top_wallets)}
    total_wallets = len(top_wallets)

    conn = _get_wallet_db()
    if not conn:
        return []

    try:
        token_map: dict[str, dict] = {}
        batch_size = 50
        for i in range(0, len(wallet_addrs), batch_size):
            batch = wallet_addrs[i : i + batch_size]
            placeholders = ",".join("?" for _ in batch)
            rows = conn.execute(
                f"SELECT token_address, token_symbol, chain, wallet_address, "
                f"side, amount_usd, timestamp "
                f"FROM smart_money_purchases "
                f"WHERE wallet_address IN ({placeholders}) AND side = 'buy'",
                batch,
            ).fetchall()
            for token_addr, sym, chain, waddr, side, amt, ts in rows:
                key = token_addr.lower() if token_addr else ""
                if not key:
                    continue
                if _is_wsol(key, sym or ""):
                    continue
                if key not in token_map:
                    token_map[key] = {
                        "token_address": token_addr,
                        "symbol": sym or "?",
                        "chain": chain or "",
                        "total_buy_usd": 0.0,
                        "unique_buyers": set(),
                        "buy_count": 0,
                        "last_buy_at": 0,
                    }
                token_map[key]["total_buy_usd"] += amt or 0
                token_map[key]["unique_buyers"].add(waddr)
                token_map[key]["buy_count"] += 1
                if ts and ts > token_map[key]["last_buy_at"]:
                    token_map[key]["last_buy_at"] = ts

        now = time.time()
        results = []
        for key, tm in token_map.items():
            ub = len(tm["unique_buyers"])
            if ub == 0:
                continue

            # 1. Recency: 1.0 = bought within last hour, 0.0 = >24h ago
            hours_ago = (now - tm["last_buy_at"]) / 3600.0 if tm["last_buy_at"] else 999.0
            recency = max(0.0, 1.0 - hours_ago / 24.0)

            # 2. Wallet quality: average percentile of buyers (top = 1.0, bottom ~0)
            wq_sum = 0.0
            for w in tm["unique_buyers"]:
                rank = rank_map.get(w)
                if rank is not None:
                    wq_sum += max(0.0, (total_wallets - rank) / total_wallets)
            wallet_quality = wq_sum / ub if ub else 0.5

            # 3. Frequency: average buys per wallet (sustained conviction)
            freq = min(tm["buy_count"] / ub, 5.0)

            # 4. Volume: log-scaled, diminishing returns
            vol = tm["total_buy_usd"]
            vol_score = min(25.0, (vol**0.4) * 2.0) if vol > 0 else 0.0

            # 5. Buyer breadth: super-linear reward for many distinct wallets
            buyer_score = (ub**1.4) * 8.0

            # Base score combines raw conviction signals
            base = buyer_score + (freq * 6.0) + vol_score

            # Activity score: base scaled by recency and wallet quality.
            # Multipliers range 0.3 (stale / low-quality) to 1.0 (fresh / top-quality).
            activity_score = base * (0.3 + 0.7 * recency) * (0.3 + 0.7 * wallet_quality)

            results.append(
                {
                    "token_address": tm["token_address"],
                    "symbol": tm["symbol"],
                    "chain": tm["chain"],
                    "total_buy_usd": round(tm["total_buy_usd"], 2),
                    "unique_buyers": ub,
                    "buy_count": tm["buy_count"],
                    "last_buy_at": tm["last_buy_at"],
                    "activity_score": round(activity_score, 1),
                    "recency": round(recency, 2),
                    "wallet_quality": round(wallet_quality, 2),
                    "frequency": round(freq, 2),
                }
            )

        results.sort(key=lambda x: x["activity_score"], reverse=True)
        return _dedupe_active_tokens(results)

    except Exception:
        return []
    finally:
        conn.close()


def _get_active_wallets(active_tokens: list[dict]) -> list[dict]:
    """
    Top wallets that bought active tokens, ranked by component-weighted quality.

    Scoring methodology:
    1. Wallet quality: component scores from tracked_wallets
    2. Token quality: average score of active tokens held
    3. Activity: buy frequency + volume (log-scaled)
    4. Recency: recent buys weighted higher
    """
    import math, time as _time

    active_addrs = {t["token_address"].lower() for t in active_tokens if t.get("token_address")}
    if not active_addrs:
        return []

    # Build token score map
    token_score_map = {}
    for t in active_tokens:
        addr = (t.get("token_address") or "").lower()
        if addr:
            token_score_map[addr] = t.get("score", 0) or 0

    conn = _get_wallet_db()
    if not conn:
        return []

    # Pre-fetch tags from smart_money_purchases for wallets that may not be in tracked_wallets
    smp_tags: dict[str, str] = {}
    smp_conn = _get_wallet_db()
    if smp_conn:
        try:
            addr_list = list(active_addrs)
            for i in range(0, len(addr_list), 50):
                batch = addr_list[i : i + 50]
                ph = ",".join("?" for _ in batch)
                rows = smp_conn.execute(
                    f"SELECT DISTINCT wallet_address, wallet_tags "
                    f"FROM smart_money_purchases "
                    f"WHERE wallet_address IN ({ph}) AND wallet_tags IS NOT NULL AND wallet_tags != ''",
                    batch,
                ).fetchall()
                for waddr, wtags in rows:
                    if waddr not in smp_tags:
                        smp_tags[waddr] = wtags
        except Exception:
            pass
        finally:
            smp_conn.close()

    # Build tracked_map for quick wallet_tags lookup from tracked_wallets
    tracked_map: dict[str, dict] = {}
    try:
        rows = conn.execute(
            "SELECT address, wallet_tags FROM tracked_wallets WHERE wallet_tags IS NOT NULL AND wallet_tags != ''"
        ).fetchall()
        for addr, tags in rows:
            tracked_map[addr] = {"wallet_tags": tags}
    except Exception:
        pass

    try:
        now = _time.time()
        wallet_map: dict[str, dict] = {}

        # Build token_chain_map from active_tokens
        token_chain_map = {}
        for t in active_tokens:
            addr = (t.get("token_address") or "").lower()
            if addr:
                token_chain_map[addr] = t.get("chain", "") or ""

        # Group active_addrs by chain for chain-matched queries
        by_chain: dict[str, list[str]] = {}
        for addr in active_addrs:
            chain = token_chain_map.get(addr, "") or ""
            by_chain.setdefault(chain, []).append(addr)

        batch_size = 50
        for chain, addrs in by_chain.items():
            for i in range(0, len(addrs), batch_size):
                batch = addrs[i : i + batch_size]
                checks = " OR ".join("LOWER(smp.token_address) = ?" for _ in batch)
                rows = conn.execute(
                    f"SELECT smp.wallet_address, smp.token_address, smp.token_symbol, "
                    f"smp.chain, smp.amount_usd, smp.timestamp, "
                    f"COALESCE(tw.wallet_score, 0) as ws, tw.wallet_tags, "
                    f"COALESCE(tw.total_profit, 0), COALESCE(tw.entry_timing_score, 0), "
                    f"COALESCE(tw.win_rate, 0), COALESCE(tw.insider_flag, 0), "
                    f"COALESCE(tw.total_trades, 0), COALESCE(tw.avg_roi, 0), "
                    f"COALESCE(tw.smart_money_tag, ''), COALESCE(tw.zerion_defi_value, 0), "
                    f"COALESCE(tw.copy_trade_flag, 0), COALESCE(tw.rug_history_count, 0), 0, 0 "
                    f"FROM smart_money_purchases smp "
                    f"LEFT JOIN tracked_wallets tw ON smp.wallet_address = tw.address "
                    f"WHERE ({checks}) AND smp.side = 'buy' AND smp.chain = ?",
                    batch + [chain],
                ).fetchall()

            for row in rows:
                (
                    waddr,
                    taddr,
                    tsym,
                    chain,
                    amt,
                    ts,
                    ws,
                    wtags,
                    pnl,
                    timing,
                    winrate,
                    insider,
                    trades,
                    roi,
                    tag,
                    defi,
                    copy_pen,
                    rug_pen,
                    rt_pen,
                    lw_pen,
                ) = row

                if waddr not in wallet_map:
                    tw = tracked_map.get(waddr, {})
                    wallet_map[waddr] = {
                        "address": waddr,
                        "chain": chain or "",
                        "wallet_score": ws or 0,
                        "wallet_tags": wtags or tw.get("wallet_tags", "") or smp_tags.get(waddr, ""),
                        "tracked_scores": {
                            # Normalize current schema fields to legacy scoring components
                            "pnl_score": float(pnl or 0) / 1000.0,
                            "timing_score": float(timing or 0),
                            "winrate_score": float(winrate or 0) / 10.0,
                            "insider_score": 10.0 if int(insider or 0) else 0.0,
                            "trades_score": min(float(trades or 0) / 10.0, 20.0),
                            "roi_score": float(roi or 0) / 10.0,
                            "tag_score": 5.0 if (tag or "") else 0.0,
                            "defi_score": min(float(defi or 0) / 10000.0, 10.0),
                            "copy_penalty": -5.0 if int(copy_pen or 0) else 0.0,
                            "rug_penalty": -10.0 * float(rug_pen or 0),
                            "round_trip_penalty": rt_pen or 0,
                            "low_win_penalty": lw_pen or 0,
                        },
                        "total_buy_usd": 0.0,
                        "active_tokens_set": set(),
                        "token_score_sum": 0.0,
                        "buy_count": 0,
                        "last_active_at": 0,
                    }
                w = wallet_map[waddr]
                w["total_buy_usd"] += amt or 0
                w["active_tokens_set"].add(tsym or "?")
                w["token_score_sum"] += token_score_map.get(taddr.lower(), 0)
                w["buy_count"] += 1
                if ts and ts > w["last_active_at"]:
                    w["last_active_at"] = ts

        results = []
        for addr, w in wallet_map.items():
            token_count = len(w["active_tokens_set"])
            if token_count == 0:
                continue

            ts = w["tracked_scores"]
            # Component-based wallet quality
            wallet_quality = (
                (ts.get("pnl_score", 0) or 0) * 1.0
                + (ts.get("timing_score", 0) or 0) * 1.0
                + (ts.get("winrate_score", 0) or 0) * 0.8
                + (ts.get("insider_score", 0) or 0) * 0.7
                + (ts.get("trades_score", 0) or 0) * 0.5
                + (ts.get("roi_score", 0) or 0) * 0.4
                + (ts.get("tag_score", 0) or 0) * 0.3
                + (ts.get("defi_score", 0) or 0) * 0.2
                + (ts.get("copy_penalty", 0) or 0) * 1.0
                + (ts.get("rug_penalty", 0) or 0) * 2.0
                + (ts.get("round_trip_penalty", 0) or 0) * 1.0
                + (ts.get("low_win_penalty", 0) or 0) * 1.0
            )

            avg_token_score = w["token_score_sum"] / token_count
            breadth_bonus = math.pow(token_count, 1.4) * 2
            activity_bonus = min(w["buy_count"] * 1.5, 20)
            volume_bonus = min(math.log(max(w["total_buy_usd"], 1) + 1) * 2, 15)

            final_score = (
                wallet_quality * 0.4
                + avg_token_score * 0.3
                + breadth_bonus * 0.15
                + activity_bonus * 0.1
                + volume_bonus * 0.05
            )

            tokens_sorted = sorted(w["active_tokens_set"])
            results.append(
                {
                    "address": addr,
                    "chain": w["chain"],
                    "wallet_score": w["wallet_score"],
                    "wallet_quality": round(wallet_quality, 1),
                    "final_score": round(final_score, 1),
                    "wallet_tags": w["wallet_tags"],
                    "total_buy_usd": round(w["total_buy_usd"], 2),
                    "active_token_count": token_count,
                    "active_tokens": tokens_sorted[:10],
                    "buy_count": w["buy_count"],
                    "last_active_at": w["last_active_at"],
                }
            )

        results.sort(key=lambda x: x["final_score"], reverse=True)
        return results

    except Exception:
        return []
    finally:
        conn.close()


@app.get("/wallets", response_class=HTMLResponse)
async def wallets(min_score: float = Query(0), chain: str = Query("")):
    """Smart Money: old tracked wallets ranked against new found wallets from top tokens."""
    conn = _get_wallet_db()

    # Get new found wallets from smart_money_purchases (wallets buying top100 tokens)
    new_wallets = _cross_reference_wallets_by_tokens()
    new_wallet_map = {w["address"]: w for w in new_wallets}

    # Get old tracked wallets with component scores
    old_wallets = []
    if conn:
        q = (
            "SELECT address, chain, wallet_score, total_profit, avg_roi, win_rate, "
            "total_trades, wallet_tags, insider_flag, last_active_at, "
            "pnl_score, timing_score, winrate_score, insider_score, trades_score, "
            "roi_score, tag_score, defi_score, copy_penalty, rug_penalty, "
            "round_trip_penalty, low_win_penalty "
            "FROM tracked_wallets WHERE wallet_score >= ?"
        )
        params: list[float | str] = [min_score]
        if chain:
            q += " AND chain = ?"
            params.append(chain)
        q += " ORDER BY wallet_score DESC"
        try:
            rows = conn.execute(q, params).fetchall()
            for row in rows:
                old_wallets.append(
                    {
                        "address": row[0],
                        "chain": row[1],
                        "wallet_score": row[2] or 0,
                        "total_profit": row[3],
                        "avg_roi": row[4],
                        "win_rate": row[5],
                        "total_trades": row[6] or 0,
                        "wallet_tags": row[7] or "",
                        "insider_flag": row[8],
                        "last_active_at": row[9],
                        "pnl_score": row[10] or 0,
                        "timing_score": row[11] or 0,
                        "winrate_score": row[12] or 0,
                        "insider_score": row[13] or 0,
                        "trades_score": row[14] or 0,
                        "roi_score": row[15] or 0,
                        "tag_score": row[16] or 0,
                        "defi_score": row[17] or 0,
                        "copy_penalty": row[18] or 0,
                        "rug_penalty": row[19] or 0,
                        "round_trip_penalty": row[20] or 0,
                        "low_win_penalty": row[21] or 0,
                    }
                )
        except Exception:
            pass
        conn.close()

    # ── Bulk-fetch tags from smart_money_purchases for wallets missing tags ──
    # new_wallet_map wallets may not be in tracked_wallets, so their tags are empty.
    # Pull what we can from smart_money_purchases.wallet_tags.
    smp_tags: dict[str, str] = {}
    if conn2 := _get_wallet_db():
        try:
            addr_batch = list(new_wallet_map.keys())
            for i in range(0, len(addr_batch), 50):
                batch = addr_batch[i : i + 50]
                ph = ",".join("?" for _ in batch)
                rows = conn2.execute(
                    f"SELECT DISTINCT wallet_address, wallet_tags "
                    f"FROM smart_money_purchases "
                    f"WHERE wallet_address IN ({ph}) AND wallet_tags IS NOT NULL AND wallet_tags != ''",
                    batch,
                ).fetchall()
                for waddr, wtags in rows:
                    if waddr not in smp_tags:
                        smp_tags[waddr] = wtags
        except Exception:
            pass
        finally:
            conn2.close()

    # Merge: old wallets + new wallets not in old
    merged: dict[str, dict] = {}
    for w in old_wallets:
        addr = w.get("address", "")
        merged[addr] = {
            "address": addr,
            "chain": w.get("chain", ""),
            "wallet_score": w.get("wallet_score", 0) or 0,
            "total_profit": w.get("total_profit"),
            "avg_roi": w.get("avg_roi"),
            "win_rate": w.get("win_rate"),
            "total_trades": w.get("total_trades", 0),
            "wallet_tags": w.get("wallet_tags", "") or smp_tags.get(addr, ""),
            "insider_flag": w.get("insider_flag"),
            "last_active_at": w.get("last_active_at"),
            "source": "tracked",
            "weighted_score": 0,
            "active_token_count": 0,
            "component_score": 0,
        }
        # Compute component score for old wallets
        merged[addr]["component_score"] = (
            (w.get("pnl_score", 0) or 0) * 1.0
            + (w.get("timing_score", 0) or 0) * 1.0
            + (w.get("winrate_score", 0) or 0) * 0.8
            + (w.get("insider_score", 0) or 0) * 0.7
            + (w.get("trades_score", 0) or 0) * 0.5
            + (w.get("roi_score", 0) or 0) * 0.4
            + (w.get("tag_score", 0) or 0) * 0.3
            + (w.get("defi_score", 0) or 0) * 0.2
            + (w.get("copy_penalty", 0) or 0) * 1.0
            + (w.get("rug_penalty", 0) or 0) * 2.0
            + (w.get("round_trip_penalty", 0) or 0) * 1.0
            + (w.get("low_win_penalty", 0) or 0) * 1.0
        )

    for addr, nw in new_wallet_map.items():
        if addr not in merged:
            tags_from_smp = smp_tags.get(addr, "")
            merged[addr] = {
                "address": addr,
                "chain": nw.get("chain", ""),
                "wallet_score": 0,
                "total_profit": None,
                "avg_roi": None,
                "win_rate": None,
                "total_trades": 0,
                "wallet_tags": tags_from_smp,
                "insider_flag": None,
                "last_active_at": nw.get("last_active_at"),
                "source": "new",
                "weighted_score": nw.get("weighted_score", 0),
                "active_token_count": nw.get("token_count", 0),
                "component_score": 0,
            }
        else:
            # Old wallet also found buying top tokens — boost it
            merged[addr]["weighted_score"] = nw.get("weighted_score", 0)
            merged[addr]["active_token_count"] = nw.get("token_count", 0)
            merged[addr]["source"] = "both"

    # Filter by chain if specified
    if chain:
        merged = {k: v for k, v in merged.items() if v["chain"] == chain}

    # Rank: combine component_score + weighted_score for unified ranking
    ranked = sorted(
        merged.values(),
        key=lambda w: (w["component_score"] * 0.6 + w["weighted_score"] * 0.4, w["wallet_score"]),
        reverse=True,
    )

    rows_html = ""
    for i, w in enumerate(ranked[:100], 1):
        score = w.get("wallet_score", 0) or 0
        ws = w.get("weighted_score", 0) or 0
        comp = w.get("component_score", 0) or 0
        combined = comp * 0.6 + ws * 0.4
        sc_cls = _score_cls(combined)
        roi = w.get("avg_roi")
        win = w.get("win_rate")
        profit = w.get("total_profit")
        profit_cls = "pos" if profit and profit > 0 else "neg" if profit and profit < 0 else ""
        tags_html = ""
        for t in (w.get("wallet_tags") or "").split(","):
            t = t.strip()
            if t:
                tag_cls = "tag-r" if t in ("sniper", "insider") else "tag-g" if t == "smart" else ""
                tags_html += f'<span class="tag {tag_cls}">{t}</span>'
        if w.get("insider_flag"):
            tags_html += '<span class="tag tag-y">INSIDER</span>'
        src = w.get("source", "")
        src_cls = "tag-g" if src == "both" else "tag-y" if src == "new" else ""

        rows_html += f"""<tr>
  <td>{i}</td>
  <td class="mono"><a href="https://app.zerion.io/{w.get('address','')}/overview" target="_blank">{_trunc(w.get('address',''))}</a></td>
  <td><span class="badge {_chain_cls(w.get('chain',''))}">{w.get('chain','')}</span></td>
  <td class="sc {sc_cls}">{combined:.0f}</td>
  <td>{comp:.0f}</td>
  <td>{score:.0f}</td>
  <td>{ws:.1f}</td>
  <td class="{profit_cls}">{_fmt_usd(profit)}</td>
  <td>{_fmt_pct(roi)}</td>
  <td>{_fmt_pct(win * 100 if win is not None else None)}</td>
  <td>{w.get('total_trades',0)}</td>
  <td>{w.get('active_token_count',0)}</td>
  <td>{tags_html}</td>
  <td><span class="tag {src_cls}">{src}</span></td>
  <td>{_time_ago(w.get('last_active_at'))}</td>
</tr>"""

    return _page(
        "Smart Money",
        "wallets",
        f"""
<h1>Smart Money Wallets</h1>
<div class="sub">{len(ranked)} wallets (tracked + discovered from top tokens)</div>
<div class="tbl"><table>
<thead><tr>
  <th>#</th><th>Wallet</th><th>Chain</th>
  <th>Combined</th><th>Component</th><th>Tracked</th><th>Weighted</th>
  <th>Profit</th><th>ROI</th><th>Win%</th><th>Trades</th><th>Active</th><th>Tags</th><th>Src</th><th>Last</th>
</tr></thead>
<tbody>{rows_html}</tbody>
</table></div>
""",
    )


@app.get("/token/{address}", response_class=HTMLResponse)
async def token_detail(address: str):
    data = _load_top100()
    token = None
    for t in data.get("tokens", []):
        if t.get("contract_address", "").lower() == address.lower():
            token = t
            break

    if not token:
        return _page(
            "Token",
            "tokens",
            f"<h1>Token Detail</h1><p class='sub'>{address}</p><div class='card'><h3>Not Found</h3><p>Not in current top100.json</p></div>",
        )

    pos = "".join(f'<span class="tag tag-g">{p}</span>' for p in (token.get("positives") or []))
    neg = "".join(f'<span class="tag tag-r">{n}</span>' for n in (token.get("negatives") or []))

    return _page(
        token.get("symbol", "Token"),
        "tokens",
        f"""
<h1>{token.get('symbol','???')} <span style="color:var(--t2);font-weight:normal">({token.get('name','')})</span></h1>
<div class="sub">
  <span class="badge {_chain_cls(token.get('chain',''))}">{token.get('chain','')}</span>
  <a href="{_explorer(token.get('chain',''), address)}" target="_blank">{address}</a>
  &middot; <a href="/token/{address}/chart" style="font-weight:bold;color:var(--y)">&#9654; Live Chart</a>
</div>
<div class="grid">
  <div class="card">
    <h3>Score & Signals</h3>
    <div class="row"><span class="l">Final Score</span><span class="sc sc-h">{(token.get('score',0) or 0):.1f}</span></div>
    <div class="row"><span class="l">Channels</span><span>{token.get('channel_count',0)} ch, {token.get('mentions',0)} mentions</span></div>
    <div class="row"><span class="l">Smart Wallets</span><span>&#x1f9e0; {token.get('gmgn_smart_wallets',0)}</span></div>
    <div style="margin-top:.5rem">{pos}{neg}</div>
  </div>
  <div class="card">
    <h3>Market Data</h3>
    <div class="row"><span class="l">FDV</span><span>{_fmt_usd(token.get('fdv'))}</span></div>
    <div class="row"><span class="l">Vol 24h</span><span>{_fmt_usd(token.get('volume_h24'))}</span></div>
    <div class="row"><span class="l">Vol 1h</span><span>{_fmt_usd(token.get('volume_h1'))}</span></div>
    <div class="row"><span class="l">Age</span><span>{(token.get('age_hours',0) or 0):.1f}h</span></div>
  </div>
  <div class="card">
    <h3>Price Action</h3>
    <div class="row"><span class="l">1h</span><span class="{_pct_cls(token.get('price_change_h1'))}">{_fmt_pct(token.get('price_change_h1'))}</span></div>
    <div class="row"><span class="l">6h</span><span class="{_pct_cls(token.get('price_change_h6'))}">{_fmt_pct(token.get('price_change_h6'))}</span></div>
    <div class="row"><span class="l">24h</span><span class="{_pct_cls(token.get('price_change_h24'))}">{_fmt_pct(token.get('price_change_h24'))}</span></div>
  </div>
  <div class="card">
    <h3>Links</h3>
    <div class="row"><a href="/token/{address}/chart" style="font-weight:bold;color:var(--y)">&#9654; Live Chart</a></div>
    <div class="row"><a href="{token.get('dex_url','')}" target="_blank">Dexscreener &rarr;</a></div>
    <div class="row"><a href="{_explorer(token.get('chain',''), address)}" target="_blank">Explorer &rarr;</a></div>
  </div>
</div>""",
    )


@app.get("/token/{address}/chart", response_class=HTMLResponse)
async def token_chart(address: str):
    """Full-page TradingView chart for a token."""
    data = _load_top100()
    token = None
    for t in data.get("tokens", []):
        if t.get("contract_address", "").lower() == address.lower():
            token = t
            break

    if not token:
        return _page("Chart", "tokens", "<h1>Chart</h1><p class='sub'>Token not found</p>")

    return HTMLResponse(
        _dexscreener_embed_html(
            symbol=token.get("symbol", "???"),
            chain=token.get("chain", "solana"),
            address=address,
            dex_url=token.get("dex_url", ""),
            pair_address=token.get("pair_address", ""),
            fdv=token.get("fdv"),
            vol24=token.get("volume_h24"),
        )
    )


@app.get("/wallet/{address}", response_class=HTMLResponse)
async def wallet_detail(address: str):
    conn = _get_wallet_db()
    if not conn:
        return _page("Wallet", "wallets", "<h1>Wallet</h1><p class='sub'>DB not available</p>")

    wallet = conn.execute("SELECT * FROM tracked_wallets WHERE address = ?", (address,)).fetchone()
    positions = conn.execute(
        "SELECT * FROM wallet_token_entries WHERE wallet_address = ? ORDER BY profit DESC LIMIT 50",
        (address,),
    ).fetchall()
    conn.close()

    w = dict(wallet) if wallet else {}
    pos_list = [dict(p) for p in positions]

    if not w:
        return _page(
            "Wallet",
            "wallets",
            f"<h1>Wallet</h1><p class='sub'>{address}</p><div class='card'><h3>Not Found</h3></div>",
        )

    pos_rows = ""
    for p in pos_list:
        p_cls = "pos" if p.get("profit") and p["profit"] > 0 else "neg"
        pos_rows += f"""<tr>
  <td><a href="/token/{p.get('token_address','')}">{p.get('token_symbol') or _trunc(p.get('token_address',''),8)}</a></td>
  <td class="{p_cls}">{_fmt_usd(p.get('profit'))}</td>
  <td>{_fmt_usd(p.get('realized_profit'))}</td>
  <td>{p.get('buy_tx_count',0)}</td>
  <td>{p.get('sell_tx_count',0)}</td>
  <td>{'&#10003;' if p.get('is_profitable') else '&#10007;'}</td>
  <td>{_time_ago(p.get('start_holding_at'))}</td>
</tr>"""

    return _page(
        f"Wallet {_trunc(address,12)}",
        "wallets",
        f"""
<h1>Wallet Detail</h1>
<div class="sub">
  <span class="badge {_chain_cls(w.get('chain',''))}">{w.get('chain','')}</span>
  <a href="{_wallet_link(address)}" target="_blank">{address}</a>
</div>
<div class="grid">
  <div class="card">
    <h3>Performance</h3>
    <div class="row"><span class="l">Score</span><span class="sc sc-h">{(w.get('wallet_score',0) or 0):.0f}</span></div>
    <div class="row"><span class="l">Total PnL</span><span class="{'pos' if (w.get('total_profit') or 0)>0 else 'neg'}">{_fmt_usd(w.get('total_profit'))}</span></div>
    <div class="row"><span class="l">Avg ROI</span><span class="{_pct_cls(w.get('avg_roi'))}">{_fmt_pct(w.get('avg_roi'))}</span></div>
    <div class="row"><span class="l">Win Rate</span><span>{(w.get('win_rate',0) or 0)*100:.0f}%</span></div>
    <div class="row"><span class="l">Entry Timing</span><span>{(w.get('entry_timing_score',0) or 0):.0f}</span></div>
  </div>
  <div class="card">
    <h3>Activity</h3>
    <div class="row"><span class="l">Trades</span><span>{w.get('total_trades',0)}</span></div>
    <div class="row"><span class="l">Buys / Sells</span><span>{w.get('buy_count',0)} / {w.get('sell_count',0)}</span></div>
    <div class="row"><span class="l">Won</span><span>{w.get('tokens_profitable',0)} / {w.get('tokens_total',0)}</span></div>
    <div class="row"><span class="l">Last Active</span><span>{_time_ago(w.get('last_active_at'))}</span></div>
  </div>
</div>
{'<div style="margin-top:1.5rem"><h2 style="font-size:1rem;margin-bottom:.75rem">Token Positions (' + str(len(pos_list)) + ')</h2><div class="tbl"><table><thead><tr><th>Token</th><th>PnL</th><th>Realized</th><th>Buy</th><th>Sell</th><th>Win</th><th>Seen</th></tr></thead><tbody>' + pos_rows + '</tbody></table></div></div>' if pos_list else ''}""",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/health")
async def health():
    checks = {}
    for name, path in [
        ("top100", settings.output_path),
        ("contracts_db", settings.db_path),
        ("wallets_db", settings.wallets_db_path),
    ]:
        checks[name] = {
            "exists": path.exists(),
            "size": path.stat().st_size if path.exists() else 0,
        }
    return {"status": "healthy", "version": "9.0.0", "checks": checks}


@app.get("/trading_log", response_class=HTMLResponse)
async def trading_log():
    """Render structured trade decisions + monitor log; fallback to escaped raw log."""
    parts = ["<h1>Trading Log</h1>"]

    # ── Trade Decisions ──
    td_path = settings.output_path.parent / "trade_decisions.json"
    if td_path.exists():
        try:
            with open(td_path) as f:
                decisions = json.load(f)
            if decisions:
                rows = ""
                for d in reversed(decisions[-100:]):
                    sym = html.escape(str(d.get("symbol", "?")))
                    decision = d.get("decision", "?")
                    dc_cls = "tag-g" if decision == "buy" else "tag-r" if decision == "sell" else "tag-y"
                    rows += f"""<tr>
  <td><strong>{sym}</strong></td>
  <td><span class="tag {dc_cls}">{decision}</span></td>
  <td>{d.get('confidence', 0)}</td>
  <td>{d.get('position_pct', 0):.2f}%</td>
  <td>{html.escape(str(d.get('reason', ''))[:120])}</td>
  <td class="mono">{_time_ago(d.get('timestamp', 0))}</td>
</tr>"""
                parts.append(
                    f"""<h2 style="font-size:1rem;margin:1.2rem 0 .5rem">Trade Decisions ({len(decisions)} total)</h2>
<div class="tbl"><table>
<thead><tr><th>Symbol</th><th>Decision</th><th>Conf</th><th>Pos%</th><th>Reason</th><th>Time</th></tr></thead>
<tbody>{rows}</tbody>
</table></div>"""
                )
        except Exception as e:
            parts.append(f'<div class="sub">Error reading trade_decisions.json: {html.escape(str(e))}</div>')

    # ── Raw log fallback ──
    log_path = settings.hermes_home / "logs" / "ai_trading_brain.log"
    if log_path.exists():
        try:
            lines = log_path.read_text().splitlines()
            recent = lines[-200:][::-1]
            body_lines = "\n".join(
                f'<div class="mono" style="white-space:pre-wrap;font-size:.75rem;padding:.15rem 0;border-bottom:1px solid var(--b)">{html.escape(line)}</div>'
                for line in recent
            )
            parts.append(
                f"""<h2 style="font-size:1rem;margin:1.2rem 0 .5rem">Raw Brain Log ({len(lines)} lines)</h2>
<div style="background:var(--s);border:1px solid var(--b);border-radius:8px;padding:1rem;max-height:40vh;overflow-y:auto">{body_lines}</div>"""
            )
        except Exception as e:
            parts.append(f'<div class="sub">Error reading raw log: {html.escape(str(e))}</div>')

    if len(parts) == 1:
        parts.append("<div class='sub'>No trade data found.</div>")

    return _page("Trading Log", "tokens", "\n".join(parts))


@app.get("/api/top100")
async def api_top100():
    return _load_top100()


@app.get("/api/wallets")
async def api_wallets(min_score: float = Query(0), limit: int = Query(50, le=200)):
    conn = _get_wallet_db()
    if not conn:
        return []
    rows = conn.execute(
        "SELECT * FROM tracked_wallets WHERE wallet_score >= ? ORDER BY wallet_score DESC LIMIT ?",
        (min_score, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/stats")
async def api_stats():
    data = _load_top100()
    try:
        conn = _get_wallet_db()
        wc = conn.execute("SELECT COUNT(*) FROM tracked_wallets").fetchone()[0] if conn else 0
        avg = conn.execute("SELECT AVG(wallet_score) FROM tracked_wallets").fetchone()[0] if conn else 0
        if conn:
            conn.close()
    except Exception:
        wc = avg = 0
    return {
        "tokens_scored": len(data.get("tokens", [])),
        "total_candidates": data.get("total_candidates", 0),
        "wallets_tracked": wc,
        "avg_wallet_score": round(avg or 0, 1),
        "last_generated": data.get("generated_at_iso", "Never"),
    }


@app.get("/api/trending_keywords")
async def api_trending_keywords():
    path = settings.output_path.parent / "trending_keywords.json"
    if not path.exists():
        return {"keywords": [], "generated_at": "Never"}
    return json.loads(path.read_text())


# ═══════════════════════════════════════════════════════════════════════════════
# CHART API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# Chain ID mapping for Dexscreener


@app.get("/api/pool/{chain}/{address}")
async def api_find_pool(chain: str, address: str):
    """Find the top liquidity pool for a token on Dexscreener."""
    chain_id = chain.lower()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.dexscreener.com/latest/dex/tokens/{address}",
                params={"limit": 5},
            )
            if resp.status_code != 200:
                return {"pool_address": None, "error": f"status {resp.status_code}"}

            data = resp.json()
            pairs = data.get("pairs", [])
            if not pairs:
                return {"pool_address": None, "error": "no pools found"}

            chain_pairs = [p for p in pairs if p.get("chainId", "").lower() == chain_id]
            best = chain_pairs[0] if chain_pairs else pairs[0]

            pool_addr = best.get("pairAddress", "")
            return {
                "pool_address": pool_addr.lower() if pool_addr else None,
                "pool_name": best.get("baseToken", {}).get("symbol", ""),
                "dex": best.get("dexId", ""),
                "pair": best,
            }
    except Exception as e:
        return {"pool_address": None, "error": str(e)}


@app.get("/api/chart/{chain}/{pool_address}")
async def api_chart_ohlcv(
    chain: str,
    pool_address: str,
    timeframe: str = Query("hour", pattern="^(minute|hour|day)$"),
    aggregate: int = Query(1, ge=1, le=24),
    limit: int = Query(200, ge=1, le=1000),
):
    """Fetch OHLCV candle data from Dexscreener (synthetic)."""
    try:
        from token_lifecycle import _build_synthetic_candles as _tl_build
    except ImportError:
        return {
            "candles": [],
            "count": 0,
            "timeframe": timeframe,
            "aggregate": aggregate,
            "error": "builder_unavailable",
        }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.dexscreener.com/latest/dex/pairs/{chain}/{pool_address}",
                timeout=15,
            )
            if resp.status_code != 200:
                return {
                    "candles": [],
                    "count": 0,
                    "timeframe": timeframe,
                    "aggregate": aggregate,
                    "error": f"status {resp.status_code}",
                }

            body = resp.json()
            pairs = body.get("pairs") or []
            if not pairs:
                return {
                    "candles": [],
                    "count": 0,
                    "timeframe": timeframe,
                    "aggregate": aggregate,
                    "error": "no pair data",
                }

            pair = pairs[0]

            price_now = float(pair.get("priceUsd", 0) or 0)
            ch_raw = pair.get("priceChange", {}) or {}
            ch_h1 = float(ch_raw.get("h1", 0) or 0)
            ch_h6 = float(ch_raw.get("h6", 0) or 0)
            ch_h24 = float(ch_raw.get("h24", 0) or 0)
            vol_h24 = float(pair.get("volume", {}).get("h24", 0) or 0)

            candles = _tl_build(
                price_now,
                ch_h24,
                ch_h6,
                ch_h1,
                vol_h24,
                timeframe,
                limit,
            )

            return {
                "candles": candles,
                "count": len(candles),
                "timeframe": timeframe,
                "aggregate": aggregate,
            }
    except Exception as e:
        return {
            "candles": [],
            "count": 0,
            "timeframe": timeframe,
            "aggregate": aggregate,
            "error": str(e),
        }


@app.get("/active/tokens", response_class=HTMLResponse)
async def active_tokens():
    """Tokens that top wallets are actively buying."""
    active = _get_active_tokens()

    rows = ""
    for i, t in enumerate(active[:100], 1):
        act = t.get("activity_score", 0) or 0
        act_cls = _score_cls(act)
        buyers = t.get("unique_buyers", 0)
        buyer_cls = "sc-h" if buyers >= 5 else "sc-m" if buyers >= 2 else "sc-l"
        addr = t.get("token_address", "")

        rows += f"""<tr>
  <td>{i}</td>
  <td><a href="{_dexscreener_url(t.get('chain',''), addr)}" target="_blank"><strong>{t.get('symbol','???')}</strong></a></td>
  <td><span class="badge {_chain_cls(t.get('chain',''))}">{t.get('chain','')}</span></td>
  <td class="mono"><a href="{_explorer(t.get('chain',''), addr)}" target="_blank">{_trunc(addr)}</a></td>
  <td class="sc {act_cls}">{act:.1f}</td>
  <td class="sc {buyer_cls}">{buyers}</td>
  <td>{t.get('buy_count', 0)}</td>
  <td>{_fmt_usd(t.get('total_buy_usd'))}</td>
  <td>{_time_ago(t.get('last_buy_at'))}</td>
</tr>"""

    return _page(
        "Active Tokens",
        "active-tokens",
        f"""
<h1>Active Tokens</h1>
<div class="sub">Tokens being bought by top smart money wallets &middot; {len(active)} tokens</div>
<div class="tbl"><table>
<thead><tr><th>#</th><th>Token</th><th>Chain</th><th>Address</th><th>Activity</th><th>Buyers</th><th>Buys</th><th>Volume</th><th>Last Buy</th></tr></thead>
<tbody>{rows}</tbody>
</table></div>""",
    )


@app.get("/active/wallets", response_class=HTMLResponse)
async def active_wallets():
    """Top wallets that bought active tokens."""
    active = _get_active_tokens()
    wallets = _get_active_wallets(active)

    rows = ""
    for i, w in enumerate(wallets[:100], 1):
        ws = w.get("wallet_score", 0) or 0
        ws_cls = _score_cls(ws)
        addr = w.get("address", "")
        tags_html = ""
        for t in (w.get("wallet_tags") or "").split(","):
            t = t.strip()
            if t:
                tags_html += f'<span class="tag tag-g">{t}</span>'
        token_badges = " ".join(f'<span class="tag tag-y">{t}</span>' for t in w.get("active_tokens", [])[:6])

        rows += f"""<tr>
  <td>{i}</td>
  <td class="mono"><a href="https://app.zerion.io/{addr}/overview" target="_blank">{_trunc(addr)}</a></td>
  <td><span class="badge {_chain_cls(w.get('chain',''))}">{w.get('chain','')}</span></td>
  <td class="sc {ws_cls}">{ws:.0f}</td>
  <td>{w.get('active_token_count', 0)}</td>
  <td>{_fmt_usd(w.get('total_buy_usd'))}</td>
  <td>{w.get('buy_count', 0)}</td>
  <td>{_time_ago(w.get('last_active_at'))}</td>
  <td>{tags_html}</td>
  <td>{token_badges}</td>
</tr>"""

    return _page(
        "Active Wallets",
        "active-wallets",
        f"""
<h1>Active Wallets</h1>
<div class="sub">Top wallets buying active tokens &middot; {len(wallets)} wallets</div>
<div class="tbl"><table>
<thead><tr><th>#</th><th>Wallet</th><th>Chain</th><th>Score</th><th>Tokens</th><th>Volume</th><th>Buys</th><th>Active</th><th>Tags</th><th>Buying</th></tr></thead>
<tbody>{rows}</tbody>
</table></div>""",
    )


@app.get("/api/active/tokens")
async def api_active_tokens():
    """API: Active tokens by top wallet buys."""
    return _get_active_tokens()


@app.get("/api/active/wallets")
async def api_active_wallets():
    """API: Active wallets buying active tokens."""
    active = _get_active_tokens()
    return _get_active_wallets(active)


@app.get("/cross/tokens", response_class=HTMLResponse)
async def cross_tokens():
    """Tokens ranked by how many top wallets hold them."""
    tokens = _cross_reference_tokens_by_wallets()

    rows = ""
    for i, t in enumerate(tokens[:100], 1):
        blended = t.get("blended_score", 0) or 0
        blended_cls = _score_cls(blended)
        act = t.get("activity_score", 0) or 0
        act_cls = _score_cls(act)
        wc = t.get("wallet_count", 0)
        wc_cls = "sc-h" if wc >= 10 else "sc-m" if wc >= 5 else "sc-l"
        p1h = _pct_cls(t.get("price_change_h1"))
        p6h = _pct_cls(t.get("price_change_h6"))
        tags = "".join(f'<span class="tag tag-g">{p}</span>' for p in (t.get("signal_tags") or [])[:3])
        addr = t.get("contract_address", "")
        holding_wallets = t.get("holding_wallets", [])
        wallet_links = ", ".join(
            f'<a href="https://app.zerion.io/{w}/overview" target="_blank">{_trunc(w, 4)}</a>'
            for w in holding_wallets[:3]
        )

        rows += f"""<tr>
  <td>{i}</td>
  <td><a href="{t.get('dex_url', '/token/' + addr)}" target="_blank"><strong>{t.get('symbol','???')}</strong></a></td>
  <td><span class="badge {_chain_cls(t.get('chain',''))}">{t.get('chain','')}</span></td>
  <td class="mono"><a href="{_explorer(t.get('chain',''), addr)}" target="_blank">{_trunc(addr)}</a></td>
  <td class="sc {blended_cls}">{blended:.1f}</td>
  <td class="sc {act_cls}">{act:.1f}</td>
  <td class="sc {wc_cls}">{wc}</td>
  <td>{t.get('channel_count',0)}</td>
  <td>{_fmt_usd(t.get('fdv'))}</td>
  <td>{_fmt_usd(t.get('volume_h24'))}</td>
  <td>{_fmt_usd(t.get('volume_h1'))}</td>
  <td class="{p1h}">{_fmt_pct(t.get('price_change_h1'))}</td>
  <td class="{p6h}">{_fmt_pct(t.get('price_change_h6'))}</td>
  <td>{t.get('age_hours',0):.1f}h</td>
  <td>{t.get('brain_score', 0)}</td>
  <td>{tags}</td>
  <td class="mono" style="font-size:.65rem;max-width:150px;overflow:hidden;text-overflow:ellipsis">{wallet_links}</td>
</tr>"""

    return _page(
        "Tokens × Wallets",
        "cross-tokens",
        f"""
<h1>Tokens Ranked by Smart-Money Activity</h1>
<div class="sub">Top tokens sorted by blended score (token quality + wallet activity) &middot; {len(tokens)} tokens analyzed</div>
<div class="tbl"><table>
<thead><tr><th>#</th><th>Token</th><th>Chain</th><th>Address</th><th>Score</th><th>Activity</th><th>🧬</th><th>Ch</th><th>FDV</th><th>Vol24h</th><th>Vol1h</th><th>1h</th><th>6h</th><th>Age</th><th>🧠</th><th>Signals</th><th>Top Wallets</th></tr></thead>
<tbody>{rows}</tbody>
</table></div>""",
    )


@app.get("/cross/wallets", response_class=HTMLResponse)
async def cross_wallets():
    """Wallets ranked by weighted score of tokens they bought."""
    wallets = _cross_reference_wallets_by_tokens()

    rows = ""
    for i, w in enumerate(wallets[:100], 1):
        ws = w.get("weighted_score", 0) or 0
        ws_cls = "sc-h" if ws >= 50 else "sc-m" if ws >= 20 else "sc-l"
        addr = w.get("address", "")
        token_badges = " ".join(f'<span class="tag tag-g">{t}</span>' for t in w.get("top_tokens", [])[:6])

        rows += f"""<tr>
  <td>{i}</td>
  <td class="mono"><a href="https://app.zerion.io/{addr}/overview" target="_blank">{_trunc(addr)}</a></td>
  <td><span class="badge {_chain_cls(w.get('chain',''))}">{w.get('chain','')}</span></td>
  <td class="sc {ws_cls}">{ws:.1f}</td>
  <td>{w.get('token_count', 0)}</td>
  <td>{_fmt_usd(w.get('total_buy_usd'))}</td>
  <td>{_time_ago(w.get('last_active_at'))}</td>
  <td>{_fmt_tags(w.get('wallet_tags', ''))}</td>
  <td>{token_badges}</td>
</tr>"""

    return _page(
        "Wallets x Tokens",
        "cross-wallets",
        f"""
<h1>Wallets Ranked by Token Weight</h1>
<div class="sub">Smart money wallets that bought top-100 tokens, ranked by weighted token score &middot; {len(wallets)} wallets discovered</div>
<div class="tbl"><table>
<thead><tr><th>#</th><th>Wallet</th><th>Chain</th><th>Weighted Score</th><th>Tokens</th><th>Total Bought</th><th>Active</th><th>Tags</th><th>Top Tokens</th></tr></thead>
<tbody>{rows}</tbody>
</table></div>""",
    )


@app.get("/api/cross/tokens")
async def api_cross_tokens():
    """API: Tokens ranked by wallet count."""
    return _cross_reference_tokens_by_wallets()


@app.get("/api/cross/wallets")
async def api_cross_wallets():
    """API: Wallets ranked by top token count."""
    return _cross_reference_wallets_by_tokens()


@app.get("/api/debug_wallets")
async def api_debug_wallets():
    """Debug endpoint: call _cross_reference_wallets_by_tokens and return count or error."""
    import traceback as _tb
    try:
        from hermes_screener.config import settings
        result = _cross_reference_wallets_by_tokens()
        return {
            "count": len(result),
            "sample": result[0] if result else None,
            "hermes_home": str(settings.hermes_home),
            "wallets_db": str(settings.wallets_db_path),
        }
    except Exception as e:
        return {"error": str(e), "trace": _tb.format_exc()}
