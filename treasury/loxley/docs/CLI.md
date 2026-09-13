# The terminal

`loxley` in a terminal is the same desk with the pictures taken away: the same council, the same survival index, the
same siren, the same black box format, plus the things a terminal does better than a browser tab: a feed that never
sleeps, a paper sniper, json for your own pipeline.

Node 18 or newer, no install, no build: the one library the terminal leans on (`viem`, for signing and ABI) is
bundled into `vendor/viem.js` and committed, so a clone or a downloaded zip runs as it is, registry or no registry
(see [vendor/README.md](../vendor/README.md)). Every command under **read** below is a
read. The ones under **trade** can move money, and each of them prints its plan, simulates it, and asks for a word
before it sends; `--yes` answers for you, `--dry` stops at the plan.

## Install

```sh
git clone https://github.com/shmidtqq65/loxley && cd loxley
node bin/loxley.js doctor            # or:  npm install -g github:shmidtqq65/loxley  →  loxley doctor
```

`.env` next to the package or in the working directory overrides the defaults; `.env.example` lists every key.
`--rpc URL` and `--explorer URL` override for one run. `NO_COLOR=1` strips colour, `--no-logo` drops the banner,
`--no-links` prints plain text where a terminal would get a clickable link, `--json` on `hunt` prints one JSON
object per line and nothing else. On Windows the `start/*.cmd` files run the common commands on a double-click.

The explorer is two things. `EXPLORER_URL` is the web explorer every printed link is built from. `EXPLORER_API` is
the rest base the terminal reads, and it is a different host: Blockscout serves Robinhood Chain's api from
`api.blockscout.com/4663` behind a key, and the per-chain host answers `403` to every unauthenticated call. A free
key at dev.blockscout.com (five requests a second, about five thousand calls a day) goes in `EXPLORER_API_KEY`;
calls are spaced `EXPLORER_SPACING_MS` apart so a burst of enrichment stays inside it. Without a key the deployer
x-ray, the transaction counts and the token page read `n/a`, and nothing else changes. Point `EXPLORER_URL` at your
own blockscout and the api follows it, so a self-hosted instance needs neither of the new lines.

`doctor` separates the chain from everything around it. The rpc, the head block, the factory and its logs are the
chain: a `FAIL` there is why `hunt`, `radar`, `watch` and `snipe` fall back to `--sim`, and it is the only thing
that sets a non-zero exit code. The explorer, dexscreener, the pool leg contracts and the wallet's balance print
`WARN` when they are unhappy, because each one degrades on its own: the x-ray reads `n/a`, the market table is
empty, a graduated token cannot be traded, an unfunded wallet still reads and still runs on paper. Every warning
says what is lost and what still works. When an http source refuses, the reason is printed rather than `no answer`:
`http 403` (an edge filter, common from a vpn exit), `http 429`, a dns miss, a refused port, or a timeout with the
`HTTP_TIMEOUT_MS` that produced it. `HTTP_USER_AGENT=` sets what those two sources see as the client.

The banner is drawn, not typed: `cli/banner.js` paints the wordmark and the arrow into a small 1-bit canvas and
folds it two pixels at a time into the quadrant blocks, so one character cell carries four pixels. It picks the
widest shape the window can hold: the full mark at 66 columns or more, the word alone at 44, the plain word under
that. `LOXLEY_BANNER=arrow|word|plain` pins one; `NO_COLOR=1` drops the green ramp and leaves the shape.

Every card and every table ends with links: the token on **pons**, the curve on **axiom**, the token on **fomo**, the
explorer, dexscreener. In Windows Terminal, iTerm2, kitty and VS Code they are ctrl+clickable (OSC-8); elsewhere the
URL is printed. The line under the banner carries sign-up links for axiom and fomo with the handles in `REF_AXIOM`
and `REF_FOMO`; put your own there, or empty them to drop the line.

## Start here

### tour

```
loxley tour [--fast] [--step]
```

Every command in this document, run in order against the mock chain in `test/`, on launches it mints while you
watch. It needs no wallet, no ether, no configuration, no network and no install: a clone and `node bin/loxley.js
tour` is the whole setup.

What it does before it starts: brings up `test/mock-chain.js` inside the same process (the rpc, the explorer and
DexScreener on one loopback port), points `PRIVATE_KEY` at a published throwaway key the mock funds out of nothing,
and points `LOXLEY_HOME` at a fresh temp folder. Your keystore is never opened, your `.env` is never read, and the
temp book is deleted when the tour ends. Then it runs the real commands, as child processes, exactly as you would:

| Chapter | Command | What it is there to show |
|---|---|---|
| 1 | `doctor --probe` | the chain answers, the factory has code, a live curve reads |
| 2 | `market --top 10` | the recorded Robinhood Chain market, stamped |
| 3 | `scan` | one pool read to the bottom: council, survival index, exit table |
| 4 | `hunt` | four launches land: one clean, then three with one operator's fingerprint |
| 5 | `snipe --live` | a refusal with its rule, the draw, a signed fill, marks, the DEV SOLD siren |
| 6 | `follow --live` | a tracked wallet buys, the desk mirrors it and leaves on its own rule |
| 7 | `snipe --grad` | a curve fills, graduates, and the desk buys the pool as it opens |
| 8 | `buy`, `watch --guard` | a position handed to the guard, sold when the deployer's tokens move |
| 9 | `fees`, `dev`, `wallet`, `claim` | who is paid on a launch, and taking your own fees out |
| 10 | `positions`, `profile` | the book those fills made, and the record it adds up to |
| 11 | `radar --sim` | the launch window drawn in characters |

`--fast` shortens the script without reordering it (about ninety seconds instead of three and a half minutes);
`--step` waits for a keypress between chapters. A lever that the mock refuses is caught and printed rather than
taking the tour down.

## Read

### doctor

```
loxley doctor [--probe]
```

Chain id (expects 4663), head block and block time measured over the last 400 blocks, code at the factory address,
launches and graduations in the last 2 000 blocks, the explorer's stats, DexScreener's boost list, the wallet (which
one, from where, its balance, open positions in the book) and code at the pool-leg contracts (router, quoter, state
view, permit2). `--probe` also reads one live curve: real quote, fee, creator tax, opening tax now, graduated. Exit
code 1 when a check fails, with a pointer at `--sim`.

### market

```
loxley market [--top N] [--by liq|vol|age|change|score] [--token 0x…] [--json]
```

What is trading on Robinhood Chain right now. DexScreener's two lists for the chain (the boosted tokens and the
latest token profiles, the same endpoints the browser desk reads) give the addresses; one batch call per thirty of
them (`tokens/v1/robinhood/…`, falling back to one call per token) gives every pool, and the deepest pool per token
is kept. Each row is then judged by the desk's pool rules on what a pool answers: depth, flow, age, turnover, the
wash flags; the explorer's two votes (source, holders) are left to `scan`, so the score here tops out below 100.

```
  token         price        1h      24h      pool    vol 24h  flow 24h  age    1 ETH out  stamp         address
  ────────────  ───────────  ──────  ───────  ──────  ───────  ────────  ─────  ─────────  ────────────  ───────────
  $CHUMP        $0.04105     +2.0%   +31.1%   $1.17M  $2.64M   55% buys  37d    0.4%        ENTER  79    0x0e0d…c21b
  $ORBIT        $0.000119    -38.9%  -62.5%   $79.6K  $81.6K   56% buys  1d     5.9%        ENTER  80    0x62f1…1e18
  $ORDIHOOD     $0.000271    -14.0%  -11.8%   $48.3K  $681.0K  57% buys  4d     9.4%        ENTER  77    0xb27a…71bc
  $WASTED       $0.000194    -7.1%   +632.0%  $30.7K  $424.1K  57% buys  22.3h  14.0%       ENTER  72    0x2bbd…188c
  $Stocker      $0.0000176   +2.4%   -97.2%   $12.3K  $1.48M   43% buys  2d     29.0%       AVOID  34    0x1f20…ab1c
  $STOCKFATHER  $0.00000576  +0.3%   -37.3%   $7.0K   $10.4K   63% buys  2d     41.6%       AVOID  34    0x5d15…ae3e
```

Those rows are a transcript: `node scripts/sample.js market` prints them, against the recording of the real
Robinhood Chain market the mock serves (`test/dex-fixture.js`). $ORBIT stamped ENTER while it is down 62 % on the
day is the point of the stamp, not a bug in it: the index measures whether you could leave that pool, not where the
price is going. $WASTED is quoted in TTWO rather than in ether, which is why the ether price is a median and the
exit is priced in dollars.

The table fits the terminal by measuring itself: it is built with every column, and while it is wider than the
window the most disposable column still standing is dropped and it is built again, in this order: address, `1h`,
`24h`, `flow 24h`, `vol 24h`, `age`. Token, price, pool, the exit and the stamp are what the table is for and never
go, and a footer says what a wider window would add back. `1 ETH out` is what selling
one ETH's worth into that pool would move the price by, measured against half the pooled value, so an ETH pair and a
stock-token pair are measured the same way; the ETH price itself is the median of the ETH-quoted pairs on the page,
never one odd pool's `priceNative`. A score here stops at **85 out of 100**: the fifteen points for a verified source
and the holder spread need the explorer, which is `scan`'s job, and the footer says so. `--by` sorts, `--top` cuts,
`--token 0x…,0x…` adds addresses DexScreener does not list, `--json` prints one object per row. Symbols are links to
the token's DexScreener page; a symbol with emoji or CJK in it is measured in terminal cells, so the column stays
straight.

### hunt

```
loxley hunt [--window N] [--for S] [--min-score N] [--fire-only] [--no-follow] [--json] [--sim]
```

On start: the head, the block time, then the deployer index: every `TokenLaunched` and `PoolGraduated` in the last
`WINDOW_BLOCKS` (12 000 by default, about fifty minutes) read from the factory through `eth_getLogs` in
`LOGS_CHUNK` pieces. Then one card per launch, newest three from the index first, then live ones as they land
(`eth_blockNumber` every `POLL_MS`, `eth_getLogs` for the new blocks):

```
15:51:34  $HOODCAT Hood Cat  0x0000000000000000000000000000000000005007   FIRE  100
          deployer 0xabab…abab  first in the window
          socials x web  fees → deployer  exempt wallets 0  a cat in a hood, nothing more
          dev buy 3.00% (0.0530 ETH)  creator tax 1.0%  fee 1.0%  pair ETH  opening tax now 99%
          curve ░░░░░░░░░░░░ 1% · 0.05/4.20 ETH · fdv 1.79 ETH
          door  0.05 ETH leaves at 2.81% impact · gets 0.0476 ETH · safe 0.091 ETH · 1.0% fee + 1.0% tax
          score +15 dev buy 3.00%, inside the 1–6% band · +10 creator tax 1.0%, creator earns on volume
                +5 pair ETH pair · +16 socials X + website · +5 bundle no declared bundle wallets
                +5 deployer first launch in the window
          read in 30 ms
15:51:49  +15s $HOODCAT  curve 1% · 0 buyers ·  FIRE  100 · block-0 0.0% · top-5 0%
```

That card is a transcript, not a sketch. `node scripts/sample.js` starts `test/mock-chain.js`, mints exactly this
launch and runs the commands this page quotes, so every figure on it can be reproduced and checked, and each one is
derived rather than typed in:

| Figure | Where it comes from |
|---|---|
| `dev buy 3.00% (0.0530 ETH)` | 30M tokens on a fresh curve need `30e6 · 1.68 / (1e9 − 30e6)` = 0.051959 ETH of quote, which is 0.0530 ETH sent once the 1 % curve fee and the 1 % creator tax are added back. Add the factory's 0.0005 ETH launch fee and the deployer's transaction cost 0.0535 ETH |
| `curve 1% · 0.05/4.20` | the dev's buy is the only quote on the curve so far: 0.052 of the 4.2 ETH it needs |
| `fdv 1.79 ETH` | price is `quote / tokens` = `(1.68 + 0.052) / (1e9 · 1.68 / 1.732)`, so the fdv is `(1.68 + 0.052)² / 1.68` |
| `door 2.81% · 0.0476 ETH` | `0.05 / (0.05 + 1.732)` impact, then the 1 % fee and the 1 % tax off what comes back |
| `safe 0.091 ETH` | the size that keeps impact under 5 %: `quote · 0.05 / 0.95` |
| `FIRE 100` | 50 + 15 + 10 + 5 + 16 + 5 + 5 = 106, held at 100 by the clamp; the parts always sum to the badge unless the clamp bites at 0 or 100 |

A launch whose fingerprint matches other fresh wallets in the last 30 minutes carries a red **FARM** badge and the
line `launch farm: N siblings inside 30 min`. The whole card is one `aggregate3` on multicall3 (curve, token, factory
record) plus the receipt and `getTokenInfo()`, which is the `read in` figure: about 200 ms on the mock, a few
hundred against the real node.

| Line | Read |
|---|---|
| symbol, name | `symbol()` and `name()` on the token, `totalSupply()` for the share maths |
| deployer | the event's `deployer` topic; the record is the index: launches, graduations, twins inside 30 minutes |
| socials | `getTokenInfo()` on the token: X, telegram, website, discord, farcaster as the deployer declared them, plus the description; `none` when it declared nothing |
| fees → | the factory record's `creatorFeeRecipient`; `deployer` when it is the deployer, `third party 0x…` when the fees go somewhere else |
| exempt wallets | the `snipeTaxExemptions` array decoded from the launch transaction's `launchAndBuy` calldata: wallets the deployer excused from the opening tax, a bundle declared in the open |
| dev buy | `CurveBuy` logs inside the launch transaction's receipt, as a share of supply, with the quote paid |
| creator tax · fee | `creatorTaxBps()` and `feeBps()` on the curve |
| pair | the event's `pairToken`; the zero address is ETH, anything else is read for its symbol |
| opening tax now | `currentSnipeTaxBps(address)` on the curve, for a throwaway address |
| curve | `realQuoteReserve()` against the event's `graduationThreshold`; price and fdv from `getReserves()` (the full quote reserve, phantom included, over the token reserve), exact; `PHANTOM_ETH` stands in only when that call fails, and then the number says `est` |
| door | selling 0.05 ETH worth into the curve now: `impact = x / (x + quoteReserve)`, then fee and tax; the safe size keeps impact under 5 % |
| score | [the launch score](#the-launch-score) |
| +15 s · +60 s | fill again, distinct buyers and sells from `CurveBuy` / `CurveSell` logs on the curve, how many buys paid the opening tax, the score again; **block-0**: the share of supply bought in the launch block by wallets other than the deployer, and how many; **top-5**: what the five biggest curve buyers hold; **dev sold**: `CurveSell` by the deployer or a `Transfer` out of its wallet, as a share of supply |

`GRAD` lines announce a `PoolGraduated` for a token on screen, with the `loxley watch` command ready to paste.

### radar

```
loxley radar [--window N] [--for S] [--sim]
```

The launch radar in characters. Newest at the centre, rings at 1 m, 5 m, 15 m and 1 h, a sweep that lights blips as
it passes; lime for a first launch, amber for a wallet with two or three in the window, red for four or more, green
for graduated, blue for a non-ETH pair. The list on the right carries what the picture cannot: verdict, curve fill,
deployer. Curve fill refreshes every twelve seconds for the ten freshest. Needs a terminal at least 100 columns wide.

### scan

```
loxley scan <token>
```

Everything about one address, in the order you would ask:

- **CURVE**: the launch event (found by `eth_getLogs` with the token as the indexed topic), fill, pair, fee and tax,
  opening tax now, graduated, the exact price and fdv from `getReserves()`, `phase()`, and the door on the curve for
  0.01 / 0.05 / 0.1 / 0.5 ETH while there is no pool.
- **LAUNCH**: deployer, socials and the description from `getTokenInfo()`, the fee recipient (`the deployer` or
  `third party 0x…`), the exempt wallets declared in the launch calldata, dev buy from the receipt, curve trades
  (buys, sells, distinct buyers, taxed buys, quote in and out), the block-0 bundle (supply taken in the launch block
  by other wallets, and the top-5 buyers' share), whether the dev sold, the launch transaction, the links (pons,
  axiom, fomo, explorer, dexscreener), and the launch score with the new rules counted.
- **POOL**: when DexScreener has a pair: price and changes, market cap and pool, reserve, flow, volume and turnover,
  holders with the pool removed (the explorer's holder book), source verification, pair age.
- **COUNCIL**: the eight votes, the survival index part by part, hard flags, and the exit table for 0.25 / 1 / 3
  ETH from the reserve.
- **X-RAY**: the sender of the launch transaction, its balance and counts, launches in its last 50 transactions,
  when the token was born, when the wallet last moved.
- **WALLET**, when there is one: what it holds of the token, what leaving fetches right now on the curve or in the
  pool, the book's positions and their p&l if you leave now, and the two commands that leave.

### watch

```
loxley watch <token> [--every S] [--for S] [--rec FILE] [--paper ETH] [--sim]
loxley watch <token> --guard [--tp PCT] [--sl PCT] [--siren-only] [--stay] [--yes]
```

The exit watch: DexScreener every `--every` seconds (8 by default), the explorer's holder book every fifth poll,
one line per poll:

```
17:05:41  $0.00222  mcap $2.22M  pool $124.2K  ▼1.3%  sells 64%  safe 0.82 ETH  ███░░░░░░░  30  AVOID   paper -13.7%  ■ LIQUIDITY LEAVING
           SIREN  LIQUIDITY LEAVING  pool went from $147.0K to $124.2K over 656s across 83 polls · signal only, nothing is traded for you
```

The siren is `evalAlert` from the desk on the session's pool history: LIQUIDITY LEAVING, POOL THINNING, DRAIN PACE,
CRASH, DISTRIBUTION, NARROW EXIT. A red trigger rings the terminal bell. Stamp changes are printed when they have
held for two polls; a vote is printed when it turns to `bad`, once a minute per agent. `--paper 0.5` marks a paper
position bought on the first poll and sold into the current reserve on every poll, the round trip included.
`--rec box.json` writes the black box after every poll in the desk's own format: drop the file on the browser desk, or
`loxley replay` it.

`--guard` is the same watch with a hand on the door: it needs a wallet that holds the token, prints what it holds
and what leaving fetches now, asks for the word `guard`, and then sells the whole holding the moment a red siren
sounds (LIQUIDITY LEAVING, DRAIN PACE, CRASH, DISTRIBUTION, **DEV SOLD**) or, when the book knows the entry, when
take profit, stop loss or the trailing stop trip (`--tp`, `--sl`, `TRAILING_PCT`). `--siren-only` ignores the p&l
rules. DEV SOLD is read on every poll straight from the chain, not from DexScreener: a `CurveSell` by the deployer or
a `Transfer` out of its wallet since the last poll. The sell goes wherever the launch trades now (curve or pool) and
is recorded in the book; the watch ends after it unless `--stay`. See [Trade](#trade) for what a sell is.

### xray

```
loxley xray <token | wallet>
```

A contract address resolves to the wallet that sent its launch (from the `TokenLaunched` event when there is one, the
creation transaction otherwise); a wallet reads directly. Balance, counts, launches in the last 50 transactions,
first and last activity, the tag: FRESH HANDS, REPEAT, SERIAL, NO HISTORY.

### dev

```
loxley dev <wallet> [--window N]
```

One deployer's record: every `TokenLaunched` with the wallet as the indexed deployer in the last `--window` blocks
(400 000 by default, about a day), one topic-filtered `eth_getLogs`, then the factory record of each launch for its
phase. Badge: **FRESH** (one launch), **REPEAT**, **SERIAL** (five or more, none graduated). This is the record the
deployer line of every card is built from, in full.

```
0xd1d1…d1d1   REPEAT   4 launches · 1 graduated · 0 swept · window 400000 blocks
  when     token   phase         tax   address
  7m ago   $MK6    on the curve  7.0%  0x7777…
  14m ago  $MOCK   pool created  1.0%  0x1111…
```

### fees

```
loxley fees <token>
```

Who is paid on a token and how much: the fee recipient from the factory record (the deployer, or a third party),
the creator tax, every `Credited` to the recipient on the pons escrow split by depositor (the curve before
graduation, the pool hook after), every `Claimed`, and the escrow's `balanceOf(recipient)`, which is what is still
unclaimed across all of that recipient's tokens. The CLAIMS table carries the block time and the transaction.

The last line is the command checking itself: `credited − claimed` has to equal the escrow balance, and when it does
not, the difference is named. The window starts at the launch block, so a recipient that was paid on an earlier
token of its own shows a gap there, and the line says which way it goes rather than leaving three numbers that do
not add up on the screen.

### exit

```
loxley exit <token> [eth]
```

The door, priced now: from the pool's reserve when there is a pool (`impact = x / (x + R)`, 0.3 % fee), from the
curve when there is not (`impact = x / (x + phantom + real)`, the curve's fee and creator tax). Without a size:
0.1 / 0.25 / 0.5 / 1 / 3 ETH.

### snipe

```
loxley snipe [--eth X] [--min-score N] [--max-open N] [--budget X] [--tax-ceiling BPS] [--draw S] [--allow-pairs]
             [--keyword REGEX] [--deployer 0x…,0x…] [--tp PCT] [--sl PCT] [--hold MIN] [--for S] [--rec FILE] [--sim]
loxley snipe --live [the same flags] [--slippage BPS] [--exit-on-stop] [--yes]
loxley snipe --grad [--live] [the same flags]
```

The sniper. Detect → read → decide → draw → fire → mark → leave. On paper by default; `--live` fires from the wallet
(see [Trade](#trade)). `--grad` fires on the other trigger: not `TokenLaunched` but `PoolGraduated`, a buy in the v4
pool the moment the curve closes, on a launch that passes the same rules.

1. **decide**: the launch score against `MIN_SCORE`, ETH pairs only (always, when live), dev share ≤
   `MAX_DEV_SHARE`, creator tax ≤ `MAX_CREATOR_TAX`, twins ≤ `MAX_TWINS`, declared exempt wallets ≤ `MAX_EXEMPT` (0:
   any declared bundle is a pass), block-0 bundle ≤ `MAX_BUNDLE_PCT`, no launch farm (`REFUSE_FARMS`), socials
   present if `REQUIRE_SOCIALS`, open positions < `MAX_OPEN` (`LIVE_MAX_OPEN` when live, the book's open positions
   counted), budget not spent (`LIVE_BUDGET_ETH` when live), keyword and deployer filters. Every refusal prints the
   rule that said no.
2. **draw**: `currentSnipeTaxBps()` every 150 ms (200 when live, for the wallet's own address) until it is at or
   under `TAX_CEILING_BPS`, `DRAW_MAX_S` seconds at most. The line reports the tax at release and the milliseconds
   since the read.
3. **fire**: on paper, a position of `PAPER_ETH` at the curve's exact price after fee, tax and the entry's own impact.
   Live, a signed `buy()` on the curve for `LIVE_ETH` with a minimum output from the quote and `SLIPPAGE_BPS`; the
   line carries the tokens received from the receipt's `CurveBuy`, the tax and fee paid, the block, the gas, the
   transaction link, and the position's id in the book.
4. **mark** every `MARK_EVERY_S` seconds: on paper, the curve price against the curve's quote; live, the exact exit
   quote for the position's remaining tokens (`quoteSell` on the curve, the v4 quoter in the pool). After graduation
   the desk's siren runs on DexScreener's pool history either way.
5. **leave**: take profit `TAKE_PROFIT_PCT`, stop `STOP_LOSS_PCT`, trailing `TRAILING_PCT` below a peak of at
   least +10 %, max hold `MAX_HOLD_MIN`, a red siren on the pool (LIQUIDITY LEAVING, CRASH, DISTRIBUTION), or
   **DEV SOLD**: on every mark the desk reads the deployer's `CurveSell` and `Transfer` logs since the fill, and the
   first one is a siren and a close, whatever the p&l. On paper the close is a mark; live it is a signed sell
   wherever the launch trades now. Between the sweep and the pool nothing can sell: the position prints WAIT and
   retries on every mark until the pool opens.

`ctrl+c` or `--for` ends the session. On paper every open position is marked and closed; live, open positions stay
open in the book (`loxley positions`, `loxley sell`) unless `--exit-on-stop`, which sells them all first. The table
and the P&L follow. `--rec session.json` writes the positions and the rules.

Live sessions print the wallet, the per-shot size, the budget, the rules and the exits, then wait for the word
`fire` (or `--yes`). A wallet that holds less than one shot is refused before anything is read.

With `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` or `DISCORD_WEBHOOK` set, every FIRE, CLOSED, SIREN and WAIT is also
sent there, prefixed `LOXLEY ·`; the plan line `alerts` says where. The same goes for `follow` and `watch --guard`.

### replay

```
loxley replay <file.json> [--speed N] [--paper ETH]
```

Any black box: from the browser desk's `export`, from `watch --rec`, or `recordings/sample-drill.json`, which ships
with the repository so the command works before you have a chain in reach. Frames play through the same rules on the
recorded clock; a drill says so in its badge.

### desk

```
loxley desk [token]
```

Opens `index.html` in the default browser, on the token if you name one.

## Trade

Seven commands can move money: `buy`, `sell`, `claim`, `snipe --live`, `follow --live`, `watch --guard`, and
`wallet` only in the sense that it holds the key. Each one reads first, prints a plan, simulates the transaction
with `eth_call`, refuses on a revert, asks for a word (`buy`, `sell`, `claim`, `fire`, `follow`, `guard`) unless
`--yes`, and only then signs and sends. A transaction that would fill worse than its quote by more than
`SLIPPAGE_BPS` reverts on chain instead of settling.

### wallet

```
loxley wallet                 # show: address, source, balance, unclaimed creator fees, open positions
loxley wallet import          # paste a private key or a seed phrase (hidden), choose a passphrase → ~/.loxley/wallet.json
loxley wallet import --from-env   # take PRIVATE_KEY or MNEMONIC from the environment and encrypt it the same way
loxley wallet new             # a fresh seed phrase, shown once, encrypted the same way: a burner for the sniper
loxley wallet balance [token…]
loxley wallet forget --yes    # overwrite and delete the keystore
```

Three ways in, in this order: `PRIVATE_KEY` in `.env` or the environment; `MNEMONIC` (+ `MNEMONIC_INDEX`, path
`m/44'/60'/0'/0/i`) in the same places; the keystore, unlocked by a passphrase typed on the terminal or read from
`LOXLEY_PASSPHRASE`. The keystore is scrypt (N = 2^17) + AES-256-GCM, mode 600; a wrong passphrase fails the
authentication tag and nothing is decrypted. `LOXLEY_HOME` moves the whole directory (keystore, book, router state).
The key is never accepted as a command line argument.

### buy

```
loxley buy <token> <eth> [--slippage BPS] [--max-tax BPS] [--dry] [--yes]
```

`getLaunchedToken(token)` on the factory says where the launch is:

- **phase 0, on the curve**: `getReserves()`, `realQuoteReserve()`, `sellableTokens()`, `feeBps()`,
  `creatorTaxBps()`, `readyToGraduate()`, `graduated()` and `currentSnipeTaxBps(you)` in one read; the quote is the
  curve's own integer maths (`fee`, `creator tax` and `opening tax` off the top, then `x · R_token / (R_quote + x)`,
  capped at the sellable supply with the excess refunded); an opening tax above `--max-tax` (`TAX_CEILING_BPS`) is
  refused with exit code 2, because it decays and waiting is free. The send is `buy(quoteIn, minTokensOut, you)` with
  `value = quoteIn`.
- **phase 2, pool created**: the pool key is `{ETH, token, fee, tickSpacing, ponsHook}` (currencies sorted, ETH is
  the zero address; the first key whose `getSlot0()` on the v4 state view is initialised is kept in
  `~/.loxley/state.json`); the quote is `quoteExactInputSingle` on the v4 quoter; the send is `execute()` on the
  universal router with `SWAP_EXACT_IN_SINGLE → SETTLE_ALL → TAKE_ALL`, `value = amountIn`. The router's parameter
  layout (with or without `minHopPriceX36`) is found by simulating each and remembered.
- **phase 1 or 3, swept or rescued**: nothing trades; the command says so and exits with code 2.

A fill opens a position in the book: token, tokens received from the receipt, ETH in, tax, venue, block, hash.

### sell

```
loxley sell <token> [all|half|25%|1500000|1.5m] [--slippage BPS] [--dry] [--yes]
```

What the wallet holds, by `balanceOf`; the amount is all of it by default. The venue follows the phase: on the curve
`approve(curve)` if needed then `sell(tokensIn, minQuoteOut, you)`, refused while `readyToGraduate()` (the curve is
closed, the pool is not there yet); in the pool `approve(permit2, max)` and `permit2.approve(token, router, max, max)`
if needed (once per token), then `execute()` the other way round, ETH out measured from the balance delta with the
gas added back. The exit is spread over the token's open positions in the book, oldest first; a position whose
tokens are all gone closes with its realised p&l.

### positions

```
loxley positions [--all] [--json] [--clear --yes]
```

The book at `~/.loxley/positions.json`: every fill loxley made, with what the remaining tokens fetch right now
(`quoteSell` on the curve, the v4 quoter in the pool, `halted` in between), the p&l counting what was already
realised, the venue, the age, and totals. `--all` adds the closed ones. Marks need no passphrase; sells do.

### profile

```
loxley profile [--days N] [--json]
```

The desk's own record, from the book and from `~/.loxley/stats.json`, the tally the sniper keeps of every launch it
refused and the rule that refused it. Fires, closed and open, wins and the win rate, average win, loss and hold,
realised p&l on what was deployed, a bar per day for the last thirty, the best and the worst positions with the
rule that closed them, exits by reason, the sirens that pulled the trigger, the refusals by rule, and the last eight
closed positions. Nothing here leaves the machine.

### follow

```
loxley follow <wallet…> [--eth X] [--budget X] [--any] [--for S] [--rec FILE]
loxley follow <wallet…> --live [--slippage BPS] [--exit-on-stop] [--yes]
```

Copy the entries of wallets you trust. One topic-filtered `eth_getLogs` per poll (`CurveBuy`, buyer in the tracked
set, no address filter, so any curve counts) finds every buy they make the moment it lands. The launch behind it is
read like a card, goes through the sniper's rules (or none, with `--any`: their judgement is the rule), and is
mirrored with your own size: a paper position by default, a signed curve buy with `--live`. The mirror leaves on the
sniper's exits, the dev-sold siren included, not when the wallet you follow leaves. The FOLLOW line says who bought
what, when, and what it paid in opening tax; the FIRE line says `mirror of 0x…`.

```
11:17:05   FOLLOW  0xabab…abab bought 0.0500 ETH of $MIRR · block 53400109 · tax paid 0.00050 ETH · 1190 ms after the poll
11:17:05   FIRE  $MIRR  paper 0.003 ETH → 1.35M tokens · tax at entry 0.00% · 0 ms after the read · price 2.194e-9 ETH · mirror of 0xabab…abab
```

The word to arm a live session is `follow`. `loxley dev 0x…` and `loxley xray 0x…` are how you decide whether a
wallet deserves following.

### claim

```
loxley claim [--dry] [--yes]
```

Your creator fees out of the pons escrow: `balanceOf(wallet)`, then `claim()`, simulated first, armed by the word
`claim`. `loxley wallet` shows the unclaimed balance; `loxley fees <token>` shows where it came from.

### snipe --live, follow --live and watch --guard

Described under [snipe](#snipe), [follow](#follow) and [watch](#watch). All three use the same buy and sell paths as
the commands above, with the same simulation, minimum output and book.

### What can go wrong, and what happens

| Case | What loxley does |
|---|---|
| the simulation reverts (slippage, tax, closed curve, no pool) | prints the reason, sends nothing, exit code 1 |
| the transaction reverts on chain | prints the hash and `reverted on chain`, the book is untouched |
| the receipt does not arrive in `TX_TIMEOUT_MS` | prints the hash; check it on the explorer, the book is untouched |
| the launch is swept before you sell | `sell` and the sniper wait for phase 2 and say so |
| the pool cannot be found after graduation | no swap is attempted; the tokens stay where they are |
| the deployer sells while you hold | the sniper and the guard print the DEV SOLD siren and sell; `scan` and the +15 s / +60 s lines say `dev sold` |
| the passphrase is wrong | `wrong passphrase`, exit code 1, nothing decrypted |
| no terminal and no `--yes` | the arm refuses, exit code 3, nothing sent |

## The launch score

What the chain says about a launch in its first minute. It starts at 50 and moves:

| Signal | Points |
|---|---|
| dev buy between 1 % and 6 % of supply | +15 |
| dev buy over 10 % | −25 |
| no dev buy | −10 |
| creator tax ≤ 2 % | +10 |
| creator tax > 5 % | −25 |
| fees paid to a third party, not the deployer | −5 |
| ETH pair | +5 · non-ETH pair −5 |
| socials declared in `getTokenInfo()`: X +8, website +8, telegram +4, capped at +16 | up to +16 |
| no socials at all | −15 |
| no wallet declared exempt from the opening tax | +5 |
| one or more wallets declared exempt (a bundle in the open) | −25 |
| launch farm: the same dev buy to the wei, tax and links from other fresh wallets inside 30 min | −25 |
| first launch by the wallet in the window | +5 |
| the wallet graduated 30 % or more of its launches in the window | +15 |
| five or more launches in the window, none graduated | −25 |
| one more launch by the same wallet inside 30 minutes | −8 · two or more −25 |
| ten or more distinct buyers in the first minute | +10 |
| every early buy paid the opening tax | −10 |
| block-0 bundle over `MAX_BUNDLE_PCT` of supply (+15 s and +60 s) | −20 |
| the top-5 curve buyers hold over 40 % of supply (+15 s and +60 s) | −10 |
| curve half full | +8 |

**FIRE** at 75, **WATCH** at 45, **SKIP** below. It is not the survival index: that one needs a pool and lives in
`scan`, `watch` and the desk. The launch score says whether a launch is worth the paper; the survival index says
whether a pool can carry an exit.

## The rpc gate

One request at a time, `RPC_SPACING_MS` apart, `eth_getLogs` at least `RPC_LOGS_SPACING_MS` apart, a 429 backs off two
seconds and retries, a timeout retries once, and two dead answers in a row open the gate for twenty seconds so a
command fails in a second rather than in nine per call. Ranges the node refuses are split in half until it accepts
them. Every command prints its call count when it ends.

## The mock chain

```sh
loxley tour           # the guided version: the mock, started, driven and closed for you
npm run mock          # the unguided one: a chain, an explorer and a dexscreener on 127.0.0.1:4663
RPC_URL=http://127.0.0.1:4663 EXPLORER_URL=http://127.0.0.1:4663 DEX_URL=http://127.0.0.1:4663 loxley hunt
```

`test/mock-chain.js` answers every read the cli makes with fixtures: a graduated token with a pool, a serial wallet,
a few fresh curves (one with three declared exempt wallets, one with no socials), a fee escrow with credits and a
claim, a launch every few seconds, and, on the DexScreener side, a **recording of the real market**: the twelve
tokens DexScreener listed on Robinhood Chain on 2026-09-06 with their deepest pool (`test/dex-fixture.js`), each
with an ERC-20 and an explorer record on the mock, so `market` and `scan` read whole pages of real names, prices,
pools and volumes. Two of those pairs are quoted in a stock token rather than in ether, which is the case the
ether-price median and the dollar-denominated exit exist for.

Nothing in it is a number typed in beside another one. A curve's token reserve is `supply · 1.68 / (1.68 + real)`,
so at the 4.2 ETH threshold exactly 1.68/5.88 = 28.571 % of supply is left, which is the share the pool is owed; the
deployer's quote is the ETH his tokens actually cost on a fresh curve; the buys in the logs are the ones that
carried the curve from his buy to its reserve; the three cuts on a buy come off one after another, so 99 % + 1 % +
1 % is 100.98 % of nothing rather than a negative reserve; and the graduated fixture's pool, its price, depth, cap
and age all descend from the graduation that made it. `node scripts/sample.js` prints it all.

It also accepts signed transactions and mines them into its own state, so
`wallet`, `buy`, `sell`, `claim`, `positions`, `snipe --live`, `follow --live` and `watch --guard` all run against
it, with every wallet starting at 1 ETH of nothing. The tests run against it; so can you, on a plane, before a single
real wei moves.

The mock has levers, so a rehearsal can be scripted from a second terminal:

```sh
curl -X POST 127.0.0.1:4663/__mock/launch    -d '{"sym":"CAT","decayMs":0,"deployer":"0xb1b1…"}'   # a launch now
curl -X POST 127.0.0.1:4663/__mock/walletBuy -d '{"wallet":"0xabab…","token":"0x…","eth":0.05}'  # a CurveBuy by a wallet (follow)
curl -X POST 127.0.0.1:4663/__mock/graduate  -d '{"token":"0x…"}'                                # PoolGraduated, a pool opens (snipe --grad)
curl -X POST 127.0.0.1:4663/__mock/devSell   -d '{"token":"0x…","pct":4}'                        # the deployer moves 4% of supply out (DEV SOLD)
curl -X POST 127.0.0.1:4663/__mock/sweep     -d '{"token":"0x…"}'                                # LaunchSwept: halted between the curve and the pool
curl -X POST 127.0.0.1:4663/__mock/crash     -d '{"token":"0x…"}'                                # the pool's reserve drains (the siren)
curl -X POST 127.0.0.1:4663/__mock/credit    -d '{"recipient":"0x…","eth":"0.2"}'                # creator fees credited to a wallet (claim)
curl -X POST 127.0.0.1:4663/__mock/alerts                                                        # what the mock's telegram/discord received
```

With `TELEGRAM_API=http://127.0.0.1:4663` the mock also plays the telegram and discord endpoints and records what it
was sent, which is how the alert tests run.

## Exit codes

0 done · 1 a failed check, a bad argument, a revert · 2 refused by a rule (tax ceiling, halted phase) · 3 the arm was
not given
