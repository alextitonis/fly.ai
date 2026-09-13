#!/usr/bin/env python3
"""
Polymarket complete-set bot with continuous daemon mode.

This module is integrated into hermes-token-screener's trading package and can run:
- one-shot scan/decision cycle
- continuous daemon loop with lock file + runtime risk limits
"""

from __future__ import annotations

import argparse
import csv
import fcntl
import json
import math
import os
import signal
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

from hermes_screener.logging import get_logger

log = get_logger("polymarket_complete_set")

GAMMA_MARKETS_URL = "https://gamma-api.polymarket.com/markets"
DEFAULT_HOST = "https://clob.polymarket.com"
DEFAULT_GOLDSKY = (
    "https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/" "subgraphs/orderbook-subgraph/0.0.1/gn"
)
LOCK_FILE = "/tmp/hermes_polymarket_complete_set.lock"
STATE_FILE = Path.home() / ".hermes" / "data" / "token_screener" / "polymarket_bot_state.json"


@dataclass
class Leg:
    name: str
    token_id: str
    best_ask: float


@dataclass
class MarketCandidate:
    slug: str
    question: str
    condition_id: str
    yes: Leg
    no: Leg
    edge: float
    cost: float
    end_date: str | None
    poly_volume: float = 0.0
    subgraph_trades_24h: int = 0
    score: float = 0.0


def parse_json_maybe(value):
    if isinstance(value, list):
        return value
    if value is None:
        return []
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return []
    return []


def get_json(url: str, params: dict):
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    return r.json()


def normalize_gamma_market(m: dict) -> dict:
    return {
        "slug": str(m.get("slug", "")),
        "question": str(m.get("question", "")),
        "condition_id": str(m.get("conditionId", "")),
        "outcomes": parse_json_maybe(m.get("outcomes")),
        "token_ids": [str(x) for x in parse_json_maybe(m.get("clobTokenIds"))],
        "end_date": m.get("endDate"),
    }


def fetch_markets_gamma(query: str, limit: int = 200) -> list[dict]:
    params = {"active": "true", "closed": "false", "limit": str(limit)}
    raw = get_json(GAMMA_MARKETS_URL, params)
    normalized = [normalize_gamma_market(x) for x in raw]
    q = query.lower().strip()
    if not q:
        return normalized
    terms = [t for t in q.replace("-", " ").split() if t]
    out = []
    for m in normalized:
        hay = f"{m.get('question','')} {m.get('slug','')}".lower()
        if q in hay or all(term in hay for term in terms):
            out.append(m)
    return out


def fetch_markets_pmxt(query: str, limit: int = 200) -> list[dict]:
    try:
        import pmxt
    except Exception as e:
        raise RuntimeError("pmxt is not installed. Install with: pip install pmxt") from e

    ex = pmxt.Polymarket()
    raw = ex.fetch_markets(query=query, limit=limit)
    out = []
    for m in raw:
        yes = getattr(m, "yes", None)
        no = getattr(m, "no", None)
        if yes is None or no is None:
            continue
        yes_token = str(getattr(yes, "outcome_id", "") or yes.metadata.get("clobTokenId", ""))
        no_token = str(getattr(no, "outcome_id", "") or no.metadata.get("clobTokenId", ""))
        if not yes_token or not no_token:
            continue
        out.append(
            {
                "slug": str(getattr(m, "slug", "")),
                "question": str(getattr(m, "title", "") or getattr(m, "question", "")),
                "condition_id": str(getattr(m, "contract_address", "") or getattr(m, "market_id", "")),
                "outcomes": ["Yes", "No"],
                "token_ids": [yes_token, no_token],
                "end_date": str(getattr(m, "resolution_date", "")) or None,
            }
        )
    return out


def top_ask_clob(client, token_id: str) -> float | None:
    try:
        book = client.get_order_book(token_id)
    except Exception:
        return None
    asks = getattr(book, "asks", None) or []
    prices = []
    for ask in asks:
        p = getattr(ask, "price", None)
        if p is None:
            continue
        try:
            prices.append(float(p))
        except Exception:
            pass
    return min(prices) if prices else None


def top_ask_pmxt(exchange, token_id: str) -> float | None:
    try:
        from pmxt.models import MarketOutcome

        outcome = MarketOutcome(outcome_id=token_id, label="", price=0.0)
        ob = exchange.fetch_order_book(outcome)
        asks = getattr(ob, "asks", None) or []
        if not asks:
            return None
        return float(min(a.price for a in asks))
    except Exception:
        return None


def load_poly_data_volume_map(poly_data_dir: str) -> dict[str, float]:
    markets_csv = Path(poly_data_dir) / "markets.csv"
    if not markets_csv.exists():
        return {}
    mapping = {}
    with markets_csv.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            slug = (row.get("market_slug") or "").strip()
            if not slug:
                continue
            try:
                mapping[slug] = float(row.get("volume") or 0.0)
            except Exception:
                mapping[slug] = 0.0
    return mapping


def fetch_subgraph_trades_count(token_ids: list[str], endpoint: str, lookback_hours: int = 24) -> int:
    if not token_ids:
        return 0
    ts = int(time.time()) - lookback_hours * 3600
    q = """
query Q($ts: String!, $ids: [String!]) {
  a: orderFilledEvents(first: 1000, where: {timestamp_gt: $ts, makerAssetId_in: $ids}) { transactionHash }
  b: orderFilledEvents(first: 1000, where: {timestamp_gt: $ts, takerAssetId_in: $ids}) { transactionHash }
}
"""
    try:
        r = requests.post(endpoint, json={"query": q, "variables": {"ts": str(ts), "ids": token_ids}}, timeout=20)
        r.raise_for_status()
        data = r.json().get("data", {})
        txs = set()
        for k in ["a", "b"]:
            for row in data.get(k, []) or []:
                h = row.get("transactionHash")
                if h:
                    txs.add(h)
        return len(txs)
    except Exception:
        return 0


def build_candidate(market: dict, top_ask_fn: Callable[[str], float | None]) -> MarketCandidate | None:
    outcomes = market.get("outcomes", [])
    token_ids = market.get("token_ids", [])
    if len(outcomes) != 2 or len(token_ids) != 2:
        return None

    low = [o.lower() for o in outcomes]
    yes_idx = low.index("yes") if "yes" in low else 0
    no_idx = low.index("no") if "no" in low else 1

    yes_token = str(token_ids[yes_idx])
    no_token = str(token_ids[no_idx])
    yes_ask = top_ask_fn(yes_token)
    no_ask = top_ask_fn(no_token)
    if yes_ask is None or no_ask is None:
        return None

    cost = yes_ask + no_ask
    edge = 1.0 - cost

    return MarketCandidate(
        slug=str(market.get("slug", "")),
        question=str(market.get("question", "")),
        condition_id=str(market.get("condition_id", "")),
        yes=Leg(name="YES", token_id=yes_token, best_ask=yes_ask),
        no=Leg(name="NO", token_id=no_token, best_ask=no_ask),
        edge=edge,
        cost=cost,
        end_date=market.get("end_date"),
    )


def choose_best_candidate(
    markets: list[dict],
    top_ask_fn,
    poly_volume_map: dict[str, float],
    poly_volume_weight: float,
    use_subgraph: bool,
    subgraph_endpoint: str,
) -> MarketCandidate | None:
    best = None
    for m in markets:
        c = build_candidate(m, top_ask_fn)
        if c is None:
            continue
        c.poly_volume = float(poly_volume_map.get(c.slug, 0.0))
        c.subgraph_trades_24h = (
            fetch_subgraph_trades_count([c.yes.token_id, c.no.token_id], subgraph_endpoint, lookback_hours=24)
            if use_subgraph
            else 0
        )
        volume_bonus = poly_volume_weight * math.log10(1.0 + c.poly_volume)
        subgraph_bonus = 0.0005 * math.log10(1.0 + c.subgraph_trades_24h) if use_subgraph else 0.0
        c.score = c.edge + volume_bonus + subgraph_bonus

        if best is None or c.score > best.score:
            best = c
    return best


def init_live_client_v1(host: str):
    try:
        from py_clob_client.client import ClobClient
        from py_clob_client.clob_types import ApiCreds
    except Exception as e:
        raise RuntimeError("py-clob-client is not installed. Install with: pip install py-clob-client") from e

    pk = os.getenv("PK")
    if not pk:
        raise RuntimeError("LIVE mode requires PK in env")

    api_key = os.getenv("CLOB_API_KEY")
    secret = os.getenv("CLOB_SECRET")
    passphrase = os.getenv("CLOB_PASS_PHRASE")
    funder = os.getenv("FUNDER")
    chain_id = int(os.getenv("CHAIN_ID", "137"))

    signature_type = 1 if funder else 0
    client = ClobClient(host, key=pk, chain_id=chain_id, signature_type=signature_type, funder=funder)

    if api_key and secret and passphrase:
        client.set_api_creds(ApiCreds(api_key=api_key, api_secret=secret, api_passphrase=passphrase))
    else:
        client.set_api_creds(client.create_or_derive_api_creds())
    return client


def init_live_client_v2(host: str):
    try:
        from py_clob_client_v2 import ApiCreds
        from py_clob_client_v2 import ClobClient as ClobClientV2
    except Exception as e:
        raise RuntimeError("py-clob-client-v2 is not installed. Install with: pip install py-clob-client-v2") from e

    pk = os.getenv("PK")
    if not pk:
        raise RuntimeError("LIVE mode requires PK in env")

    chain_id = int(os.getenv("CHAIN_ID", "137"))
    api_key = os.getenv("CLOB_API_KEY")
    secret = os.getenv("CLOB_SECRET")
    passphrase = os.getenv("CLOB_PASS_PHRASE")

    client = ClobClientV2(host=host, chain_id=chain_id, key=pk)
    if api_key and secret and passphrase:
        client.set_api_creds(ApiCreds(api_key=api_key, api_secret=secret, api_passphrase=passphrase))
    else:
        client.set_api_creds(client.create_or_derive_api_key())
    return client


def place_market_buy_v1(client, token_id: str, amount_usdc: float):
    from py_clob_client.clob_types import MarketOrderArgs, OrderType
    from py_clob_client.order_builder.constants import BUY

    order = MarketOrderArgs(token_id=token_id, amount=amount_usdc, side=BUY, order_type=OrderType.FOK)
    signed = client.create_market_order(order)
    return client.post_order(signed, OrderType.FOK)


def place_market_buy_v2(client, token_id: str, amount_usdc: float):
    from py_clob_client_v2 import MarketOrderArgs, OrderType, PartialCreateOrderOptions, Side

    return client.create_and_post_market_order(
        order_args=MarketOrderArgs(token_id=token_id, amount=amount_usdc, side=Side.BUY, order_type=OrderType.FOK),
        options=PartialCreateOrderOptions(tick_size="0.01"),
        order_type=OrderType.FOK,
    )


def csv_safe(text: str) -> str:
    return str(text).replace('"', "''").replace("\n", " ")


def append_log(path: Path, row: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    new_file = not path.exists()
    with path.open("a", encoding="utf-8") as f:
        if new_file:
            f.write(
                "timestamp_utc,mode,query,slug,yes_ask,no_ask,cost,edge,score,poly_volume,subgraph_trades_24h,shares,"
                "yes_usdc,no_usdc,status,details\n"
            )
        f.write(row + "\n")


def load_state(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "cycles": 0,
        "errors": 0,
        "skips": 0,
        "paper_trades": 0,
        "live_trades": 0,
        "daily_pnl_usd": 0.0,
    }


def save_state(path: Path, state: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def rotate_state_date_if_needed(state: dict):
    today = datetime.now(timezone.utc).date().isoformat()
    if state.get("date") != today:
        state["date"] = today
        state["cycles"] = 0
        state["errors"] = 0
        state["skips"] = 0
        state["paper_trades"] = 0
        state["live_trades"] = 0
        state["daily_pnl_usd"] = 0.0


def run_cycle(args: argparse.Namespace, state: dict) -> dict:
    rotate_state_date_if_needed(state)
    state["cycles"] += 1

    markets = fetch_markets_gamma(args.query) if args.market_source == "gamma" else fetch_markets_pmxt(args.query)
    if not markets:
        raise RuntimeError(f"No active markets matched query='{args.query}' via source='{args.market_source}'")

    poly_volume_map = load_poly_data_volume_map(args.poly_data_dir)

    if args.quote_source == "clob":
        client = (
            init_live_client_v1(args.host)
            if args.mode == "live"
            else __import__("py_clob_client.client", fromlist=["ClobClient"]).ClobClient(args.host)
        )

        def top_ask_fn(tok):
            return top_ask_clob(client, tok)

    else:
        try:
            import pmxt
        except Exception as e:
            raise RuntimeError("pmxt is not installed. Install with: pip install pmxt") from e
        ex = pmxt.Polymarket()

        def top_ask_fn(tok):
            return top_ask_pmxt(ex, tok)

    candidate = choose_best_candidate(
        markets=markets,
        top_ask_fn=top_ask_fn,
        poly_volume_map=poly_volume_map,
        poly_volume_weight=args.poly_volume_weight,
        use_subgraph=args.use_subgraph_signal,
        subgraph_endpoint=args.subgraph_endpoint,
    )
    if candidate is None:
        raise RuntimeError("No binary market with available asks found")

    shares = args.stake_usdc / candidate.cost
    yes_usdc = shares * candidate.yes.best_ask
    no_usdc = shares * candidate.no.best_ask

    ts = datetime.now(timezone.utc).isoformat()
    log.info(
        "cycle_candidate",
        mode=args.mode,
        slug=candidate.slug,
        edge=round(candidate.edge, 6),
        score=round(candidate.score, 6),
        yes_ask=round(candidate.yes.best_ask, 6),
        no_ask=round(candidate.no.best_ask, 6),
    )

    if candidate.edge < args.min_edge:
        state["skips"] += 1
        msg = f"SKIP: edge {candidate.edge:.4f} below min-edge {args.min_edge:.4f}"
        append_log(
            Path(args.log_file),
            f"{ts},{args.mode},{args.query},{candidate.slug},{candidate.yes.best_ask:.6f},{candidate.no.best_ask:.6f},"
            f"{candidate.cost:.6f},{candidate.edge:.6f},{candidate.score:.6f},{candidate.poly_volume:.6f},"
            f'{candidate.subgraph_trades_24h},{shares:.6f},{yes_usdc:.6f},{no_usdc:.6f},SKIP,"{csv_safe(msg)}"',
        )
        return {"status": "skip", "edge": candidate.edge}

    if args.mode == "paper":
        state["paper_trades"] += 1
        msg = "PAPER: no live orders sent"
        append_log(
            Path(args.log_file),
            f"{ts},{args.mode},{args.query},{candidate.slug},{candidate.yes.best_ask:.6f},{candidate.no.best_ask:.6f},"
            f"{candidate.cost:.6f},{candidate.edge:.6f},{candidate.score:.6f},{candidate.poly_volume:.6f},"
            f'{candidate.subgraph_trades_24h},{shares:.6f},{yes_usdc:.6f},{no_usdc:.6f},PAPER,"{csv_safe(msg)}"',
        )
        return {"status": "paper", "edge": candidate.edge}

    if args.executor == "clob-v1":
        live_client = init_live_client_v1(args.host)
        yes_resp = place_market_buy_v1(live_client, candidate.yes.token_id, yes_usdc)
        time.sleep(0.2)
        no_resp = place_market_buy_v1(live_client, candidate.no.token_id, no_usdc)
    else:
        live_client = init_live_client_v2(args.host)
        yes_resp = place_market_buy_v2(live_client, candidate.yes.token_id, yes_usdc)
        time.sleep(0.2)
        no_resp = place_market_buy_v2(live_client, candidate.no.token_id, no_usdc)

    details = json.dumps({"yes": yes_resp, "no": no_resp})
    state["live_trades"] += 1

    append_log(
        Path(args.log_file),
        f"{ts},{args.mode},{args.query},{candidate.slug},{candidate.yes.best_ask:.6f},{candidate.no.best_ask:.6f},"
        f"{candidate.cost:.6f},{candidate.edge:.6f},{candidate.score:.6f},{candidate.poly_volume:.6f},"
        f'{candidate.subgraph_trades_24h},{shares:.6f},{yes_usdc:.6f},{no_usdc:.6f},LIVE,"{csv_safe(details)}"',
    )
    return {"status": "live", "edge": candidate.edge, "details": details}


def acquire_lock():
    fd = open(LOCK_FILE, "a+")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as err:
        raise RuntimeError("Another polymarket daemon instance is already running") from err
    try:
        fd.seek(0)
        fd.truncate(0)
        fd.write(str(os.getpid()))
        fd.flush()
    except OSError:
        # If /tmp is full, keep running with in-memory file lock only.
        pass
    return fd


def release_lock(fd):
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
        fd.close()
        if os.path.exists(LOCK_FILE):
            os.unlink(LOCK_FILE)
    except Exception:
        pass


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Polymarket complete-set trading bot (one-shot or daemon mode)")
    p.add_argument("--query", required=True)
    p.add_argument("--min-edge", type=float, default=0.01)
    p.add_argument("--stake-usdc", type=float, default=20.0)
    p.add_argument("--mode", choices=["paper", "live"], default="paper")
    p.add_argument("--host", default=os.getenv("CLOB_API_URL", DEFAULT_HOST))
    p.add_argument("--log-file", default="logs/polymarket_trades.csv")

    p.add_argument("--market-source", choices=["gamma", "pmxt"], default="gamma")
    p.add_argument("--quote-source", choices=["clob", "pmxt"], default="clob")
    p.add_argument("--executor", choices=["clob-v1", "clob-v2"], default="clob-v1")

    p.add_argument("--poly-data-dir", default=str(Path(__file__).resolve().parents[2] / "data"))
    p.add_argument("--poly-volume-weight", type=float, default=0.0)
    p.add_argument("--use-subgraph-signal", action="store_true")
    p.add_argument("--subgraph-endpoint", default=DEFAULT_GOLDSKY)

    p.add_argument("--daemon", action="store_true", help="Run continuously")
    p.add_argument("--interval-seconds", type=int, default=60)
    p.add_argument("--max-iterations", type=int, default=0, help="0 means unlimited")
    p.add_argument("--max-runtime-minutes", type=int, default=0, help="0 means unlimited")
    p.add_argument("--max-daily-loss-usd", type=float, default=0.0, help="0 disables daily loss stop")
    p.add_argument("--cooldown-on-error-seconds", type=int, default=30)
    return p


def run(args: argparse.Namespace) -> int:
    load_dotenv(os.path.expanduser("~/.hermes/.env"))

    if not args.daemon:
        state = load_state(STATE_FILE)
        try:
            result = run_cycle(args, state)
            log.info("cycle_done", result=result)
            save_state(STATE_FILE, state)
            return 0
        except Exception as e:
            state["errors"] = state.get("errors", 0) + 1
            save_state(STATE_FILE, state)
            log.error("cycle_failed", error=str(e))
            return 1

    start = time.time()
    lock_fd = acquire_lock()
    should_stop = {"value": False}

    def _stop_handler(signum, frame):
        should_stop["value"] = True
        log.info("daemon_signal_stop", signal=signum)

    signal.signal(signal.SIGINT, _stop_handler)
    signal.signal(signal.SIGTERM, _stop_handler)

    state = load_state(STATE_FILE)
    daemon_cycles = 0

    log.info(
        "daemon_start",
        interval_seconds=args.interval_seconds,
        mode=args.mode,
        query=args.query,
        max_iterations=args.max_iterations,
        max_runtime_minutes=args.max_runtime_minutes,
        max_daily_loss_usd=args.max_daily_loss_usd,
    )

    try:
        while not should_stop["value"]:
            rotate_state_date_if_needed(state)

            if args.max_iterations and daemon_cycles >= args.max_iterations:
                log.info("daemon_stop_max_iterations", daemon_cycles=daemon_cycles)
                break

            if args.max_runtime_minutes:
                elapsed_min = (time.time() - start) / 60.0
                if elapsed_min >= args.max_runtime_minutes:
                    log.info("daemon_stop_max_runtime", elapsed_minutes=round(elapsed_min, 2))
                    break

            if args.max_daily_loss_usd > 0 and state.get("daily_pnl_usd", 0.0) <= -abs(args.max_daily_loss_usd):
                log.error("daemon_stop_daily_loss", daily_pnl_usd=state.get("daily_pnl_usd", 0.0))
                break

            try:
                result = run_cycle(args, state)
                daemon_cycles += 1
                log.info(
                    "daemon_cycle", result=result, daemon_cycles=daemon_cycles, total_cycles=state.get("cycles", 0)
                )
            except Exception as e:
                state["errors"] = state.get("errors", 0) + 1
                daemon_cycles += 1
                log.error("daemon_cycle_failed", error=str(e), cooldown=args.cooldown_on_error_seconds)
                save_state(STATE_FILE, state)
                time.sleep(max(1, args.cooldown_on_error_seconds))
                continue

            save_state(STATE_FILE, state)
            time.sleep(max(1, args.interval_seconds))

    finally:
        save_state(STATE_FILE, state)
        release_lock(lock_fd)
        log.info("daemon_exit", state=state)

    return 0


def main():
    parser = build_parser()
    args = parser.parse_args()
    raise SystemExit(run(args))


if __name__ == "__main__":
    main()
