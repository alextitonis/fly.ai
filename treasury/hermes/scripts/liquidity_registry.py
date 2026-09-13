#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hermes_screener.config import settings
from hermes_screener.trading.portfolio_registry import PortfolioRegistry, TokenSpec


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Manage tracked liquidity tokens (all traded assets)")
    sub = p.add_subparsers(dest="cmd", required=True)

    add = sub.add_parser("add")
    add.add_argument("--symbol", required=True)
    add.add_argument("--chain", required=True, choices=["base", "solana"])
    add.add_argument("--address", required=True)
    add.add_argument("--decimals", required=True, type=int)

    rm = sub.add_parser("remove")
    rm.add_argument("--chain", required=True, choices=["base", "solana"])
    rm.add_argument("--address", required=True)

    sub.add_parser("list")
    return p


def main() -> int:
    args = build_parser().parse_args()
    registry = PortfolioRegistry(settings.hermes_home / "data" / "trading" / "portfolio_tokens.json")

    if args.cmd == "add":
        registry.upsert(
            TokenSpec(
                symbol=args.symbol.upper(),
                chain=args.chain,
                address=args.address,
                decimals=args.decimals,
            )
        )
    elif args.cmd == "remove":
        registry.remove(args.chain, args.address)

    items = registry.load()
    print(json.dumps([item.__dict__ for item in items], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
