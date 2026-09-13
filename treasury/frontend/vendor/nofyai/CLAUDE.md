# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NofyAI** is a Next.js 16 web dashboard for an AI-powered algorithmic trading system. The system supports multi-trader competitions where different AI models (DeepSeek, Qwen, custom) trade independently on cryptocurrency exchanges (Aster DEX, Binance, Hyperliquid). The frontend displays real-time performance tracking, AI decision transparency, and comprehensive analytics.

## Common Commands

```bash
# Development
npm run dev          # Start Next.js dev server with Turbopack (http://localhost:3000)
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint

# Utilities
npx tsx scripts/test-aster-connection.ts   # Test Aster DEX connection
npx tsx scripts/derive-address.ts          # Derive wallet address from private key
```

## Architecture Overview

### In-Process Trading Engine

**IMPORTANT**: Unlike what the README suggests, this is NOT a client-server architecture with a separate Go backend. The trading engine runs **in-process** within the Next.js application itself.

- **TraderManager** (`/lib/trader-manager.ts`): Singleton that manages multiple `TradingEngine` instances
- **TradingEngine** (`/lib/trading-engine.ts`): Core trading logic for each AI trader
- **DecisionLogger** (`/lib/decision-logger.ts`): Persists trading decisions to `decision_logs/{trader_id}/` directory
- **API Routes** (`/app/api/*`): Next.js route handlers that call TraderManager methods directly (not HTTP proxy)

### Singleton Pattern for Hot-Reload Safety

The codebase uses `globalThis` to persist singletons across Next.js hot reloads in development:

```typescript
// Pattern used in trader-manager.ts, config-loader.ts
const globalForTraderManager = globalThis as unknown as {
  traderManager: TraderManager | undefined;
};

export async function getTraderManager(): Promise<TraderManager> {
  if (!globalForTraderManager.traderManager) {
    // Initialize once
  }
  return globalForTraderManager.traderManager;
}
```

**Why this matters**: Without this pattern, hot reloads would create duplicate trading engines and multiple trading sessions.

### Multi-Trader Architecture

Each trader operates independently:
- Separate configuration in `config.json`
- Independent trading sessions (can start/stop individually)
- Isolated decision logs in `decision_logs/{trader_id}/`
- Own AI model and exchange credentials

### Configuration System

**Setup**: Copy `config.json.example` to `config.json` and configure:

```json
{
  "traders": [
    {
      "id": "aster_deepseek",        // Unique trader identifier
      "name": "Aster DeepSeek Trader",
      "enabled": true,                // Must be true to auto-start
      "ai_model": "deepseek",         // "deepseek" | "qwen" | "custom"
      "exchange": "aster",            // "aster" | "binance" | "hyperliquid"
      // Exchange credentials
      "aster_user": "0x...",
      "aster_signer": "0x...",
      "aster_private_key": "...",
      // AI credentials
      "deepseek_api_key": "sk-...",
      // Trading params
      "initial_balance": 1000.0,
      "scan_interval_minutes": 3
    }
  ],
  "leverage": {
    "btc_eth_leverage": 5,
    "altcoin_leverage": 5
  }
}
```

**ConfigLoader** (`/lib/config-loader.ts`): Loads and validates `config.json`, masks sensitive keys for frontend display.

## Data Flow

### API Request Flow

```
Frontend Component
  → SWR hook (`useSWR('/api/account?trader_id=...')`)
  → Next.js API Route (`/app/api/account/route.ts`)
  → TraderManager.getTrader(traderId)
  → TradingEngine.getCurrentAccount()
  → AsterTrader.getBalance() / BinanceTrader / etc.
  → Exchange API
```

**No external backend**: All API routes call in-process methods.

### Trading Cycle Flow

```
TradingEngine.runCycle()
  → Get account balance & positions from exchange
  → Fetch market data for candidate coins
  → Build TradingContext (account, positions, market data)
  → Call AI model (getFullDecision in /lib/ai.ts)
  → Parse AI decisions (open/close/hold)
  → Execute trades via AsterTrader/BinanceTrader
  → Log decision + results to DecisionLogger
```

### Decision Logging

Each trading cycle creates a `DecisionRecord` saved to:
```
decision_logs/{trader_id}/{cycle_number}.json
```

Contains:
- AI chain-of-thought reasoning (`cot_trace`)
- Decisions array (symbol, action, reasoning)
- Account snapshot (before execution)
- Positions snapshot (before execution)
- Execution results (success/error per decision)
- Full input prompt sent to AI
- Candidate coins analyzed

**Performance Metrics**: Calculated by analyzing closed positions from decision logs (not real-time).

## Key Implementation Details

### DecisionDetailModal Merging Logic

**Location**: `/components/trader/DecisionDetailModal.tsx`

Displays AI trading decisions by merging two arrays:
- `decisions[]` - AI's intended actions
- `execution_results[]` - Actual execution outcomes

**Important**: The modal must:
1. Match decisions to execution results by symbol + action
2. Find corresponding position from `positions_snapshot` for each decision
3. Clean trailing code block markers from `cot_trace` before Markdown rendering
4. Handle cases where execution fails (show error from `execution_results`)

### Performance Metrics Grading

**Location**: `/components/trader/PerformanceMetrics.tsx`

Sharpe ratio grading considers sample size:
- **< 10 trades**: Show "Limited Sample" warning (no harsh grading)
- **≥ 10 trades**: Apply standard grading:
  - Sharpe > 1.5: "Excellent"
  - Sharpe > 0.5: "Good"
  - Sharpe > 0: "Positive"
  - Sharpe > -0.5: "Slight Loss"
  - Sharpe > -1.5: "Needs Improvement"
  - Sharpe ≤ -1.5: "Consistent Loss"

### SWR Data Fetching Pattern

All real-time data uses SWR with auto-refresh:

```typescript
import useSWR from 'swr';

const { data: account, error } = useSWR(
  `/api/account?trader_id=${params.id}`,
  fetcher,
  { refreshInterval: 5000 } // Auto-refresh every 5s
);
```

**Fetcher**: Defined in API client (`/lib/api.ts`).

## TypeScript Type System

**All types defined in**: `/types/index.ts`

Key types:
- `DecisionRecord` - Complete trading decision with snapshots
- `AIDecision` - AI's intended action (symbol, action, reasoning)
- `ExecutionResult` - Actual execution outcome (success/error)
- `PerformanceAnalysis` - Statistical performance metrics
- `TraderConfig` - Trader configuration (raw)
- `MaskedTraderConfig` - Configuration with masked API keys (for frontend)

**Path alias**: `@/*` maps to project root (configured in `tsconfig.json`)

## Styling Conventions

### Tailwind Configuration

**Custom theme** (`/tailwind.config.ts`):
- CoinMarketCap-inspired color palette
- Custom animations (fade-in, slide-in, scale-in)
- Typography plugin for Markdown rendering

### Common CSS Classes

```css
.card              /* White card with border */
.badge             /* Status badge (success/danger/secondary) */
.text-success      /* Green text for profits */
.text-danger       /* Red text for losses */
.prose             /* Markdown typography styles */
```

## Exchange Integration

### Aster DEX (`/lib/aster.ts`)

Uses ethers.js for wallet signing and API authentication:
- Main wallet address (`aster_user`) - login address
- API wallet address (`aster_signer`) - generated API wallet
- API wallet private key (`aster_private_key`) - for signing

**Test script**: `npx tsx scripts/test-aster-connection.ts`

### Market Data (`/lib/market-data.ts`)

Fetches real-time price data for AI decision-making:
- Supports Binance, CoinGecko as data sources
- Batch fetching for multiple symbols
- Caching to reduce API calls

## AI Integration (`/lib/ai.ts`)

Supports multiple AI providers:
- **DeepSeek**: `https://api.deepseek.com/v1`
- **Qwen (Alibaba)**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **Custom**: User-defined API URL (e.g., OpenAI, local models)

**Prompt engineering**: AI receives:
- Current account balance & PnL
- Open positions with unrealized PnL
- Market data for candidate coins
- Historical performance context
- Risk management rules

**Response format**: Expects JSON with:
```json
{
  "cot": "Chain of thought reasoning...",
  "decisions": [
    {
      "symbol": "BTCUSDT",
      "action": "open_long" | "close_position" | "hold",
      "reasoning": "Why this decision..."
    }
  ]
}
```

## Environment & Configuration

**No `.env` file needed**: All configuration in `config.json`

**Port configuration**:
- Frontend: `http://localhost:3000` (Next.js default)
- No separate backend server

## Development Workflow

### Adding a New Trader

1. Add trader config to `config.json`
2. Set `enabled: true`
3. Provide exchange credentials
4. Provide AI API key
5. Restart Next.js dev server (to reload config)
6. Use frontend to start trading via `/api/trade/start`

### Testing Exchange Connection

```bash
# Modify scripts/test-aster-connection.ts with credentials
npx tsx scripts/test-aster-connection.ts
```

### Viewing Decision Logs

```bash
# Logs stored as JSON files
cat decision_logs/aster_deepseek/1.json | jq .
```

### TypeScript Strict Mode

**Enabled**: `"strict": true` in `tsconfig.json`
- All functions must have proper types
- No implicit `any`
- Null checks enforced

## Common Pitfalls

### 1. "Trader not found" Error

**Cause**: Trader not initialized (not in `config.json` or `enabled: false`)

**Fix**: Check `config.json` and ensure trader is enabled, then restart server.

### 2. Hot Reload Creating Duplicate Trading Sessions

**Cause**: Not using globalThis singleton pattern

**Fix**: Always use `getTraderManager()` to access traders, never create new instances.

### 3. Performance Data Missing

**Cause**: Performance calculated from closed positions in decision logs. New traders have no closed positions yet.

**Fix**: Wait for at least one position to close, or check decision logs exist.

### 4. API Keys Not Masked in Frontend

**Cause**: Using raw `TraderConfig` instead of `MaskedTraderConfig`

**Fix**: Use `/api/config` route which returns `MaskedSystemConfig` with masked keys.

### 5. Markdown Not Rendering in CoT Trace

**Cause**: Trailing code block markers (` ``` `) in AI response not cleaned

**Fix**: Use `cleanCotTrace()` function before passing to ReactMarkdown.

## File Organization

```
/app
  /api              # Next.js API routes (NOT proxies, direct calls)
  /trader/[id]      # Dynamic trader detail page
  layout.tsx        # Root layout with navigation
  page.tsx          # Competition leaderboard (home)

/components
  /ui               # Reusable UI components (Card, Badge, Button, etc.)
  /competition      # Competition-specific components
  /trader           # Trader detail components

/lib                # Core business logic
  ai.ts             # AI model integrations
  aster.ts          # Aster DEX integration
  config-loader.ts  # Config file loader
  decision-logger.ts # Decision logging system
  market-data.ts    # Market data fetching
  trader-manager.ts # Multi-trader manager (singleton)
  trading-engine.ts # Core trading logic per trader

/types
  index.ts          # All TypeScript type definitions

/scripts            # Utility scripts (run with npx tsx)
```

## Browser DevTools Tips

### Inspecting API Responses

Open Network tab, filter by "Fetch/XHR":
- `/api/account` - Account balance data
- `/api/positions` - Current positions
- `/api/decisions/latest` - Recent AI decisions
- `/api/equity-history` - Historical equity curve

### Debugging SWR Cache

```javascript
// In browser console
window.localStorage.clear(); // Clear SWR cache
location.reload();
```

## Related Resources

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [SWR Documentation](https://swr.vercel.app/)
- [Aster DEX API Docs](https://www.asterdex.com/)
- [DeepSeek API](https://platform.deepseek.com/)
- [Qwen API](https://help.aliyun.com/zh/dashscope/)
