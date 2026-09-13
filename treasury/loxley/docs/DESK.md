# The desk, panel by panel

Everything on the desk is a public read, and every panel says which read it came from. Times are how often the desk
asks; the desk counts its own calls in the status bar (`api`).

## Top bar

| Element | Source | Notes |
|---|---|---|
| token field | you | a Robinhood Chain address, `0x` and forty hex characters. `?token=0x…` in the URL does the same |
| price · sparkline | DexScreener `priceUsd`, the session's own ticks | the sparkline is the last 60 polls |
| mcap · pool · 24h | DexScreener `marketCap` (or `fdv`), `liquidity.usd`, `priceChange.h24` | the value flashes green or red on each change |
| sound | you | beeps on votes and launches, a siren on red alerts. Off until you turn it on; browsers require a click before any sound |
| `~` | you | the console. [CONSOLE.md](./CONSOLE.md) |

## Stage

The big black panel. The core in the middle is the desk itself; the eight characters on orbit are the council.

| Element | What it shows |
|---|---|
| symbol, name, pool, age | DexScreener pair: `baseToken.symbol`, `name`, `dexId`, quote symbol, `pairCreatedAt` |
| LIVE / SIM / REPLAY / EXIT DRILL badge | where the numbers come from right now. Nothing simulated is labelled live |
| token image | the first of: GeckoTerminal `image_url`, DexScreener `info.imageUrl`, the contract's own metadata URI (`contractURI`, `tokenURI`, `logoURI`… read by `eth_call`), the explorer's `icon_url`. Fresh mints are retried until an image appears |
| survival index | the council's sum, 0 to 100. [SCORING.md](./SCORING.md) |
| stamp | ENTER at 70+, AVOID under 40 or with any hard flag, CAREFUL between |
| speed · flow · pool (HUD, left) | trades per minute over the last five minutes; buys against sells; the pool's move across the session's polls, or the drain clock when it is falling fast enough to be timed |
| compute stream (left) | the maths behind the numbers, one line every 1.7 s: `impact(1Ξ) = 1 / (1 + R)`, `depth = pool / mcap`, `safe_size = R × 0.05 / 0.95`, the survival sum, `liq_drawdown` against the session high |
| deployer x-ray (right) | [below](#deployer-x-ray) |
| verdict | one sentence for the stamp, one for the numbers behind it |
| safe exit size · real exit on 1 ETH | `R × 0.05 / 0.95` where `R` is the pool's ETH reserve; and what 1 ETH of tokens returns after impact and the 0.3 % fee |
| gauge, rings, ticks | the survival gauge around the core; the eight-segment council ring, one colour per vote; a tick ring that spins at the tape's speed; a thin poll-progress ring |
| pulses flying into the core | transfers seen on the explorer (`tokens/…/transfers`, every 12 s). Green from the pool is a buy, red to the pool is a sell, grey is a move. Big ones caption the stage |

The core follows your cursor, blinks, and changes mood: calm, alert while an agent dives in to scan it, scared while
the frame is red.

### Deployer x-ray

For every token the desk loads:

1. `addresses/<token>` on the explorer gives the creation transaction.
2. `transactions/<hash>` gives the **sender** of that transaction. For pons launches the contract creator is the pons
   deployer contract; the sender is the human.
3. `addresses/<sender>`, `addresses/<sender>/counters` and `addresses/<sender>/transactions` give the balance, the
   counts and the last 50 transactions.

If the token is already on the radar, its deployer comes from the `TokenLaunched` event and step 1 and 2 are skipped.

| Row | Meaning |
|---|---|
| wallet | the sender, linked to the explorer, with a tag: FRESH HANDS (one launch in the sample), REPEAT (two to four), SERIAL (five or more), NO HISTORY (the explorer returned nothing) |
| holds | ETH balance and total transaction count |
| launches | calls to the pons factory, the launch router, the launch deployer, plus contract creations, in the last 50 transactions. A `+` means older pages exist and were not read |
| on radar | launches by the same wallet in the radar window, and how many graduated |
| token born | the creation transaction's timestamp |
| last active | the newest of the 50 transactions |

A SERIAL wallet or a wallet under 0.005 ETH becomes a soft red flag and a hot line in AUDIT's stream.

## Price action

| Element | Source |
|---|---|
| candles | GeckoTerminal OHLCV for the deepest pool (`minute` 1/5/15 and `hour` 1), refreshed every 20 s, with the session's live ticks stitched on top and gaps filled like an exchange chart. When GeckoTerminal has not indexed the pool yet, the explorer's swaps build a 1m history instead |
| vwap line | volume-weighted average over the visible candles |
| volume bars | GeckoTerminal volume per candle, live ticks use DexScreener `volume.m5 / 5` |
| 2h activity strip | 24 five-minute cells, brightness is volume, colour is direction |
| high · low · session | the session's ticks |
| closes in | countdown to the running candle's close |

Scroll to zoom, drag to pan, the chart stops following the live edge until you scroll back to it. Replays run the
chart on the recorded clock, so candles rebuild from the recorded ticks.

## Flow pressure

Buys against sells for 5 m, 1 h, 6 h and 24 h from DexScreener `txns`, with the counts. The tag is the net for the hour.

## Paper trade

What 0.1, 0.5 or 1 ETH bought at the moment the token was loaded would be worth **if sold now**: tokens received after
the entry's own impact and fee, then the exit quote for the whole bag against the current reserve. That is why a fresh
position marks negative: the round trip is priced in. `entry now` re-enters at the current price. The session peak is
kept.

## Risk map

Five metrics with a bar and a tag each.

| Metric | Formula | Tags |
|---|---|---|
| exit depth | `liquidity.usd / marketCap` | deep at $250K or 6 %, trap under $50K and 2 %, thin between |
| sell pressure 5m | `sells / (buys + sells)` over five minutes (the hour if the tape is empty) | buyers under 52 %, sellers over 65 % |
| holders ex-pool | top-10 holders with pool accounts removed, share of supply | spread under 35 %, cartel over 60 % |
| volume honesty | `100 − wash score`; wash score is 34 per flag: average ticket under $25 across 800+ trades, turnover over 40×, buys and sells mirrored within 2 % over 500+ trades | organic 80+, painted under 50 |
| contract control | source verification on the explorer, pair age, pool count | open src, opaque |

## Red flags

Hard flags (each caps the survival index at 34, two at 18): dust liquidity under $5K, a 1 ETH exit costing over 25 %,
top-10 outside the pool over 70 %, two or more wash flags. Soft flags: one wash flag, holders between 35 and 70 %, a pair
younger than an hour, unverified source, a serial deployer, an empty deployer wallet.

## Supply map

A treemap of supply: the pool's own account in lime, the top wallets in grey, everyone else in the dark. Holder data is
the explorer's `tokens/<token>/holders` (top 20), supply is `total_supply / 10^decimals`. Click the map to open the
explorer. Below it: source verification, supply, holder count.

## Launch radar

[RADAR.md](./RADAR.md).

## Agent council

Every agent, its vote and the number behind it. A vote bumps when it changes. `council` in the console prints the same.

## Exit simulator

Exit quotes for 0.25, 1 and 3 ETH straight from the reserve: `impact = x / (x + R)`, `out = x × (1 − impact) × 0.997`.
The curve below is impact against size, the dashed line is 5 %. Recomputed every 26 s.

## Council stream

The agents talking: opening lines when a token loads, reactions on every poll (liquidity pulled, price moved, sells
took over), staged exchanges between agents, and the occasional one-liner. Hot lines are orange. Packets fly between
two agents on the stage while they talk.

## Siren

The active alert, its trigger and the three thresholds it watches (pool change, sell pressure, five-minute move) with
their current values. `mute` silences the sound; the frame stays red.

## Status bar and tape

Session clock, tokens this session with their last verdict (click to reload one), sirens fired, next poll, API calls
and polls, the black box frame count (`rec`), and chain stats from the explorer (`stats`). The tape at the bottom is the
trending list: GeckoTerminal trending pools on the chain merged with DexScreener boosted tokens, refreshed every two
minutes; click one to load it.
