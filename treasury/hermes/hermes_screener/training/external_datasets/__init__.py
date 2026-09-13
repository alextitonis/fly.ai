"""
External Dataset Integrations
==============================
Downloads and converts public crypto/DeFi datasets into the same
JSONL instruction-tuning format used by the pipeline's experience buffer.

Supported sources:
  1. HuggingFace: 0xscope/web3-trading-analysis
  2. Kaggle: ranodipghosh/top-50-crypto-market-data-daily-usd
  3. Kaggle: abdullahkhan70/daily-multi-year-ohlcv-crypto-market-data
  4. Kaggle: mihikaajayjadhav/top-100-cryptocurrencies-daily-price-data-2025

Each adapter:
  - Downloads the raw data (caches locally under ~/.hermes/data/external/)
  - Converts it into (system, user, assistant) chat triples
  - Writes to {name}_dataset.jsonl in the training datasets dir
  - Reports how many samples were generated

Usage:
  python -m hermes_screener.training.external_datasets.fetch_all

  # Or per-source:
  python -m hermes_screener.training.external_datasets.hf_web3_trading
  python -m hermes_screener.training.external_datasets.kaggle_ohlcv

Credentials needed:
  - HuggingFace: HF_TOKEN env var or ~/.huggingface/token (optional for public datasets)
  - Kaggle: ~/.kaggle/kaggle.json  (required)
      Get it from: https://www.kaggle.com/settings -> API -> Create New Token
"""
