"""
HuggingFace: 0xscope/web3-trading-analysis
===========================================
Dataset contains on-chain Web3 trading analysis data:
  - DEX trade records, wallet profiling, token metrics
  - Smart money wallet behavior, whale tracking

Converts to: trading decision instruction pairs

Run standalone:
  python -m hermes_screener.training.external_datasets.hf_web3_trading
"""

import json
from pathlib import Path

from .utils import (
    CACHE_DIR,
    DATASET_DIR,
    chat_sample,
    ensure_dirs,
    fmt_price,
    fmt_vol,
    install_pkg,
    reward_from_pct,
    trend_label,
    write_jsonl,
)

DATASET_ID = "0xscope/web3-trading-analysis"
OUT_NAME = "hf_web3_trading_dataset"
CACHE_PATH = CACHE_DIR / "hf_web3_trading"

SYSTEM = """You are an expert DeFi trading analyst with deep knowledge of
on-chain data, wallet behavior, and token market dynamics.
Analyze the provided Web3 trading data and give actionable insights.
Always respond with valid JSON."""


def _ensure_datasets_lib():
    try:
        import datasets  # noqa: F401

        return True
    except ImportError:
        print("Installing 'datasets' library...")
        ok = install_pkg("datasets")
        if not ok:
            print("ERROR: Could not install 'datasets'. Run: pip install datasets")
            return False
        return True


def download(cache_path: Path = CACHE_PATH) -> object:
    """Download the dataset and cache it locally."""
    if not _ensure_datasets_lib():
        return None
    import os

    from datasets import load_dataset

    cache_path.mkdir(parents=True, exist_ok=True)
    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

    print(f"Downloading {DATASET_ID} from HuggingFace...")
    try:
        ds = load_dataset(
            DATASET_ID,
            cache_dir=str(cache_path),
            token=hf_token,
            trust_remote_code=True,
        )
        print(f"Downloaded. Splits: {list(ds.keys())}")
        return ds
    except Exception as e:
        print(f"Download failed: {e}")
        print("Note: This dataset may require a HuggingFace account.")
        print("Set HF_TOKEN env var if needed.")
        return None


def _row_to_wallet_sample(row: dict) -> dict | None:
    """Convert a wallet analysis row to a training sample."""
    # Adapt to whatever columns the dataset actually has
    wallet = row.get("wallet_address", row.get("address", ""))
    if not wallet:
        return None

    # Build state description from available fields
    fields = {}
    for k in [
        "profit",
        "pnl",
        "realized_pnl",
        "unrealized_pnl",
        "win_rate",
        "total_trades",
        "avg_roi",
        "buy_count",
        "sell_count",
        "tokens_profitable",
        "total_profit",
        "entry_timing_score",
        "smart_money_tag",
        "whale_flag",
        "insider_flag",
    ]:
        if k in row and row[k] is not None:
            fields[k] = row[k]

    if not fields:
        return None

    user = "Score this wallet's trading performance and classify it.\n\nWallet Data:\n"
    for k, v in fields.items():
        user += f"  {k}: {v}\n"
    user += '\nRespond with JSON: {"wallet_score": 0-100, "classification": "smart_money|retail|bot|whale|unknown", "reasoning": "brief"}'

    # Infer a quality score from PnL signals
    pnl = float(row.get("profit") or row.get("realized_pnl") or 0)
    wr = float(row.get("win_rate") or 0)
    raw_score = min(100, max(0, (pnl / 1000 * 30) + (wr * 50) + 20))

    classification = "retail"
    if row.get("smart_money_tag") or raw_score > 70:
        classification = "smart_money"
    elif row.get("whale_flag"):
        classification = "whale"
    elif row.get("insider_flag"):
        classification = "smart_money"

    assistant = json.dumps(
        {
            "wallet_score": round(raw_score, 1),
            "classification": classification,
            "reasoning": f"Based on PnL ${pnl:,.0f} and win rate {wr:.1%}",
        }
    )
    reward = min(1.0, max(-0.5, (raw_score - 50) / 50))
    return chat_sample(SYSTEM, user, assistant, {"source": DATASET_ID, "reward": reward})


def _row_to_token_sample(row: dict) -> dict | None:
    """Convert a token metrics row to a trading decision sample."""
    symbol = row.get("symbol", row.get("token_symbol", ""))
    if not symbol:
        return None

    price_change = float(row.get("price_change_24h") or row.get("pct_change") or 0)
    volume = row.get("volume_24h", row.get("volume", 0))
    price = row.get("price", row.get("close", 0))

    user = (
        f"Analyze this token and decide whether to buy, hold, or sell.\n\n"
        f"Token: {symbol}\n"
        f"Price: {fmt_price(price)}\n"
        f"24h Change: {price_change:+.2f}%\n"
        f"Volume: {fmt_vol(volume)}\n"
    )
    for k in [
        "market_cap",
        "fdv",
        "liquidity",
        "smart_holders",
        "whale_activity",
        "social_score",
    ]:
        if row.get(k):
            user += f"{k}: {row[k]}\n"
    user += '\nRespond with JSON: {"decision": "buy"|"hold"|"sell", "confidence": 0-100, "reason": "brief"}'

    decision = "buy" if price_change > 5 else ("sell" if price_change < -5 else "hold")
    confidence = min(95, int(abs(price_change) * 3 + 40))
    assistant = json.dumps(
        {
            "decision": decision,
            "confidence": confidence,
            "reason": f"{trend_label(price_change)} momentum, {price_change:+.1f}% 24h",
        }
    )
    return chat_sample(
        SYSTEM,
        user,
        assistant,
        {"source": DATASET_ID, "reward": reward_from_pct(price_change)},
    )


def convert(ds, limit: int = 50_000) -> list:
    """Convert all dataset splits to training samples."""
    samples = []
    for split_name, split in ds.items():
        print(f"  Processing split '{split_name}': {len(split)} rows")
        for _i, row in enumerate(split):
            if len(samples) >= limit:
                break
            row = dict(row)
            # Try wallet sample first, then token sample
            s = _row_to_wallet_sample(row) or _row_to_token_sample(row)
            if s:
                samples.append(s)
    print(f"  Converted {len(samples)} samples")
    return samples


def run(limit: int = 50_000) -> dict:
    ensure_dirs()
    ds = download()
    if ds is None:
        return {"status": "failed", "reason": "download failed", "dataset": DATASET_ID}

    samples = convert(ds, limit=limit)
    if not samples:
        return {
            "status": "failed",
            "reason": "no samples converted",
            "dataset": DATASET_ID,
        }

    out = DATASET_DIR / f"{OUT_NAME}.jsonl"
    written = write_jsonl(out, samples)
    return {
        "status": "ok",
        "dataset": DATASET_ID,
        "samples": written,
        "out_file": str(out),
    }


if __name__ == "__main__":
    result = run()
    print(json.dumps(result, indent=2))
