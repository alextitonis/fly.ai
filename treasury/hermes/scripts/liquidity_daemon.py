#!/usr/bin/env python3

import argparse
import json
import logging
import sys
from pathlib import Path

# Ensure local package imports resolve even when running as scripts/liquidity_daemon.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hermes_screener.trading.liquidity_daemon import LiquidityDaemon


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Liquidity management daemon (zero-idle objective)")
    p.add_argument("--once", action="store_true", help="Run one cycle and exit")
    p.add_argument("--loop-seconds", type=int, default=300, help="Loop delay in seconds")
    p.add_argument("--log-level", default="INFO")
    p.add_argument(
        "--live-deploy",
        action="store_true",
        help="Execute protocol-native deployment transactions (Arrakis/Gamma/Kamino executors)",
    )
    return p


def main() -> int:
    args = build_parser().parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))

    daemon = LiquidityDaemon(loop_seconds=args.loop_seconds, live_deploy=args.live_deploy)
    if args.once:
        result = daemon.run_cycle()
        print(json.dumps(result, indent=2, default=str))
        return 0

    daemon.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
