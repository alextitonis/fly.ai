"""
Token Lifecycle Tracker — Captures chart data from entry to exit.

For each token that qualifies as a top token:
  - Snapshot OHLCV data when it first enters the database
  - Update snapshot periodically while it remains
  - Final snapshot when it exits (no longer qualifies)
  - Generate comparison chart: entry price vs exit price

Storage:
  ~/.hermes/data/token_screener/lifecycle/{address}_lifecycle.json
  ~/.hermes/data/token_screener/lifecycle/{address}_entry.png
  ~/.hermes/data/token_screener/lifecycle/{address}_exit.png

Usage:
    python3 token_lifecycle.py                    # run lifecycle tracking
    python3 token_lifecycle.py --snapshot         # force snapshot all current tokens
    python3 token_lifecycle.py --chart <address>  # generate lifecycle chart
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config

from hermes_screener.config import settings
from hermes_screener.logging import get_logger

log = get_logger("token_lifecycle")

LIFECYCLE_DIR = settings.hermes_home / "data" / "token_screener" / "lifecycle"
TOP_TOKENS_PATH = settings.output_path

# GeckoTerminal network mapping
_GT_NETWORKS = {
    "solana": "solana",
    "sol": "solana",
    "ethereum": "eth",
    "eth": "eth",
    "base": "base",
    "binance": "bsc",
    "bsc": "bsc",
    "binance-smart-chain": "bsc",
}


# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════════


def _lifecycle_path(address: str) -> Path:
    return LIFECYCLE_DIR / f"{address}_lifecycle.json"


def _load_lifecycle(address: str) -> dict | None:
    path = _lifecycle_path(address)
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def _save_lifecycle(address: str, data: dict):
    LIFECYCLE_DIR.mkdir(parents=True, exist_ok=True)
    with open(_lifecycle_path(address), "w") as f:
        json.dump(data, f, indent=2, default=str)


def _load_current_tokens() -> list[dict]:
    if TOP_TOKENS_PATH.exists():
        with open(TOP_TOKENS_PATH) as f:
            data = json.load(f)
        return data.get("tokens", data.get("top_tokens", []))
    return []


# ═══════════════════════════════════════════════════════════════════════════════
# OHLCV SNAPSHOT
# ═══════════════════════════════════════════════════════════════════════════════


async def _find_pool(chain: str, address: str, client: httpx.AsyncClient) -> str | None:
    """Find top pool address for a token."""
    net = _GT_NETWORKS.get(chain.lower(), "solana")
    try:
        resp = await client.get(
            f"https://api.geckoterminal.com/api/v2/networks/{net}/tokens/{address}/pools",
            params={"sort": "h24_tx_count_desc", "page": "1"},
            timeout=10,
        )
        if resp.status_code == 200:
            pools = resp.json().get("data", [])
            if pools:
                pool_id = pools[0]["id"]
                return pool_id.split("_")[-1] if "_" in pool_id else pool_id
    except Exception:
        pass
    return None


async def _fetch_ohlcv(chain: str, pool: str, timeframe: str, limit: int, client: httpx.AsyncClient) -> list[list]:
    """Fetch OHLCV candles from GeckoTerminal."""
    net = _GT_NETWORKS.get(chain.lower(), "solana")
    try:
        resp = await client.get(
            f"https://api.geckoterminal.com/api/v2/networks/{net}/pools/{pool}/ohlcv/{timeframe}",
            params={"aggregate": "1", "limit": str(limit)},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json().get("data", {}).get("attributes", {}).get("ohlcv_list", [])
    except Exception:
        pass
    return []


async def take_snapshot(token: dict, client: httpx.AsyncClient) -> dict:
    """Take an OHLCV snapshot for a token."""
    chain = token.get("chain", "")
    address = token.get("contract_address", "")

    # Find pool
    pool = await _find_pool(chain, address, client)
    if not pool:
        return {"error": "no pool found"}

    # Fetch multiple timeframes
    candles_h1 = await _fetch_ohlcv(chain, pool, "hour", 48, client)
    candles_m15 = await _fetch_ohlcv(chain, pool, "minute", 96, client)  # 24h of 15m
    candles_d1 = await _fetch_ohlcv(chain, pool, "day", 30, client)

    now = time.time()

    return {
        "timestamp": now,
        "timestamp_iso": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
        "chain": chain,
        "address": address,
        "pool": pool,
        "candles_h1": candles_h1,
        "candles_m15": candles_m15,
        "candles_d1": candles_d1,
        "candle_count": {
            "h1": len(candles_h1),
            "m15": len(candles_m15),
            "d1": len(candles_d1),
        },
        "entry_price": (candles_h1[0][4] if candles_h1 else None),  # close of first candle
        "current_price": (candles_h1[-1][4] if candles_h1 else None),  # close of last candle
        "token_data": {
            "symbol": token.get("symbol"),
            "score": token.get("score"),
            "fdv": token.get("fdv"),
            "volume_h24": token.get("volume_h24"),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# LIFECYCLE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════


async def process_lifecycle(current_tokens: list[dict]) -> dict[str, Any]:
    """
    Process the token lifecycle:

    1. For each current token: if no lifecycle file, create one with entry snapshot
    2. For each current token: if lifecycle exists, add periodic snapshot
    3. For each lifecycle file: if token not in current list, mark as exited
    """
    current_addresses = {t.get("contract_address", "") for t in current_tokens}
    now = time.time()

    # Stats
    new_entries = 0
    updated = 0
    exited = 0

    limits = httpx.Limits(max_connections=5)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(20, connect=5),
        limits=limits,
        headers={"User-Agent": "Mozilla/5.0 (compatible; HermesScreener/9.0)"},
    ) as client:

        # Process current tokens
        for token in current_tokens:
            addr = token.get("contract_address", "")
            if not addr:
                continue

            lifecycle = _load_lifecycle(addr)

            if not lifecycle:
                # NEW ENTRY: create lifecycle with entry snapshot
                log.info("token_entered", symbol=token.get("symbol"), address=addr[:12])
                snapshot = await take_snapshot(token, client)

                lifecycle = {
                    "address": addr,
                    "chain": token.get("chain"),
                    "symbol": token.get("symbol"),
                    "status": "active",
                    "entry_time": now,
                    "entry_time_iso": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
                    "entry_score": token.get("score"),
                    "entry_fdv": token.get("fdv"),
                    "entry_price": snapshot.get("current_price"),
                    "snapshots": [snapshot],
                    "snapshot_count": 1,
                    "exit_time": None,
                    "exit_score": None,
                    "exit_price": None,
                    "price_change_pct": None,
                    "days_tracked": 0,
                }
                _save_lifecycle(addr, lifecycle)
                generate_lifecycle_chart(addr)
                new_entries += 1

            elif lifecycle.get("status") == "active":
                # UPDATE: add periodic snapshot (every 4 hours)
                last_snapshot = lifecycle["snapshots"][-1] if lifecycle.get("snapshots") else {}
                last_time = last_snapshot.get("timestamp", 0)

                if now - last_time > 14400:  # 4 hours
                    snapshot = await take_snapshot(token, client)
                    lifecycle["snapshots"].append(snapshot)
                    lifecycle["snapshot_count"] = len(lifecycle["snapshots"])
                    lifecycle["current_score"] = token.get("score")
                    lifecycle["current_fdv"] = token.get("fdv")
                    lifecycle["days_tracked"] = round((now - lifecycle["entry_time"]) / 86400, 1)

                    # Calculate price change from entry
                    entry_price = lifecycle.get("entry_price")
                    current_price = snapshot.get("current_price")
                    if entry_price and current_price and entry_price > 0:
                        pct = ((current_price - entry_price) / entry_price) * 100
                        lifecycle["price_change_pct"] = round(pct, 2)

                    _save_lifecycle(addr, lifecycle)
                    updated += 1

        # Check for exits (tokens in lifecycle but not in current list)
        LIFECYCLE_DIR.mkdir(parents=True, exist_ok=True)
        for path in LIFECYCLE_DIR.glob("*_lifecycle.json"):
            try:
                lifecycle = json.load(open(path))
            except Exception:
                continue

            addr = lifecycle.get("address", "")
            if addr not in current_addresses and lifecycle.get("status") == "active":
                # EXITED: take final snapshot
                log.info(
                    "token_exited",
                    symbol=lifecycle.get("symbol"),
                    address=addr[:12],
                    days=lifecycle.get("days_tracked", 0),
                )

                # Try to get final snapshot
                token_data = {
                    "contract_address": addr,
                    "chain": lifecycle.get("chain"),
                    "symbol": lifecycle.get("symbol"),
                }
                final_snapshot = await take_snapshot(token_data, client)

                lifecycle["status"] = "exited"
                lifecycle["exit_time"] = now
                lifecycle["exit_time_iso"] = datetime.fromtimestamp(now, tz=timezone.utc).isoformat()
                lifecycle["exit_score"] = lifecycle.get("current_score")
                lifecycle["exit_price"] = final_snapshot.get("current_price") or lifecycle.get("current_price")

                # Final price change
                entry_price = lifecycle.get("entry_price")
                exit_price = lifecycle.get("exit_price")
                if entry_price and exit_price and entry_price > 0:
                    lifecycle["price_change_pct"] = round(((exit_price - entry_price) / entry_price) * 100, 2)

                lifecycle["final_snapshot"] = final_snapshot
                lifecycle["snapshots"].append(final_snapshot)
                lifecycle["snapshot_count"] = len(lifecycle["snapshots"])

                _save_lifecycle(addr, lifecycle)
                generate_lifecycle_chart(addr)
                generate_comparison_chart(addr)
                exited += 1

    log.info("lifecycle_processed", new_entries=new_entries, updated=updated, exited=exited)
    return {"new_entries": new_entries, "updated": updated, "exited": exited}


# ═══════════════════════════════════════════════════════════════════════════════
# CHART GENERATION
# ═══════════════════════════════════════════════════════════════════════════════


def generate_lifecycle_chart(address: str) -> str | None:
    """
    Generate a PNG chart image showing the token's lifecycle from entry to exit.

    Returns path to the generated PNG file.
    """
    import matplotlib

    matplotlib.use("Agg")  # headless
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt

    lifecycle = _load_lifecycle(address)
    if not lifecycle:
        return None

    snapshots = lifecycle.get("snapshots", [])
    if not snapshots:
        return None

    symbol = lifecycle.get("symbol", address[:8])
    status = lifecycle.get("status", "active")

    # Combine all hourly candles across snapshots
    all_candles = []
    seen_ts = set()
    for snapshot in snapshots:
        for candle in snapshot.get("candles_h1", []):
            if candle[0] not in seen_ts:
                seen_ts.add(candle[0])
                all_candles.append(candle)
    all_candles.sort(key=lambda c: c[0])

    if len(all_candles) < 2:
        return None

    # Build arrays
    dates = [datetime.fromtimestamp(c[0]) for c in all_candles]
    opens = [c[1] for c in all_candles]
    highs = [c[2] for c in all_candles]
    lows = [c[3] for c in all_candles]
    closes = [c[4] for c in all_candles]
    volumes = [c[5] or 0 for c in all_candles]

    entry_price = lifecycle.get("entry_price")
    exit_price = lifecycle.get("exit_price") or lifecycle.get("current_price")
    price_change = lifecycle.get("price_change_pct")
    entry_time = lifecycle.get("entry_time")
    exit_time = lifecycle.get("exit_time")

    # Find entry/exit indices in candle data
    entry_idx = None
    exit_idx = None
    if entry_time:
        for i, d in enumerate(dates):
            if d.timestamp() >= entry_time:
                entry_idx = i
                break
    if exit_time:
        for i, d in enumerate(dates):
            if d.timestamp() >= exit_time:
                exit_idx = i
                break

    # ── Create figure ──
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), gridspec_kw={"height_ratios": [3, 1]})
    fig.patch.set_facecolor("#0a0e17")
    ax1.set_facecolor("#0a0e17")
    ax2.set_facecolor("#0a0e17")

    # ── Candlestick chart ──
    width = 0.6
    for i in range(len(dates)):
        color = "#10b981" if closes[i] >= opens[i] else "#ef4444"

        # Body
        body_low = min(opens[i], closes[i])
        body_high = max(opens[i], closes[i])
        body_height = max(body_high - body_low, closes[i] * 0.001)  # min height
        ax1.add_patch(
            plt.Rectangle(
                (mdates.date2num(dates[i]) - width / 2, body_low),
                width,
                body_height,
                color=color,
                linewidth=0,
            )
        )

        # Wicks
        ax1.plot(
            [mdates.date2num(dates[i]), mdates.date2num(dates[i])],
            [lows[i], body_low],
            color=color,
            linewidth=0.8,
        )
        ax1.plot(
            [mdates.date2num(dates[i]), mdates.date2num(dates[i])],
            [body_high, highs[i]],
            color=color,
            linewidth=0.8,
        )

    # ── Entry/exit markers ──
    if entry_idx is not None:
        ax1.annotate(
            "ENTRY",
            xy=(mdates.date2num(dates[entry_idx]), lows[entry_idx]),
            xytext=(mdates.date2num(dates[entry_idx]), lows[entry_idx] * 0.92),
            fontsize=10,
            fontweight="bold",
            color="#06b6d4",
            ha="center",
            arrowprops=dict(arrowstyle="->", color="#06b6d4", lw=1.5),
        )

    if exit_idx is not None and status == "exited":
        ax1.annotate(
            "EXIT",
            xy=(mdates.date2num(dates[exit_idx]), highs[exit_idx]),
            xytext=(mdates.date2num(dates[exit_idx]), highs[exit_idx] * 1.08),
            fontsize=10,
            fontweight="bold",
            color="#ef4444",
            ha="center",
            arrowprops=dict(arrowstyle="->", color="#ef4444", lw=1.5),
        )

    # ── Entry price line ──
    if entry_price:
        ax1.axhline(y=entry_price, color="#06b6d4", linestyle="--", linewidth=0.8, alpha=0.5)
        ax1.text(
            mdates.date2num(dates[0]),
            entry_price,
            f" Entry: ${entry_price:.8f}",
            fontsize=7,
            color="#06b6d4",
            va="bottom",
        )

    # ── Volume bars ──
    vol_colors = ["#10b98166" if closes[i] >= opens[i] else "#ef444466" for i in range(len(dates))]
    ax2.bar([mdates.date2num(d) for d in dates], volumes, width=width, color=vol_colors)

    # ── Styling ──
    change_str = f"{'+' if (price_change or 0) > 0 else ''}{price_change}%" if price_change is not None else "—"

    ax1.set_title(
        f"{symbol} — {status.upper()} | Entry: ${entry_price:.8f} | "
        f"{'Exit' if status=='exited' else 'Now'}: ${exit_price:.8f} | {change_str}",
        color="#e5e7eb",
        fontsize=12,
        fontweight="bold",
        pad=10,
    )
    ax1.set_ylabel("Price", color="#9ca3af", fontsize=9)
    ax1.tick_params(colors="#9ca3af", labelsize=8)
    ax1.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d %H:%M"))
    ax1.tick_params(axis="x", rotation=45)
    for spine in ax1.spines.values():
        spine.set_color("#374151")
    ax1.grid(True, alpha=0.1, color="#374151")

    ax2.set_ylabel("Volume", color="#9ca3af", fontsize=9)
    ax2.tick_params(colors="#9ca3af", labelsize=8)
    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d %H:%M"))
    ax2.tick_params(axis="x", rotation=45)
    for spine in ax2.spines.values():
        spine.set_color("#374151")
    ax2.grid(True, alpha=0.1, color="#374151")

    # ── Footer info ──
    days = lifecycle.get("days_tracked", 0)
    snaps = lifecycle.get("snapshot_count", 0)
    fig.text(
        0.02,
        0.01,
        f"Tracked {days}d | {snaps} snapshots | {len(all_candles)} candles | "
        f"Entry: {lifecycle.get('entry_time_iso', '?')[:16]}",
        color="#9ca3af",
        fontsize=7,
    )

    plt.tight_layout()

    # Save PNG
    output_path = LIFECYCLE_DIR / f"{address}_lifecycle_chart.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(output_path), dpi=150, facecolor="#0a0e17", bbox_inches="tight")
    plt.close(fig)

    log.info("lifecycle_chart_generated", symbol=symbol, path=str(output_path))
    return str(output_path)


def generate_comparison_chart(address: str) -> str | None:
    """
    Generate a side-by-side comparison: entry chart vs exit chart.

    Left panel: chart from entry snapshot
    Right panel: chart from exit snapshot (or latest if still active)
    """
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt

    lifecycle = _load_lifecycle(address)
    if not lifecycle or len(lifecycle.get("snapshots", [])) < 1:
        return None

    snapshots = lifecycle["snapshots"]
    symbol = lifecycle.get("symbol", address[:8])
    status = lifecycle.get("status", "active")

    # Entry snapshot (first)
    entry_snap = snapshots[0]
    entry_candles = entry_snap.get("candles_h1", [])

    # Exit/last snapshot
    exit_snap = snapshots[-1]
    exit_candles = exit_snap.get("candles_h1", [])

    if not entry_candles or not exit_candles:
        return None

    def _plot_candles(ax, candles, title, color_bg="#0a0e17"):
        ax.set_facecolor(color_bg)
        dates = [datetime.fromtimestamp(c[0]) for c in candles]
        width = 0.6
        for i in range(len(dates)):
            color = "#10b981" if candles[i][4] >= candles[i][1] else "#ef4444"
            body_low = min(candles[i][1], candles[i][4])
            body_high = max(candles[i][1], candles[i][4])
            body_height = max(body_high - body_low, candles[i][4] * 0.001)
            ax.add_patch(
                plt.Rectangle(
                    (mdates.date2num(dates[i]) - width / 2, body_low),
                    width,
                    body_height,
                    color=color,
                    linewidth=0,
                )
            )
            ax.plot(
                [mdates.date2num(dates[i]), mdates.date2num(dates[i])],
                [candles[i][3], body_low],
                color=color,
                linewidth=0.7,
            )
            ax.plot(
                [mdates.date2num(dates[i]), mdates.date2num(dates[i])],
                [body_high, candles[i][2]],
                color=color,
                linewidth=0.7,
            )
        ax.set_title(title, color="#e5e7eb", fontsize=11, fontweight="bold")
        ax.tick_params(colors="#9ca3af", labelsize=7)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d"))
        for spine in ax.spines.values():
            spine.set_color("#374151")
        ax.grid(True, alpha=0.1, color="#374151")

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))
    fig.patch.set_facecolor("#0a0e17")

    entry_price = lifecycle.get("entry_price")
    exit_price = lifecycle.get("exit_price") or lifecycle.get("current_price")
    change = lifecycle.get("price_change_pct")
    change_str = f"{'+' if (change or 0) > 0 else ''}{change}%" if change is not None else "—"

    _plot_candles(
        ax1,
        entry_candles,
        f"ENTRY: ${entry_price:.8f}" if entry_price else "Entry Snapshot",
    )
    _plot_candles(
        ax2,
        exit_candles,
        (
            f"{'EXIT' if status=='exited' else 'NOW'}: ${exit_price:.8f} ({change_str})"
            if exit_price
            else "Exit Snapshot"
        ),
    )

    fig.suptitle(
        f"{symbol} Lifecycle Comparison — {status.upper()}",
        color="#e5e7eb",
        fontsize=14,
        fontweight="bold",
    )
    fig.text(
        0.5,
        0.02,
        f"Tracked {lifecycle.get('days_tracked', 0)} days | "
        f"Entry: {lifecycle.get('entry_time_iso', '?')[:10]} | "
        f"{'Exit: ' + str(lifecycle.get('exit_time_iso', '?'))[:10] if status=='exited' else 'Still active'}",
        ha="center",
        color="#9ca3af",
        fontsize=9,
    )

    plt.tight_layout(rect=[0, 0.04, 1, 0.95])

    output_path = LIFECYCLE_DIR / f"{address}_comparison_chart.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(output_path), dpi=150, facecolor="#0a0e17", bbox_inches="tight")
    plt.close(fig)

    log.info("comparison_chart_generated", symbol=symbol, path=str(output_path))
    return str(output_path)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════


def run_lifecycle() -> dict[str, Any]:
    """Run the lifecycle tracking pipeline (sync wrapper)."""
    import asyncio

    tokens = _load_current_tokens()
    if not tokens:
        log.warning("no_tokens_for_lifecycle")
        return {"status": "no_tokens"}

    return asyncio.run(process_lifecycle(tokens))


def _build_synthetic_candles(
    price_now: float,
    ch_h24: float,
    ch_h6: float,
    ch_h1: float,
    vol_h24: float,
    timeframe: str,
    limit: int,
):
    """Generate synthetic OHLCV candles from aggregated Dexscreener data."""
    import random
    random.seed(42)
    candles = []
    # Determine interval minutes from timeframe
    tf_minutes = {"minute": 1, "hour": 60, "day": 1440}.get(timeframe, 60)
    total_minutes = tf_minutes * limit
    # Build price trajectory backwards using change percentages
    # h24 -> h6 -> h1 gives us progressively closer anchors
    price = price_now
    for i in range(limit):
        idx = limit - i  # 1..limit
        # Approximate hourly drift based on available windows
        if total_minutes <= 60:
            drift = ch_h1 / 100.0
        elif total_minutes <= 360:
            drift = ch_h6 / 100.0
        else:
            drift = ch_h24 / 100.0
        # Per-candle volatility simulation
        vol = abs(drift) * 0.15 + 0.005
        open_p = price / (1 + drift * (idx / limit))
        close_p = price
        high_p = max(open_p, close_p) * (1 + vol * random.random())
        low_p = min(open_p, close_p) * (1 - vol * random.random())
        volume = (vol_h24 / limit) * (0.5 + random.random())
        ts = int(time.time() - (i * tf_minutes * 60))
        candles.insert(
            0,
            {
                "timestamp": ts,
                "open": round(open_p, 12),
                "high": round(high_p, 12),
                "low": round(low_p, 12),
                "close": round(close_p, 12),
                "volume": round(volume, 4),
            },
        )
        price = open_p
    return candles


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Token lifecycle tracker")
    parser.add_argument("--chart", type=str, help="Generate lifecycle chart for address")
    parser.add_argument("--snapshot", action="store_true", help="Force snapshot all tokens")
    args = parser.parse_args()

    if args.chart:
        path = generate_lifecycle_chart(args.chart)
        if path:
            print(f"Chart generated: {path}")
        else:
            print(f"No lifecycle data for {args.chart}")
        return 0

    result = run_lifecycle()
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
