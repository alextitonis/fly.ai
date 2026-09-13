# Scoring

The survival index answers one question: **if you had to leave this pool in the next few minutes, would the pool let
you?** It is not a buy signal. A token can 10× from an AVOID; the stamp only says the door was narrow at the time.

Every number below is in `index.html`, in `computeMetrics`, `hardFlags`, `scoreOf`, `verdictsOf`, `liqTrend`,
`drainClock` and `evalAlert`. Change them there; the console's `score` shows the sum part by part.

## Inputs

| Symbol | Meaning | Source |
|---|---|---|
| `liq` | pool depth in USD | DexScreener `liquidity.usd` |
| `R` | the pool's ETH reserve | DexScreener `liquidity.quote` when the quote is ETH/WETH, else `liq / 2 / ethPrice` |
| `mcap` | market cap, or FDV, or supply × price | DexScreener, then the explorer's supply |
| `sell5`, `sell1` | share of sells in 5 m, in 1 h | DexScreener `txns` |
| `top10` | share of supply held by the ten largest accounts | explorer `holders` |
| `topAdj` | the same with the pool's accounts removed | the pair address, and any account holding within 25 % of the pool's base reserve |
| `verified` | source verified on the explorer | explorer `smart-contracts` |
| `age` | pair age | DexScreener `pairCreatedAt` |
| `turnover` | 24 h volume over pool | DexScreener |
| `avgTrade24` | 24 h volume over 24 h trades | DexScreener |

## Exit maths

Constant-product pool, no router: selling `x` ETH worth of tokens into a reserve `R` moves the price by
`impact = x / (x + R)`. What you receive is `x × (1 − impact) × (1 − 0.003)`.

The **safe exit size** is the largest `x` with impact under 5 %: `R × 0.05 / 0.95`.

## Parts

| Part | Max | Formula |
|---|---|---|
| depth | 25 | `max(absolute, relative)`; absolute: ≥ $1M → 25, ≥ $250K → 19, ≥ $50K → 12, ≥ $10K → 6, else 2, unknown 8; relative: `liq / mcap × 250` |
| flow | 20 | `(buyShare − 0.30) / 0.35 × 20`, buy share from 5 m, then 1 h; 10 with no trades |
| holders | 15 | `(70 − topAdj) / 50 × 15`; 7 when the explorer does not answer |
| contract | 15 | verified 15, unknown 7.5, unverified 4 |
| age | 15 | under 1 h → 3, under 6 h → 7, under 24 h → 11, else 15; unknown 6 |
| turnover | 10 | under 0.2× → 3, under 3× → 10, under 15× → 7, else 3; unknown 5 |

Each part is clamped to `[0, max]`, then summed.

## Penalties and caps

**Wash penalty.** Three heuristics, 34 points of wash score each: average ticket under $25 across more than 800 trades;
turnover over 40×; buys and sells within 2 % of each other over more than 500 trades. `total −= washScore × 0.18`.

**Hard flags.** Any one caps the total at 34, two or more at 18:

- dust liquidity: `liq < $5,000`
- exit costs over 25 %: `impact(1 ETH) > 25 %`
- holder cartel: `topAdj > 70 %`
- painted volume: two or more wash heuristics

**Drain cap.** Computed on the session's own history of the pool (`liqTrend`), never on one reading: at least three
polls and 75 s of history, the last three readings not rising. If the pool is down 15 % or more over that window the
total is capped at 30; past −40 % at 15.

## Stamp

| Stamp | Rule |
|---|---|
| ENTER | total ≥ 70 and no hard flag |
| CAREFUL | 40 ≤ total < 70 and no hard flag |
| AVOID | total < 40, or any hard flag |

## Votes

Each agent's vote is its own threshold on its own number; the votes colour the ring around the core and the roster.

| Agent | ok | warn | bad |
|---|---|---|---|
| SCOUT | pair older than an hour | younger | no pool |
| AUDIT | verified | unverified | — |
| WHALE | `topAdj` ≤ 35 % | ≤ 60 % | > 60 % |
| LP | ≥ $250K or ≥ 6 % of cap | between | < $50K and < 2 % |
| FLOW | sells ≤ 52 % | ≤ 65 % | > 65 % |
| VOL | honesty ≥ 80 | ≥ 50 | < 50 |
| SNIPER | impact(1 ETH) ≤ 3 % | ≤ 10 % | > 10 % |
| EXIT | safe size ≥ 0.6 ETH | ≥ 0.06 | < 0.06, or the pool fell 15 %+, or drains inside 10 min |

## Siren

`evalAlert` runs on every poll and keeps the worst trigger:

| Trigger | Level | Rule |
|---|---|---|
| LIQUIDITY LEAVING | bad | `liqTrend.pct ≤ −15` and falling |
| POOL THINNING | warn | `liqTrend.pct ≤ −7` and falling |
| DRAIN PACE | bad under 8 min, warn under 20 | `drainClock`: `(from − to) / span` dollars per second, `liq / perSec` seconds to empty; needs `pct ≤ −8` and falling |
| CRASH | bad | `chg5 ≤ −15 %` |
| DISTRIBUTION | bad | `sell5 > 68 %` and `chg5 < −4 %` |
| NARROW EXIT | warn | safe size `< 0.05 ETH` |

A red trigger turns the frame red, counts a siren in the status bar, writes a hot line in EXIT's stream and, with sound
on, starts the siren tone until the trigger clears or you `mute`.

## What the score cannot see

- Anything not in a public read: intent, team, a locked LP that is about to unlock, a contract with a hidden sell tax.
  `verified` says the source is public, not that it is honest.
- Anything faster than eight seconds. A rug that empties the pool in one block happens between two polls; the siren
  fires on the next one, which is after.
- Holder concentration on tokens the explorer has not indexed: the vote is `n/a` and the part scores 7 of 15.
