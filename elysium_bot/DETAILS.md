# Elysium launch sniper: details

The easy guide is [README.md](README.md). This page covers how the bot works and every setting.

A small bot you run on your own computer. It watches Kinetiq's **Elysium** L2 (the Hyperliquid L2, mainnet Nov 9 2026) for
new token pools paired with HYPE. It tests each one by simulating a buy and a sell, buys a small amount when the pool
passes, and sells fast on fixed rules.

It starts in **paper mode**: simulated trades only, no wallet, no money. Live mode is something you turn on yourself.

> **Use money you can afford to lose.** Most new launches go to zero, and the simulation can't catch everything. A
> developer can still pull liquidity or dump on you after you buy. Use a fresh wallet, keep amounts small, and get the
> RPC and addresses only from Kinetiq's official docs. Never use a bridge link from X or Telegram replies.

## Quick start (paper mode, works today on testnet)

You need [Node.js 20+](https://nodejs.org).

```bash
cd elysium_bot
npm install
npm run setup
npm run scan
npm run paper
```

- `npm run scan` lists recent HYPE pools and shows whether each would pass the entry checks right now.
- `npm run paper` runs the bot with simulated money (10 HYPE by default). Stop it with Ctrl+C.
- `npm run status` shows open positions and P&L.

Trades are logged to `data/<chain>-<mode>-trades.csv`. State is saved in `data/`, so you can stop the bot and restart it.

## Going live

1. `npm run setup` makes a new wallet (key saved in `.env`, never printed) and shows its address. `npm run wallet` shows it again with the balance.
2. Send that address a little HYPE on Elysium, using the official bridge from Kinetiq's docs. On mainnet also set `RPC_URL` and `WHYPE` in `.env`.
3. Run `npm run live`. On the first live run per chain it deploys your own `SnipeHelper` contract (only your wallet can trade through it). `npm run deploy-helper -- --force` makes a new one.

Other commands:
- `npm run sell-all` sells every open position.
- `npm run withdraw` sends any HYPE left in the helper back to your wallet. Add `-- --token 0x…` to also pull out a
  token.

### Launch-day checklist (Nov 9)

- [ ] Get the mainnet chain RPC from https://elysium.kinetiq.xyz/docs/connecting-to-elysium. A provider key is better
      than the public RPC.
- [ ] Get WHYPE, plus optionally the Nest / launchpad PoolManager and factory addresses, from the docs' "Contract
      addresses" page. Put them in `WHYPE` and `ALLOW_FACTORIES`.
- [ ] Run `npm run scan` and `npm run paper` for a few minutes on mainnet. Check that pools show up and that the
      skip reasons make sense.
- [ ] Run `npm run live` with a small `BUY_HYPE` first.

## How it works

1. **Find.** Every second it reads new-pool events from *any* contract: Uniswap v2 `PairCreated`, v3 `PoolCreated` and
   v4 `Initialize` (Nest and aka.fun are v4). It keeps pools paired with native HYPE or WHYPE. This means it works on
   launch day before anyone has published addresses.
2. **Test.** It runs two simulated buy-then-sell round trips (`eth_call`, no gas, nothing kept): one at your buy size
   and one at 1/20 of it. The pool is skipped if any of these hold:
   - the sell fails (honeypot)
   - the sell tax is over 10% (`MIN_TAX_RATIO`)
   - the round trip loses over 12% (`MAX_ROUNDTRIP_LOSS_PCT`)
   - your buy moves the price over 8% (`MAX_IMPACT_PCT`, a thin pool)

   A pool gets `MAX_POOL_AGE_SEC` (5 min) to pass, because many launches add liquidity after creating the pool.
3. **Buy.** It buys `BUY_HYPE` through your helper contract with a slippage limit. Limits: `MAX_OPEN` positions at once,
   `MAX_BUYS_PER_HOUR`, `MAX_SPEND_HYPE` in total, and `GAS_RESERVE_HYPE` always left in the wallet.
4. **Sell.** Each position is checked every loop, priced at what selling it would actually pay. Exit rules:
   - **Take profit:** sell `TP_PART` (half) at `TP_X` (2x), which gets your cost back.
   - **Trailing stop:** sell everything `TRAIL_PCT` (25%) under the top, once it has been up `TRAIL_ARM_X` (1.3x) or
     after the take-profit.
   - **Stop loss:** `STOP_PCT` (40%) under cost.
   - **Time stop:** `MAX_HOLD_MIN` (30 min).
   - **Sell check:** every `RECHECK_SEC`, a fresh small round trip runs. If selling stopped working (a sell switched
     off, or the pool drained), it sells at once.

   A failed sell retries with wider slippage, and after 3 tries sells at any price.

### The helper contract

`contracts/src/SnipeHelper.sol` swaps directly against v2 pairs, v3 pools and v4 PoolManagers, with no router needed.
- Only the owner (the wallet that deployed it) can `buy`, `sell`, `sweep` or `withdraw`.
- The simulation functions always revert, so nothing can be kept or taken through them.
- Paper mode never deploys it: the simulations inject its code into the `eth_call`.

The compiled contract ships in `src/SnipeHelper.json`, so you don't need Foundry to use the bot.

For developers:
```bash
npm test
npm run typecheck
npm run test:contract
npm run build:contract
```
- `npm test` runs the strategy and discovery unit tests.
- `npm run test:contract` runs a fork test that buys and sells real testnet v2, v3 and v4 pools. It needs Foundry.
- `npm run build:contract` recompiles the contract and refreshes `src/SnipeHelper.json`.

## Notes and limits

- **Speed.** Elysium uses the Arbitrum Nitro sequencer, which orders transactions first-come-first-served, so priority
  fees don't buy a place in line. A fast RPC close to the sequencer is what matters, and Timeboost may change this
  later. The bot polls every `POLL_MS`; it is not a same-block sniper.
- **Bonding curves.** Tokens still on a launchpad's bonding curve (not yet a pool) aren't traded. They are picked up when
  they graduate into a pool.
- **Paper mode is approximate.** It values a position as if your buy had really landed. Other traders' reactions to
  your buy aren't modelled.
- **Getting HYPE out of Elysium.** The official withdrawal is an optimistic-rollup exit and can take days. Check
  Kinetiq's docs for faster routes before putting in more than you're happy to leave there for a while.
- **Not advice.** This is a tool. It does not predict which tokens will go up.
