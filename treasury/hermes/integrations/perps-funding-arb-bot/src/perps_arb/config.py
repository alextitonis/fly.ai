from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from .risk import RiskLimits


@dataclass(frozen=True)
class BotConfig:
    symbols: list[str]
    exchanges: list[str]
    dry_run: bool
    min_net_apr: float
    taker_fee_bps: float
    slippage_bps: float
    max_fill_mismatch_ratio: float
    loop_interval_sec: int
    risk_limits: RiskLimits
    rebalance_targets_usd: dict[str, float]


DEFAULT_CONFIG = {
    "symbols": ["BTC/USDT:USDT", "ETH/USDT:USDT"],
    "exchanges": ["hyperliquid", "dydx", "vertex"],
    "dry_run": True,
    "min_net_apr": 0.12,
    "taker_fee_bps": 4.0,
    "slippage_bps": 1.0,
    "max_fill_mismatch_ratio": 0.05,
    "loop_interval_sec": 45,
    "risk_limits": {
        "max_notional_per_trade": 2000,
        "max_total_notional": 10000,
        "max_open_positions": 5,
        "max_delta_usd": 30,
    },
    "rebalance_targets_usd": {
        "hyperliquid": 1500,
        "dydx": 1500,
        "vertex": 1500,
    },
}


def load_config(path: str | Path) -> BotConfig:
    p = Path(path)
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(yaml.safe_dump(DEFAULT_CONFIG, sort_keys=False), encoding="utf-8")

    cfg = yaml.safe_load(p.read_text(encoding="utf-8"))

    rl = RiskLimits(**cfg["risk_limits"])
    return BotConfig(
        symbols=cfg["symbols"],
        exchanges=cfg["exchanges"],
        dry_run=bool(cfg.get("dry_run", True)),
        min_net_apr=float(cfg["min_net_apr"]),
        taker_fee_bps=float(cfg["taker_fee_bps"]),
        slippage_bps=float(cfg["slippage_bps"]),
        max_fill_mismatch_ratio=float(cfg.get("max_fill_mismatch_ratio", 0.05)),
        loop_interval_sec=int(cfg.get("loop_interval_sec", 45)),
        risk_limits=rl,
        rebalance_targets_usd=cfg.get("rebalance_targets_usd", {}),
    )
