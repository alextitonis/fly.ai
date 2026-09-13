"""
Kaggle OHLCV Dataset Adapter (shared logic for all three Kaggle sources)
========================================================================
Handles download + conversion for:
  - ranodipghosh/top-50-crypto-market-data-daily-usd
  - abdullahkhan70/daily-multi-year-ohlcv-crypto-market-data
  - mihikaajayjadhav/top-100-cryptocurrencies-daily-price-data-2025

Each dataset is OHLCV price history. We convert daily candles into:
  1. Price action analysis prompts (what does today's candle mean?)
  2. Next-day direction prediction (given N days of history, predict tomorrow)
  3. Entry/exit timing questions (is now a good time to buy/sell?)

Run all three:
  python -m hermes_screener.training.external_datasets.kaggle_ohlcv

Run single:
  python -m hermes_screener.training.external_datasets.kaggle_ohlcv \
    --dataset ranodipghosh/top-50-crypto-market-data-daily-usd
"""

import argparse
import csv
import json
from collections.abc import Iterator
from pathlib import Path

from .utils import (
    CACHE_DIR,
    DATASET_DIR,
    chat_sample,
    check_kaggle_credentials,
    ensure_dirs,
    fmt_price,
    fmt_vol,
    install_pkg,
    pct_change,
    reward_from_pct,
    trend_label,
    write_jsonl,
)

# -------------------------------------------------------------------
# Dataset registry
# -------------------------------------------------------------------
KAGGLE_DATASETS = {
    "top50_daily": {
        "id": "ranodipghosh/top-50-crypto-market-data-daily-usd",
        "out_name": "kaggle_top50_daily_dataset",
        "desc": "Top 50 crypto daily USD market data",
    },
    "ohlcv_multi": {
        "id": "abdullahkhan70/daily-multi-year-ohlcv-crypto-market-data",
        "out_name": "kaggle_ohlcv_multiyear_dataset",
        "desc": "Multi-year daily OHLCV crypto data",
    },
    "top100_2025": {
        "id": "mihikaajayjadhav/top-100-cryptocurrencies-daily-price-data-2025",
        "out_name": "kaggle_top100_2025_dataset",
        "desc": "Top 100 crypto daily price data 2025",
    },
}

SYSTEM_PRICE = """You are an expert cryptocurrency trader and technical analyst.
Analyze the provided price action data and give precise trading insights.
Consider momentum, volume, volatility, and trend. Respond with valid JSON."""

SYSTEM_PREDICT = """You are an expert cryptocurrency price analyst.
Given historical OHLCV data, predict the next day's likely direction
and provide a confidence-weighted trading recommendation.
Respond with valid JSON."""


def _ensure_kaggle_lib() -> bool:
    try:
        import kaggle  # noqa: F401

        return True
    except ImportError:
        print("Installing 'kaggle' library...")
        ok = install_pkg("kaggle")
        if not ok:
            print("ERROR: Could not install 'kaggle'. Run: pip install kaggle")
            return False
        return True


def download_dataset(dataset_id: str, cache_dir: Path) -> Path | None:
    """
    Download a Kaggle dataset. Returns the extracted directory path.
    Caches under ~/.hermes/data/external/kaggle/<dataset_slug>/
    """
    ok, msg = check_kaggle_credentials()
    if not ok:
        print(f"SETUP REQUIRED:\n{msg}")
        return None

    if not _ensure_kaggle_lib():
        return None

    slug = dataset_id.replace("/", "_")
    dest = cache_dir / "kaggle" / slug
    if dest.exists() and any(dest.iterdir()):
        print(f"Using cached: {dest}")
        return dest

    dest.mkdir(parents=True, exist_ok=True)
    try:
        import kaggle  # noqa: F401

        print(f"Downloading Kaggle dataset: {dataset_id}")
        kaggle.api.authenticate()
        kaggle.api.dataset_download_files(
            dataset_id,
            path=str(dest),
            unzip=True,
            quiet=False,
        )
        print(f"Downloaded to: {dest}")
        return dest
    except Exception as e:
        print(f"Download error: {e}")
        return None


def _find_csv_files(directory: Path) -> list:
    """Find all CSV files in a directory (recursive)."""
    return sorted(directory.rglob("*.csv"))


def _infer_columns(header: list) -> dict:
    """
    Map fuzzy column names to canonical names.
    Returns dict: canonical_name -> actual_column_name
    """
    h_lower = {c.lower().strip(): c for c in header}
    mapping = {}

    for canon, candidates in {
        "date": ["date", "time", "timestamp", "day"],
        "open": ["open", "open_price", "open_usd"],
        "high": ["high", "high_price", "high_usd"],
        "low": ["low", "low_price", "low_usd"],
        "close": ["close", "close_price", "close_usd", "price", "price_usd"],
        "volume": ["volume", "vol", "volume_usd", "volume_24h"],
        "symbol": ["symbol", "name", "coin", "cryptocurrency", "asset", "ticker"],
        "market_cap": ["market_cap", "marketcap", "market cap"],
    }.items():
        for c in candidates:
            if c in h_lower:
                mapping[canon] = h_lower[c]
                break
    return mapping


def _parse_csv_rows(csv_path: Path) -> Iterator[dict]:
    """Parse a CSV file, yielding normalized row dicts."""
    with open(csv_path, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return
        col_map = _infer_columns(list(reader.fieldnames))
        if "close" not in col_map:
            return  # not a price file

        for raw in reader:
            row = {}
            for canon, actual in col_map.items():
                val = raw.get(actual, "").strip()
                row[canon] = val
            if row.get("close"):
                yield row


# -------------------------------------------------------------------
# Sample generators
# -------------------------------------------------------------------


def _candle_analysis_sample(rows: list, symbol: str) -> dict | None:
    """
    Single candle analysis: given today's OHLCV, what does it mean?
    """
    if len(rows) < 2:
        return None
    today = rows[-1]
    prev = rows[-2]
    try:
        o, h, low, c = (
            float(today["open"]),
            float(today["high"]),
            float(today["low"]),
            float(today["close"]),
        )
        pc = float(prev["close"])
    except (ValueError, KeyError):
        return None

    day_chg = pct_change(o, c)
    vs_prev = pct_change(pc, c)
    body_pct = abs(c - o) / (h - low) * 100 if (h - low) > 0 else 0
    upper_wick = (h - max(o, c)) / (h - low) * 100 if (h - low) > 0 else 0
    lower_wick = (min(o, c) - low) / (h - low) * 100 if (h - low) > 0 else 0
    vol_str = fmt_vol(today.get("volume", 0))

    user = (
        f"Analyze today's candle for {symbol}.\n\n"
        f"Date: {today.get('date', 'unknown')}\n"
        f"Open:  {fmt_price(o)}\n"
        f"High:  {fmt_price(h)}\n"
        f"Low:   {fmt_price(low)}\n"
        f"Close: {fmt_price(c)}\n"
        f"Volume: {vol_str}\n"
        f"Day change: {day_chg:+.2f}%\n"
        f"vs Previous close: {vs_prev:+.2f}%\n"
        f"Body: {body_pct:.0f}%  Upper wick: {upper_wick:.0f}%  Lower wick: {lower_wick:.0f}%\n"
        '\nRespond with JSON: {"trend": "bullish|bearish|neutral", '
        '"signal": "buy|sell|hold|watch", "confidence": 0-100, '
        '"pattern": "candle pattern name", "reasoning": "brief"}'
    )
    signal = "buy" if vs_prev > 3 else ("sell" if vs_prev < -3 else "hold")
    pattern = (
        "doji"
        if body_pct < 10
        else (
            "hammer"
            if lower_wick > 60
            else ("shooting_star" if upper_wick > 60 else "marubozu" if body_pct > 80 else "standard")
        )
    )
    assistant = json.dumps(
        {
            "trend": trend_label(vs_prev),
            "signal": signal,
            "confidence": min(90, int(abs(vs_prev) * 4 + 40)),
            "pattern": pattern,
            "reasoning": f"{vs_prev:+.1f}% vs prior close, {body_pct:.0f}% body candle",
        }
    )
    return chat_sample(
        SYSTEM_PRICE,
        user,
        assistant,
        {"source": "kaggle_ohlcv", "reward": reward_from_pct(vs_prev)},
    )


def _prediction_sample(rows: list, symbol: str, lookback: int = 7) -> dict | None:
    """
    Given N days of history, predict the next day's direction.
    Only generated when we have N+1 days (so we know the actual outcome).
    """
    if len(rows) < lookback + 1:
        return None

    history = rows[-(lookback + 1) : -1]
    actual = rows[-1]
    try:
        actual_close = float(actual["close"])
        prev_close = float(history[-1]["close"])
    except (ValueError, KeyError):
        return None

    actual_chg = pct_change(prev_close, actual_close)

    hist_lines = []
    for r in history:
        try:
            line = (
                f"  {r.get('date','?')}: "
                f"O={fmt_price(r['open'])} H={fmt_price(r['high'])} "
                f"L={fmt_price(r['low'])} C={fmt_price(r['close'])} "
                f"Vol={fmt_vol(r.get('volume',0))}"
            )
            hist_lines.append(line)
        except Exception:
            pass

    user = (
        f"Predict the next day's price direction for {symbol} "
        f"based on the last {lookback} days.\n\n"
        f"Historical OHLCV:\n" + "\n".join(hist_lines) + '\n\nRespond with JSON: {"direction": "up|down|sideways", '
        '"confidence": 0-100, '
        '"predicted_change_pct": float, '
        '"reasoning": "brief technical analysis"}'
    )
    direction = "up" if actual_chg > 1 else ("down" if actual_chg < -1 else "sideways")
    pred_chg = round(actual_chg * 0.8, 2)  # regressed estimate
    assistant = json.dumps(
        {
            "direction": direction,
            "confidence": min(85, int(abs(actual_chg) * 3 + 35)),
            "predicted_change_pct": pred_chg,
            "reasoning": f"Actual next-day change was {actual_chg:+.2f}%",
        }
    )
    return chat_sample(
        SYSTEM_PREDICT,
        user,
        assistant,
        {"source": "kaggle_ohlcv", "reward": reward_from_pct(actual_chg)},
    )


def _entry_timing_sample(rows: list, symbol: str) -> dict | None:
    """
    Is now a good entry point? Uses recent price action to judge.
    """
    if len(rows) < 14:
        return None
    recent = rows[-14:]
    try:
        closes = [float(r["close"]) for r in recent]
    except (ValueError, KeyError):
        return None

    ma7 = sum(closes[-7:]) / 7
    ma14 = sum(closes) / 14
    latest = closes[-1]
    momentum_7 = pct_change(closes[-8], closes[-1])
    volatility = (max(closes[-7:]) - min(closes[-7:])) / ma7 * 100

    above_ma7 = latest > ma7
    above_ma14 = latest > ma14
    trending = momentum_7 > 5

    verdict = (
        "good_entry"
        if (above_ma7 and above_ma14 and trending)
        else "wait" if (not above_ma7 and not above_ma14) else "caution"
    )

    user = (
        f"Is now a good entry point for {symbol}?\n\n"
        f"Current price: {fmt_price(latest)}\n"
        f"7-day MA: {fmt_price(ma7)}\n"
        f"14-day MA: {fmt_price(ma14)}\n"
        f"7-day momentum: {momentum_7:+.2f}%\n"
        f"7-day volatility: {volatility:.1f}%\n"
        f"Above 7d MA: {'Yes' if above_ma7 else 'No'}\n"
        f"Above 14d MA: {'Yes' if above_ma14 else 'No'}\n"
        '\nRespond with JSON: {"verdict": "good_entry|caution|wait|avoid", '
        '"confidence": 0-100, "reasoning": "brief"}'
    )
    assistant = json.dumps(
        {
            "verdict": verdict,
            "confidence": 65 if verdict == "caution" else 75,
            "reasoning": (
                f"Price {'above' if above_ma7 else 'below'} 7d MA, "
                f"{momentum_7:+.1f}% momentum, {volatility:.1f}% vol"
            ),
        }
    )
    reward = 0.4 if verdict == "good_entry" else (-0.2 if verdict == "avoid" else 0.0)
    return chat_sample(SYSTEM_PRICE, user, assistant, {"source": "kaggle_ohlcv", "reward": reward})


# -------------------------------------------------------------------
# Main conversion
# -------------------------------------------------------------------


def convert_csv_dir(data_dir: Path, dataset_id: str, limit: int = 30_000) -> list:
    """Convert all CSVs in a directory to training samples."""
    samples = []
    csv_files = _find_csv_files(data_dir)
    if not csv_files:
        print(f"  No CSV files found in {data_dir}")
        return []
    print(f"  Found {len(csv_files)} CSV file(s)")

    for csv_path in csv_files:
        symbol = csv_path.stem.upper().split("_")[0]  # best-effort symbol from filename
        rows_by_sym: dict[str, list] = {}

        for row in _parse_csv_rows(csv_path):
            sym = row.get("symbol", symbol).upper()
            rows_by_sym.setdefault(sym, []).append(row)

        for sym, rows in rows_by_sym.items():
            # Sort by date if available
            try:
                rows.sort(key=lambda r: r.get("date", ""))
            except Exception:
                pass

            # Generate different sample types from the same data
            for i in range(1, len(rows)):
                if len(samples) >= limit:
                    break
                window = rows[max(0, i - 20) : i + 1]

                s = _candle_analysis_sample(window, sym)
                if s:
                    samples.append(s)

                if i >= 8:
                    s = _prediction_sample(window, sym, lookback=7)
                    if s:
                        samples.append(s)

                if i >= 14:
                    s = _entry_timing_sample(window, sym)
                    if s:
                        samples.append(s)

            if len(samples) >= limit:
                break

    print(f"  Generated {len(samples)} samples from {dataset_id}")
    return samples


def run_single(key: str, limit: int = 30_000) -> dict:
    """Download and convert one Kaggle dataset by key."""
    ensure_dirs()
    cfg = KAGGLE_DATASETS[key]
    dataset_id = cfg["id"]
    out_name = cfg["out_name"]

    print(f"\n{'='*60}")
    print(f"Dataset: {dataset_id}")
    print(f"{'='*60}")

    data_dir = download_dataset(dataset_id, CACHE_DIR)
    if data_dir is None:
        return {"status": "failed", "reason": "download failed", "dataset": dataset_id}

    samples = convert_csv_dir(data_dir, dataset_id, limit=limit)
    if not samples:
        return {"status": "failed", "reason": "no samples", "dataset": dataset_id}

    out = DATASET_DIR / f"{out_name}.jsonl"
    written = write_jsonl(out, samples)
    return {
        "status": "ok",
        "dataset": dataset_id,
        "samples": written,
        "out_file": str(out),
    }


def run_all(limit_each: int = 30_000) -> list:
    """Download and convert all three Kaggle datasets."""
    results = []
    for key in KAGGLE_DATASETS:
        result = run_single(key, limit=limit_each)
        results.append(result)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        choices=list(KAGGLE_DATASETS.keys()) + ["all"],
        default="all",
        help="Which dataset to process",
    )
    parser.add_argument("--limit", type=int, default=30_000, help="Max samples per dataset")
    args = parser.parse_args()

    if args.dataset == "all":
        results = run_all(limit_each=args.limit)
    else:
        results = [run_single(args.dataset, limit=args.limit)]

    print("\n\nSummary:")
    print(json.dumps(results, indent=2))
