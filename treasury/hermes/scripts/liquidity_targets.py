#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hermes_screener.config import settings


def _path() -> Path:
    return settings.hermes_home / "data" / "trading" / "liquidity_targets.json"


def _load() -> list[dict]:
    p = _path()
    if not p.exists():
        return []
    return json.loads(p.read_text())


def _save(items: list[dict]) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(items, indent=2))


def _upsert(item: dict) -> None:
    items = _load()
    items = [x for x in items if x.get("id") != item["id"]]
    items.append(item)
    _save(sorted(items, key=lambda x: x.get("id", "")))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Manage liquidity protocol targets by opportunity id")
    sub = p.add_subparsers(dest="cmd", required=True)

    add_arr = sub.add_parser("add-arrakis")
    add_arr.add_argument("--id", required=True)
    add_arr.add_argument("--vault", required=True)
    add_arr.add_argument("--resolver", required=True)

    add_gamma = sub.add_parser("add-gamma")
    add_gamma.add_argument("--id", required=True)
    add_gamma.add_argument("--manager", required=True)
    add_gamma.add_argument("--token0-symbol", required=True)
    add_gamma.add_argument("--token1-symbol", required=True)

    add_kamino = sub.add_parser("add-kamino")
    add_kamino.add_argument("--id", required=True)
    add_kamino.add_argument("--strategy", required=True)
    add_kamino.add_argument("--slippage-bps", type=int, default=50)

    rm = sub.add_parser("remove")
    rm.add_argument("--id", required=True)

    sub.add_parser("list")
    return p


def main() -> int:
    args = build_parser().parse_args()

    if args.cmd == "add-arrakis":
        _upsert(
            {
                "id": args.id,
                "protocol": "arrakis",
                "chain": "base",
                "vault": args.vault,
                "resolver": args.resolver,
            }
        )
    elif args.cmd == "add-gamma":
        _upsert(
            {
                "id": args.id,
                "protocol": "gamma",
                "chain": "base",
                "manager": args.manager,
                "token0_symbol": args.token0_symbol.upper(),
                "token1_symbol": args.token1_symbol.upper(),
            }
        )
    elif args.cmd == "add-kamino":
        _upsert(
            {
                "id": args.id,
                "protocol": "kamino",
                "chain": "solana",
                "strategy": args.strategy,
                "slippage_bps": args.slippage_bps,
            }
        )
    elif args.cmd == "remove":
        items = [x for x in _load() if x.get("id") != args.id]
        _save(items)

    print(json.dumps(_load(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
