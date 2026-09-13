# Token Integration Pipeline

Advanced token integration system that combines data from multiple sources for comprehensive token analysis and prioritization.

## Overview

This pipeline integrates tokens from various sources including Rick Burp bot and Telegram scraper to provide comprehensive token evaluation and prioritization.

## Scripts

### 1. `token_integration.py`
**Main integration script that:**
- Merges tokens from Rick Burp bot and Telegram scraper
- Enriches with DexScreener API data
- Gets token lore from Rick Burp bot
- Prioritizes based on comprehensive scoring system
- Outputs prioritized token list

**Usage:**
```bash
# Default (enrich 50 tokens)
python3 token_integration.py

# Custom enrichment limit
python3 token_integration.py --max-enrich 100

# Verbose logging
python3 token_integration.py --verbose
```

**Output:** `top100.json` - Prioritized list of top 100 tokens

### 2. `enhanced_token_discovery.py`
**Enhanced token discovery that:**
- Discovers tokens from Rick Burp bot commands
- Uses DexScreener API to get full token addresses
- Stores results in database
- Generates discovery reports

**Usage:**
```bash
python3 enhanced_token_discovery.py
```

**Commands used:**
- `/dt` - Trending DEX tokens
- `/pft` - Trending Pump tokens
- `/runners` - Runners report
- `/burp` - Best plays from last hour
- `/hot` - Popular tokens

### 3. `simple_token_discovery.py`
**Simplified token discovery for quick testing:**
- Gets trending tokens from Rick Burp bot
- Uses DexScreener API for addresses
- Stores in database

**Usage:**
```bash
python3 simple_token_discovery.py
```

### 4. `weekly_call_channel_discovery.py`
**Weekly analysis of call channels:**
- Tracks which call channels are performing best
- Monitors token performance over time
- Generates weekly reports

**Usage:**
```bash
python3 weekly_call_channel_discovery.py
```

## Data Sources

### Rick Burp Bot (@rick)
- **Liquidity data** - Token liquidity in USD
- **Volume data** - 24-hour trading volume
- **Price data** - Current token price
- **DEX information** - Which DEX token is listed on
- **Token lore** - Token narratives and stories

### Telegram Scraper
- **Token mentions** - How many channels mention the token
- **Channel diversity** - Number of different channels
- **Contract addresses** - Extracted from messages

### DexScreener API
- **Market data** - Price, liquidity, volume
- **Trading activity** - Buy/sell transactions
- **Price momentum** - 24-hour price changes
- **FDV** - Fully diluted valuation

## Scoring System

### Rick Burp Data (High Priority)
- **Liquidity > $100,000:** +40 points
- **Liquidity > $50,000:** +30 points
- **Liquidity > $10,000:** +20 points
- **Volume > $100,000:** +30 points
- **Volume > $50,000:** +20 points
- **Volume > $10,000:** +10 points
- **Price data available:** +5 points
- **Listed on DEX:** +5 points
- **Has token lore:** +15 points

### Telegram Data
- **Mentions > 10:** +25 points
- **Mentions > 5:** +15 points
- **Mentions > 0:** +5 points
- **Multiple channels (>3):** +10 points

### Enrichment Data
- **Strong momentum (>100%):** +20 points
- **Good momentum (>50%):** +15 points
- **Positive momentum (>0%):** +5 points
- **Large drop (<-50%):** -10 points penalty
- **Active trading (>100 buys):** +15 points
- **Moderate trading (>50 buys):** +10 points
- **High buy ratio (>60%):** +10 points
- **Low buy ratio (<40%):** -5 points penalty
- **FDV available:** +5 points

### Source Bonus
- **Rick Burp bot only:** +15 points
- **Both sources (Rick + Telegram):** +20 points

## Database Schema

### integrated_tokens.db
**Tables:**
- `integrated_tokens` - Merged and prioritized tokens
- `integration_runs` - Run statistics

**Key Fields:**
- `contract_address` - Token address
- `chain` - Blockchain (solana, ethereum, etc.)
- `source` - Data source (rick_burp, telegram, both)
- `rick_burp_data` - JSON data from Rick Burp bot
- `telegram_data` - JSON data from Telegram scraper
- `enrichment_data` - JSON data from enrichment pipeline
- `priority_score` - Calculated priority score
- `priority_reason` - Reason for priority score

## Output Format

### top100.json
```json
{
  "generated_at": "2026-04-15T06:01:44.235196",
  "total_tokens": 3,
  "top_tokens": [
    {
      "rank": 1,
      "address": "actfuwtgvaxrqgnmiohtusi5jcx5rjf5zwu9aaxkpump",
      "chain": "solana",
      "name": "unc",
      "symbol": "",
      "source": "both",
      "priority_score": 165,
      "priority_reason": "High liquidity (Rick): $215,633; High volume (Rick): $2,965,353; Price data available (Rick); Listed on pumpswap (Rick); Telegram mentions: 2; Strong momentum: +341.0%; Active trading: 18397 buys; FDV: $6,570,917; From multiple sources (Rick + Telegram)",
      "rick_burp_data": {...},
      "telegram_data": {...},
      "enrichment_data": {...},
      "lore_data": {...},
    }
  ]
}
```

## Cron Jobs

### Token Integration Pipeline
**Schedule:** Every 6 hours
**Command:** `python3 token_integration.py`
**Output:** `top100.json`

### Daily Token Discovery
**Schedule:** Daily at 10 AM UTC
**Command:** `python3 enhanced_token_discovery.py`

### Weekly Call Channel Discovery
**Schedule:** Monday 9 AM UTC
**Command:** `python3 weekly_call_channel_discovery.py`

## Requirements

### Python Dependencies
- `requests` - For API calls
- `sqlite3` - For database operations
- `telethon` - For Telegram integration
- `asyncio` - For async operations

### API Keys
- **DexScreener API:** No key required (public API)

### Telegram Session
- Requires existing Telegram session for bot interaction
- Session path: `~/.hermes/.telegram_session/hermes_user`

## Monitoring

### Check Integration Status
```bash
# View integration database
sqlite3 integrated_tokens.db

# Check recent runs
SELECT * FROM integration_runs ORDER BY timestamp DESC LIMIT 5;

# View top tokens
SELECT token_name, priority_score, source, priority_reason 
FROM integrated_tokens 
ORDER BY priority_score DESC LIMIT 10;
```

### View Output
```bash
# Check output file
cat top100.json | jq '.top_tokens[:5]'
```

## Troubleshooting

### Common Issues:
1. **Enrichment fails:** Falls back to basic DexScreener enrichment
2. **Database errors:** Check permissions and schema
3. **API rate limits:** Limits enrichment to 50 tokens by default
4. **Telegram connection:** Ensure session is authorized

### Verification Steps:
1. Test integration: `python3 token_integration.py`
2. Check database: `sqlite3 integrated_tokens.db`
3. View output: `cat top100.json | jq '.top_tokens[:3]'`
4. Check Rick Burp data: `sqlite3 call_channels.db "SELECT * FROM discovered_tokens LIMIT 5;"`

## Future Enhancements

1. Real-time Rick Burp data updates
2. Machine learning for better prioritization
3. Performance tracking over time
4. Automated trading based on prioritization
5. Support for more chains
6. Advanced risk scoring
8. Social sentiment analysis
9. Wallet tracking integration
10. Smart money analysis