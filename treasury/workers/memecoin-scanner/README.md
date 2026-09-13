# Memecoin Scanner

Real-time new-token detector for EVM chains. Watches DEX factory contracts for `PairCreated` events, fetches token metadata, runs five safety heuristics, and emits a structured alert with explorer links — within seconds of a new pair being created on-chain.

```bash
git clone https://github.com/swiftnodes/memecoin-scanner
cd memecoin-scanner
cp .env.example .env             # add your SwiftNodes API key
npm install
CHAIN=base npm start
```

Sample output:

```
[2026-05-13T14:42:33.207Z] Base • Aerodrome • ⚠️  2 WARNING(S)
  Token:  PEPE  (Pepe Coin Base)
  Supply: 1,000,000,000,000 PEPE
  Owner:  0x1234abc...567def
  Paired: WETH
  Token:  https://basescan.org/address/0x...
  Pair:   https://basescan.org/address/0x...
  Tx:     https://basescan.org/tx/0x...
  Checks: 3/5 passed
    ⚠ ownerRenounced: owner not renounced: 0x1234abc...567def
    ⚠ pairedWithKnownQuote: paired with WETH (ok)

[2026-05-13T14:43:01.891Z] Base • UniswapV2 • ✅ PASSED
  Token:  CHAD  (Chad Token)
  Supply: 100,000,000 CHAD
  Owner:  0x0000000000000000000000000000000000000000
  Paired: USDC
  Token:  https://basescan.org/address/0x...
  Pair:   https://basescan.org/address/0x...
  Tx:     https://basescan.org/tx/0x...
  Checks: 5/5 passed
```

## Features

- ✅ **Real-time WebSocket detection** — alerts within 1-3s of pair creation
- ✅ **3 chains pre-configured** (Ethereum, Base, BSC — easy to add more)
- ✅ **Multiple DEX factories per chain** watched in parallel
- ✅ **5 safety heuristics** baked in: symbol/name sanity, supply check, owner renouncement, quote-token validation
- ✅ **All launches emitted** with checks tagged — you decide what to act on
- ✅ **Composable heuristics** — add your own filters in `src/heuristics.js`

## Architecture

```
src/
  chains.js       ← Per-chain WebSocket URL + DEX factories + quote tokens
  heuristics.js   ← Pluggable safety checks (symbol valid, owner renounced, etc.)
  index.js        ← Subscribes, reads metadata, runs heuristics, emits
```

### How a detection works

1. **WebSocket subscribe** to `PairCreated(token0, token1, pair, _)` from each configured factory.
2. **Identify the new token** — the one in the pair that's not a known quote (WETH, USDC, etc.).
3. **Fetch ERC-20 metadata** in parallel: name, symbol, decimals, totalSupply, owner.
4. **Run all 5 heuristics** in `src/heuristics.js`.
5. **Emit** a structured alert tagged with PASS or WARNING(S).

Each new pair gets evaluated end-to-end in roughly 200-800ms depending on RPC latency.

## Safety heuristics

| Check | Looks for | What it catches |
|---|---|---|
| `hasReasonableSymbol` | ASCII symbol, < 13 chars | Garbled or excessive-length symbols (often scams) |
| `hasReasonableName` | Name present, < 60 chars | Empty / spam-length names |
| `reasonableSupply` | Supply > 0 and < 10²⁰ | Absurdly-large-supply tokens (often pump-and-dump) |
| `ownerRenounced` | `owner()` is 0x0 or function missing | Tokens with active owner (rugs and honeypots usually have owner control) |
| `pairedWithKnownQuote` | Paired with WETH/USDC/USDT/BUSD/etc. | Filters out token-token noise that's not "real" memecoin launches |

Add your own in `src/heuristics.js`:

```js
export const HEURISTICS = {
  // ... existing ...
  liquidityFloor: (r) => {
    // You'd extend the reader to also fetch pair reserves, then check:
    if (r.initialLiquidityUsd < 1000) return { ok: false, reason: "low initial liquidity" };
    return { ok: true };
  },
};
```

## Setup

### 1. Get a free SwiftNodes API key

[swiftnodes.io](https://swiftnodes.io) — no email, no KYC. WebSocket subscriptions on free tier.

### 2. Configure

```bash
cp .env.example .env
# edit .env, set SWIFTNODES_API_KEY=sn_...
```

### 3. Run

```bash
npm install
CHAIN=base npm start
```

## Extending

### Watch more chains

Edit `src/chains.js` and add an entry:

```js
arbitrum: {
  name: "Arbitrum One",
  wsUrl: ws("arbitrum"),
  explorerAddr: "https://arbiscan.io/address/",
  explorerTx: "https://arbiscan.io/tx/",
  nativeSymbol: "ETH",
  quoteTokens: {
    WETH: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  },
  factories: [
    { name: "Camelot", version: 2, address: "0x6EcCab422D763aC031210895C81787E87B43A652" },
  ],
},
```

SwiftNodes supports 75+ chains. See [swiftnodes.io/docs/supported-chains](https://swiftnodes.io/docs/supported-chains) for slugs.

### Add Uniswap V3 (concentrated liquidity) factories

V3 emits `PoolCreated` instead of `PairCreated`. To support V3:

```js
const POOL_CREATED_V3 = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
);

// Adapt the watchEvent call to use POOL_CREATED_V3 for V3 factories.
// V3 factory on Ethereum: 0x1F98431c8aD98523631AE4a59f267346ea31F984
// V3 factory on Base:     0x33128a8fC17869897dcE68Ed026d694621f6FDfD
```

### Detect specific token features

The `readErc20` function fetches `owner()` already. Extend it to look for:

- **Mintable tokens**: check for a `mint()` function (very high risk for inflation rugs)
- **Pausable tokens**: check for `paused()` — pauseable transfers = potential lock
- **Tax / fee bots**: read `_taxFee` or similar slots
- **Blacklist functions**: check for `_blacklist` mapping

### Send alerts elsewhere

Replace `console.log` in `emit()` with HTTP POST to a Discord/Telegram webhook:

```js
await fetch(process.env.DISCORD_WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content: `New token on ${chain.name}: **${tokenMeta.symbol}** | Owner: ${tokenMeta.owner === "0x0000000000000000000000000000000000000000" ? "renounced" : "ACTIVE ⚠️"} | ${chain.explorerAddr}${tokenMeta.address}`,
  }),
});
```

## Why this exists

Memecoin trading lives in the first 30-60 seconds of a pair's life. Most pump-bot infrastructure costs $100+/month. This is the free, open-source detection layer — you decide what to do with the data.

It deliberately has **no buying logic**. Building responsible execution requires careful work on:

- Honeypot detection (simulation of buy → sell trip)
- Slippage protection
- Gas pricing under MEV competition
- Risk management / position sizing

Don't slap a `swap()` call on this and run with real money.

## Limitations

- **No V3 factories yet** — Uniswap V3, Aerodrome Slipstream, Pancake V3 emit a different event (`PoolCreated`). Easy to add (see Extending).
- **No honeypot detection** — would require simulating a buy/sell roundtrip via `eth_call` against a forked state.
- **No initial-liquidity check** — would need to read the pair's reserves immediately after creation.
- **Owner check is naive** — many legit projects use multi-sigs or timelocks instead of renouncing. Don't auto-reject solely on `owner != 0x0`.

PRs welcome for any of these.

## License

MIT — fork, ship, profit (responsibly).
