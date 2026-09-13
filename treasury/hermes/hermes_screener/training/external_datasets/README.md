# External Dataset Integration

Fetches four public crypto datasets and converts them into the same
instruction-tuning format used by the live pipeline experience buffer.

## Datasets

| Source | ID | Content | Samples est. |
|--------|-----|---------|-------------|
| HuggingFace | 0xscope/web3-trading-analysis | On-chain wallet behavior, DEX trades | ~50k |
| Kaggle | ranodipghosh/top-50-crypto-market-data-daily-usd | Daily OHLCV top 50 | ~30k |
| Kaggle | abdullahkhan70/daily-multi-year-ohlcv-crypto-market-data | Multi-year OHLCV | ~30k |
| Kaggle | mihikaajayjadhav/top-100-cryptocurrencies-daily-price-data-2025 | Top 100 daily 2025 | ~30k |

Total: up to ~140k external samples combined with live pipeline experiences.

## Setup

### HuggingFace (no credentials needed for public datasets)

    pip install datasets

Optional for private/gated datasets:

    export HF_TOKEN=hf_your_token_here

### Kaggle (required)

1. Go to https://www.kaggle.com/settings -> API -> Create New Token
2. Save the downloaded kaggle.json:

    mkdir -p ~/.kaggle
    mv ~/Downloads/kaggle.json ~/.kaggle/kaggle.json
    chmod 600 ~/.kaggle/kaggle.json

3. Install the client:

    pip install kaggle

## Usage

Check status of what you already have:

    python -m hermes_screener.training.external_datasets.fetch_all --status

Download everything and build merged dataset:

    python -m hermes_screener.training.external_datasets.fetch_all

HuggingFace only (no Kaggle credentials needed):

    python -m hermes_screener.training.external_datasets.fetch_all --hf-only

Kaggle only:

    python -m hermes_screener.training.external_datasets.fetch_all --kaggle-only

Merge existing cached files without re-downloading:

    python -m hermes_screener.training.external_datasets.fetch_all --merge-only

## Output Files

All written to ~/.hermes/data/training/datasets/

    hf_web3_trading_dataset.jsonl           <- HuggingFace wallet + token samples
    kaggle_top50_daily_dataset.jsonl        <- Top 50 daily candle analysis
    kaggle_ohlcv_multiyear_dataset.jsonl    <- Multi-year OHLCV prediction
    kaggle_top100_2025_dataset.jsonl        <- Top 100 entry timing
    initial_training_dataset.jsonl          <- All external merged + shuffled
    initial_training_train.jsonl            <- 90% split for training
    initial_training_eval.jsonl             <- 10% split for evaluation

## Sample Types Generated from OHLCV

From each daily candle the adapter generates 3 question types:

1. Candle analysis - "What does today's OHLCV pattern mean?"
2. Next-day prediction - "Given 7 days of history, predict tomorrow"
3. Entry timing - "Is now a good entry point based on 14-day MAs?"

## Starting a Training Run with External Datasets

    # Step 1: fetch external data
    python -m hermes_screener.training.external_datasets.fetch_all

    # Step 2: train on the merged dataset
    python -m hermes_screener.training.training_loop --once \
      --base-model google/gemma-2-2b-it \
      --max-steps 500

The training loop auto-detects initial_training_train.jsonl and uses it
before falling back to pipeline experience datasets.
