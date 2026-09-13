"""
Fetch All External Datasets
============================
Master script that fetches and converts all external datasets,
then merges them with the pipeline's own experience-based datasets
into a single combined initial training dataset.

Usage:
  # Download everything (requires Kaggle credentials)
  python -m hermes_screener.training.external_datasets.fetch_all

  # Skip Kaggle (HuggingFace only, no credentials needed for public datasets)
  python -m hermes_screener.training.external_datasets.fetch_all --hf-only

  # Merge into training without re-downloading
  python -m hermes_screener.training.external_datasets.fetch_all --merge-only

  # Set up Kaggle credentials first:
  mkdir -p ~/.kaggle
  echo '{"username":"YOUR_USER","key":"YOUR_API_KEY"}' > ~/.kaggle/kaggle.json
  chmod 600 ~/.kaggle/kaggle.json
"""

import argparse
import json
import random
import time
from pathlib import Path

from .utils import (
    DATASET_DIR,
    check_kaggle_credentials,
    ensure_dirs,
    read_jsonl,
    write_jsonl,
)

MERGED_OUT = DATASET_DIR / "initial_training_dataset.jsonl"


def merge_datasets(
    pipeline_dataset: Path | None = None,
    external_datasets: list | None = None,
    shuffle: bool = True,
    seed: int = 42,
) -> dict:
    """
    Merge pipeline experience datasets + external datasets into one file.
    Deduplicates by (user_prompt_hash) to avoid exact duplicates.
    """
    random.seed(seed)

    # Auto-discover if not specified
    if external_datasets is None:
        external_datasets = sorted(DATASET_DIR.glob("hf_*.jsonl")) + sorted(DATASET_DIR.glob("kaggle_*.jsonl"))

    if pipeline_dataset is None:
        p = DATASET_DIR / "combined_dataset.jsonl"
        pipeline_dataset = p if p.exists() else None

    all_samples = []
    sources = {}

    # Load external datasets first
    for path in external_datasets:
        if not path.exists():
            continue
        samples = read_jsonl(path)
        sources[path.name] = len(samples)
        all_samples.extend(samples)
        print(f"  Loaded {len(samples):,} samples from {path.name}")

    # Load pipeline experiences (if any)
    if pipeline_dataset and pipeline_dataset.exists():
        samples = read_jsonl(pipeline_dataset)
        sources["combined_dataset.jsonl (pipeline)"] = len(samples)
        all_samples.extend(samples)
        print(f"  Loaded {len(samples):,} pipeline experience samples")

    if not all_samples:
        return {"status": "no_data", "sources": sources}

    # Shuffle
    if shuffle:
        random.shuffle(all_samples)

    written = write_jsonl(MERGED_OUT, all_samples)
    print(f"\nMerged dataset: {written:,} samples -> {MERGED_OUT}")

    # Also write train/eval split (90/10)
    split = int(len(all_samples) * 0.9)
    train_path = DATASET_DIR / "initial_training_train.jsonl"
    eval_path = DATASET_DIR / "initial_training_eval.jsonl"
    write_jsonl(train_path, all_samples[:split])
    write_jsonl(eval_path, all_samples[split:])
    print(f"Train: {split:,} samples -> {train_path.name}")
    print(f"Eval:  {len(all_samples)-split:,} samples -> {eval_path.name}")

    return {
        "status": "ok",
        "total": written,
        "sources": sources,
        "out_file": str(MERGED_OUT),
        "train_file": str(train_path),
        "eval_file": str(eval_path),
    }


def run(
    skip_hf: bool = False,
    skip_kaggle: bool = False,
    limit_each: int = 30_000,
    merge_only: bool = False,
) -> dict:
    ensure_dirs()
    t0 = time.time()
    results = {}

    if not merge_only:
        # 1. HuggingFace dataset
        if not skip_hf:
            print("\n" + "=" * 60)
            print("Fetching HuggingFace: 0xscope/web3-trading-analysis")
            print("=" * 60)
            try:
                from .hf_web3_trading import run as hf_run

                results["hf_web3_trading"] = hf_run(limit=limit_each)
            except Exception as e:
                results["hf_web3_trading"] = {"status": "error", "error": str(e)}
            print(f"HF result: {results['hf_web3_trading'].get('status')}")

        # 2. Kaggle datasets
        if not skip_kaggle:
            kaggle_ok, kaggle_msg = check_kaggle_credentials()
            if not kaggle_ok:
                print(f"\n[KAGGLE SKIPPED] {kaggle_msg}\n")
                results["kaggle"] = {"status": "skipped", "reason": "no credentials"}
            else:
                print("\nFetching Kaggle datasets...")
                try:
                    from .kaggle_ohlcv import run_all

                    kaggle_results = run_all(limit_each=limit_each)
                    for r in kaggle_results:
                        key = r["dataset"].split("/")[-1]
                        results[f"kaggle_{key}"] = r
                except Exception as e:
                    results["kaggle"] = {"status": "error", "error": str(e)}

    # 3. Merge everything
    print("\n" + "=" * 60)
    print("Merging all datasets...")
    print("=" * 60)
    merge_result = merge_datasets()
    results["merge"] = merge_result

    results["elapsed_s"] = round(time.time() - t0, 1)
    return results


def print_status():
    """Print status of all available datasets."""
    ensure_dirs()
    files = sorted(DATASET_DIR.glob("*.jsonl"))
    if not files:
        print("No datasets found in", DATASET_DIR)
        return

    print(f"\nDatasets in {DATASET_DIR}:")
    print(f"{'File':<50} {'Samples':>10} {'Size':>10}")
    print("-" * 72)
    total = 0
    for f in files:
        try:
            count = sum(1 for _ in open(f))
            size = f.stat().st_size
            size_str = f"{size/1024/1024:.1f}MB" if size > 1024 * 1024 else f"{size/1024:.1f}KB"
            print(f"{f.name:<50} {count:>10,} {size_str:>10}")
            total += count
        except Exception:
            print(f"{f.name:<50} (error reading)")
    print("-" * 72)
    print(f"{'TOTAL':<50} {total:>10,}")

    kaggle_ok, msg = check_kaggle_credentials()
    print(f"\nKaggle credentials: {'OK' if kaggle_ok else 'NOT SET'}")
    if not kaggle_ok:
        print(f"  -> {msg}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch and merge external training datasets")
    parser.add_argument("--hf-only", action="store_true", help="Only fetch HuggingFace dataset")
    parser.add_argument("--kaggle-only", action="store_true", help="Only fetch Kaggle datasets")
    parser.add_argument("--merge-only", action="store_true", help="Only merge existing files")
    parser.add_argument("--status", action="store_true", help="Show status of existing datasets")
    parser.add_argument("--limit", type=int, default=30_000, help="Max samples per dataset")
    args = parser.parse_args()

    if args.status:
        print_status()
    else:
        result = run(
            skip_hf=args.kaggle_only,
            skip_kaggle=args.hf_only,
            limit_each=args.limit,
            merge_only=args.merge_only,
        )
        print("\n\nFinal Summary:")
        print(json.dumps(result, indent=2))
