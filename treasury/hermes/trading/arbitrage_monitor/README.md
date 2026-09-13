
# Cross-DEX Arbitrage Monitor

**What it does:** Continuously compares prices across multiple DEXes on supported chains and alerts when fee-aware cross-DEX arbitrage exceeds a profit threshold.

**Strategy:** Same-pair price discrepancy arbitrage — e.g. buy WETH on Uniswap at $X, sell on KyberSwap at $X+Δ, netting the spread minus DEX fees + gas.

**Why this approach:** Real-time mempool + calldata decoding is infeasible without full ABI decoding infrastructure. Cross-DEX price monitoring is implementable today using existing quote APIs. This scanner finds and alerts on opportunities; execution is manual or automated via separate trading bot.

## Quick Start

### 1. Set environment variables

```bash
# Create a dedicated env file
cat > ~/.hermes/arbitrage.env <<EOF
ARBITRAGE_CHAINS="base,ethereum,arbitrum"
ARBITRAGE_PAIRS="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
# WETH/USDC + USDC/WETH (both directions)
ARBITRAGE_MIN_PROFIT_ETH=0.015
ARBITRAGE_POLL_INTERVAL=30
ARBITRAGE_QUOTE_AMOUNT_ETH=1.0
ARBITRAGE_TELEGRAM_BOT_TOKEN=123456:ABC-DEF...  # optional
ARBITRAGE_TELEGRAM_CHAT_ID=123456789           # optional
EOF
```

### 2. Run manually

```bash
export $(cat ~/.hermes/arbitrage.env | xargs)
python run_arbitrage_monitor.py
```

### 3. Or install as systemd service

```bash
ln -s /home/terexitarius/.hermes/hermes-token-screener/trading/arbitrage_monitor/hermes-arbitrage.service /etc/systemd/system/
systemctl daemon-reload
systemctl start hermes-arbitrage
systemctl status hermes-arbitrage
journalctl -u hermes-arbitrage -f
```

## Supported Chains & DEXes

| Chain    | DEX Quoted                    |
|----------|-------------------------------|
| Base     | Uniswap V2/V3, KyberSwap      |
| Ethereum | Uniswap V2/V3, KyberSwap      |
| Arbitrum | Uniswap V3, KyberSwap         |
| Polygon  | Uniswap V3, KyberSwap (test)  |

More DEX APIs from `dex_aggregator_trader.py` can be added:
- SushiSwap via subgraph or API
- 1inch Orderbook API
- OpenOcean / Odos / Enso (multi-path)
- Jupiter (Solana) — separate EVM module

## Architecture

```
[crossdex.Scanner] every POLL_INTERVAL seconds
         │
         ▼
For each target pair on {chain}:
  • quote_across_dexes()  → [PriceQuote×N]
         │
         ▼
[OpportunityFinder]
  • select cheapest buy + most expensive sell
  • subtract DEX fees from spread
  • subtract gas estimate
         │
         ▼
if net_profit_eth ≥ ARBITRAGE_MIN_PROFIT_ETH:
         │
         ├────────────┐
         ▼            ▼
[DB log]    [Telegram alert]
         │            │
         ▼            ▼
~/.hermes/data/arbitrage_opportunities.db   Bot message
```

## Output Example

```
[CrossDexArb] !!! ALERT! Profit=0.0234 ETH  buy=uniswap_v2 sell=kyberswap  chain=base
Pair  : 0xc02...C2 → 0xa0b...48
'''
