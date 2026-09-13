from __future__ import annotations

import argparse
import time

import ccxt

from .adapters import AdapterConfig, CcxtPerpsAdapter
from .config import load_config
from .engine import ArbEngine
from .store import JsonlStateStore


def build_adapters(exchange_names: list[str]) -> dict[str, CcxtPerpsAdapter]:
    adapters = {}
    for ex_name in exchange_names:
        cls = getattr(ccxt, ex_name)
        client = cls({"enableRateLimit": True})
        adapters[ex_name] = CcxtPerpsAdapter(
            config=AdapterConfig(name=ex_name),
            exchange_client=client,
        )
    return adapters


def main() -> None:
    parser = argparse.ArgumentParser(description="Perps funding-rate arbitrage bot")
    parser.add_argument("--config", default="config/bot.yaml", help="Path to YAML config")
    parser.add_argument("--once", action="store_true", help="Run a single scan/execute cycle")
    parser.add_argument("--close", metavar="SYMBOL", help="Close an open pair by symbol")
    parser.add_argument("--rebalance", action="store_true", help="Generate and persist rebalance plan")
    args = parser.parse_args()

    cfg = load_config(args.config)
    adapters = build_adapters(cfg.exchanges)

    engine = ArbEngine(
        adapters=adapters,
        symbols=cfg.symbols,
        risk_limits=cfg.risk_limits,
        taker_fee_bps=cfg.taker_fee_bps,
        slippage_bps=cfg.slippage_bps,
        min_net_apr=cfg.min_net_apr,
        dry_run=cfg.dry_run,
        store=JsonlStateStore(base_dir="data"),
        max_fill_mismatch_ratio=cfg.max_fill_mismatch_ratio,
        rebalance_targets_usd=cfg.rebalance_targets_usd,
    )

    if args.close:
        result = engine.close_pair(args.close)
        print(result)
        return

    if args.rebalance:
        result = engine.rebalance()
        print(result)
        return

    if args.once:
        result = engine.run_once()
        print(result)
        return

    while True:
        result = engine.run_once()
        print(result)
        time.sleep(cfg.loop_interval_sec)


if __name__ == "__main__":
    main()
