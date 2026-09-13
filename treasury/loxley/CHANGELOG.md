# Changelog

## 1.3.7 · 2026-09-07

Standing on its own.

- the issue template pointed at the wrong account. It points here now
- the scheduled hunt log is manual until you switch it on, so a fresh clone never shows a red run for a
  job nobody configured. Uncomment two lines in `.github/workflows/hunt-log.yml` to arm it

- the signature line is now **the entry is a guess. the exit is arithmetic.** It says the thing the terminal is
  actually for without leaning on anyone else's name, and it is in the help footer, the README, the browser desk
  and the three marks
- **every figure in the README is one this repository takes itself.** The launch rate is no longer a number
  borrowed from elsewhere: it is 52 launches and 0 graduations in the last 2 000 blocks, read off mainnet at head
  56 423 207, and `loxley doctor` re-takes it for you in a second. The 0.0535 ETH dev buy is stated as what the
  arithmetic gives, because `node scripts/sample.js` computes it in front of you
- `assets/banner.png`, `social.png` and `avatar.png` redrawn with the new line

## 1.3.6 · 2026-09-07

Two things that were only true on the machine it was built on.

- **node 18 and 20 no longer greet a first run with a warning.** Both print `ExperimentalWarning: The Fetch API is
  an experimental feature` the first time anything is read from the chain; fetch has been stable since node 21, and
  the line says nothing a person here can act on. It is now swallowed, and only it: every other warning node has to
  give still reaches the screen
- **the Windows launchers ask the console for utf-8** (`chcp 65001`) before running. The wordmark is drawn out of
  quadrant blocks and every separator in the output is a middle dot, and a console left on the machine's own
  codepage turns all of it into mojibake. Windows Terminal was already fine; the old console was not

## 1.3.5 · 2026-09-07

Anyone who lands here should get it running.

- **double-click launchers for macOS** beside the ones Windows already had: `start/tour.command`,
  `doctor.command`, `hunt.command`, `radar.command`, `snipe.command`, `desk.command`, `wallet.command`,
  `mock.command`. Each moves to the folder it lives in first, so it works from wherever the folder was unpacked,
  checks for node with a line that says where to get it, and waits before closing so the output can be read
- the README's first block says what to do without git, what `Cannot find module` means, and how to drag a folder
  into a terminal on macOS. It is the one thing that stops a newcomer, and it now has an answer in the first screen

## 1.3.4 · 2026-09-07

The explorer moved. So did we.

- **the explorer's api and the explorer a person clicks are now two settings.** Blockscout serves Robinhood Chain's
  rest api from `api.blockscout.com/4663` behind a key; the per-chain host answers `403` to every unauthenticated
  call, from any address, with or without a browser user agent. `EXPLORER_URL` stays what it was and is what every
  printed link is built from. `EXPLORER_API` is the base the terminal reads, and `EXPLORER_API_KEY` carries a free
  key from dev.blockscout.com. Pointing `EXPLORER_URL` at your own blockscout, or at `test/mock-chain.js`, moves
  the api with it, so nothing self-hosted needs the new lines at all
- without a key `doctor` says exactly that and exactly what it costs: the deployer x-ray, the transaction counts
  and the token page read `n/a`, and the chain, the curves, the scores and every trade carry on. It is a `WARN`
- calls to that api are spaced `EXPLORER_SPACING_MS` (220 ms) apart by a reservation gate, so a burst of enrichment
  stays inside the free tier's five a second even when every caller asks at once
- the key rides as a query parameter and is never printed: messages carry a host and a status, never a url, and
  what does come back from a driver is redacted before it reaches the screen

## 1.3.3 · 2026-09-06

Read on a real chain, from a real machine.

- **`doctor` grades its checks.** The chain is one thing: the rpc, the head, the factory and its logs. Without those
  nothing reads and nothing signs, and that is what makes commands fall back to `--sim`. Everything else degrades
  on its own and now prints `WARN` rather than `FAIL`: the explorer fills the x-ray, dexscreener fills the market
  table, the pool leg contracts matter only for a graduated token, and a wallet holding nothing is a state, not a
  fault. Each warning says in one line what is lost and what still works, and the footer no longer announces that
  the chain is out of reach when the chain is plainly there. The exit code follows the same rule
- **an http failure says what happened.** node's `fetch` reports only `fetch failed`; the reason sits one or two
  levels down in `.cause`. Every source now unwraps it and prints the thing you can act on: `http 403: the host
  refused this client, a vpn or proxy exit is the usual cause`, `http 429: rate limited`, `dns does not know that
  host`, `nothing is listening there`, `timed out after 9000 ms (HTTP_TIMEOUT_MS)`
- requests to the explorer and to dexscreener now carry a user agent. A request with none is what an edge filter in
  front of a public explorer refuses first. `HTTP_USER_AGENT=` in `.env` overrides it for a host that wants
  something else

## 1.3.2 · 2026-09-06

A wordmark of its own.

- **the banner is drawn rather than typed.** `cli/banner.js` is a small 1-bit canvas: a geometric stroke face cut
  at 45 degrees at every terminal, an arrow flying through the word on one unbroken hairline, notched fletching at
  the nock and a barbed broadhead at the point. The canvas is folded two pixels at a time in both directions and
  printed with the quadrant blocks, so one character cell carries four pixels: twice the resolution in each
  direction, which is what buys the diagonals, the chamfers and the hairline. Colour runs a green ramp from the
  nock to the head, one escape per run of cells, about a kilobyte for the whole mark
- the banner picks the widest shape the window holds: the full mark at 66 columns, the word alone at 44, the plain
  word under that. `LOXLEY_BANNER=arrow|word|plain` pins one, `NO_COLOR=1` keeps the shape and drops the ramp
- `assets/banner.png`, `assets/social.png` and `assets/avatar.png` are regenerated from the same source by
  `scripts/marks.js`, so the README header, the social card and the avatar are the mark the terminal prints
- `scripts/embed-banner.js` lifts `cli/banner.js` into the private HTML demo, so the two cannot drift

## 1.3.1 · 2026-09-06

The terminal, running. Every number checked against the one beside it.

- **`loxley tour`** (`npm run tour`): every command in the tree, played in the real terminal against the mock chain
  in `test/`, on launches it mints while you watch. No wallet, no ether, no configuration, no install: a clone and
  `node bin/loxley.js tour` is the whole setup. A throwaway key funded out of nothing by the mock, a temp book
  deleted when it finishes, and the same readers, scores, signer and exits a live session runs. `--fast`, `--step`
- **the mock chain serves a recording of the real market**: the twelve tokens DexScreener listed on Robinhood Chain
  on 2026-09-06 with their deepest pool (`test/dex-fixture.js`), so `market` and `scan` against the mock show real
  names, prices, pools and volumes, two of them quoted in a stock token rather than in ether, which is the case the
  ether-price median and the dollar-denominated exit exist for. Those tokens carry an ERC-20 and an explorer record
  on the mock as well, so `scan` on any row of `market` reads a whole page
- the browser demo has been taken out of the repository: what is here is the terminal, and every screenshot in the
  README is now the terminal running
- the mock's three cuts on a buy come off one after another (the curve fee, then the creator tax on what is left,
  then the opening tax on what is left of that) rather than all off the gross, which is both the protocol's shape
  and the only version that does not go negative when a 99 % opening tax meets two 1 % cuts. The curve maths in the
  fixtures and in the tree now agree to the wei
- **nothing runs off the side of the window any more.** Every command was read at 80, 100 and 120 columns and made
  to fit: a key/value block wraps its value under itself, a table wraps its last column and never draws a rule wider
  than the window, a card folds under its own indent, a footer is a paragraph, the help list hangs its descriptions,
  a stamped log line wraps under its stamp, `market` drops its most disposable column until the table fits and says
  what a wider window would add back, the watch and replay poll line drops the market cap, then the buy/sell split,
  then the paper mark, and puts a siren on its own line rather than off the edge, and the radar puts its list under
  the dish when there is no room beside it. Measured in terminal cells, so an emoji ticker counts as two
- `positions --json` on an empty book keeps stdout empty for a pipeline and puts the note on stderr
- `market` says what its stamp means in one line: how easily you could leave, not whether the price goes up
- `watch --guard` lists the deployer's tokens moving among its pulls, which is what it has been selling on all along
- `start/start-tour.cmd` for Windows, and the examples in `docs/CLI.md` are transcripts of `node scripts/sample.js`
- `profile`: the best and the worst are no longer the same fills wearing two hats on a short book, and the daily
  bars are scaled to the root of the best day, so one 400 % position does not flatten the month into a line
- `market` fits the terminal: the optional columns (1 h, the address) appear only when there is room, the flow column
  is a share rather than two long counts, and a ticker with emoji or CJK in it is measured in terminal cells, so the
  table's columns stay straight whatever a launch calls itself
- `market` prices the exit in dollars against half the pool, so an ETH pair and a stock-token pair are measured the
  same way, and takes the ETH price from the median of the ETH-quoted pairs instead of one pool's `priceNative`
- `market` says out loud that its score stops at 85 of 100 without the explorer's two votes
- `fees` reconciles itself: `credited − claimed` against the escrow balance, with the difference named when the
  window does not hold the whole story
- `scan` says the curve is closed when a pool exists, so its curve price is not read as the live one
- the mock chain's fixtures are internally consistent now: the escrow's balance equals credited minus claimed, and
  the fixture pool holds exactly the reserves its DexScreener liquidity claims, so a round trip through it costs the
  0.6 % it should
- `scripts/sample.js` runs the cli against the mock chain and prints exactly what the examples in `docs/CLI.md` and
  this README quote, so every figure in the documentation is a transcript that can be reproduced
- the mock chain is held to the protocol's own arithmetic instead of having its numbers typed in beside each other:
  a curve's token reserve is `supply · 1.68 / (1.68 + real)`; the deployer's quote is what his tokens actually cost
  on a fresh curve (3.00 % → 0.0530 ETH); the trades in the logs are the buys that carried the curve from his buy to
  its reserve, so the logs and the contract agree; a graduation fills the curve first and opens the pool with what
  it held; and the graduated fixture's pool, its DexScreener price, depth, cap and age all descend from that
- `scan` reads a graduated token's curve trades to the graduation block instead of to the head: the curve cannot
  trade after it closes, and on a token that graduated hours ago that is three hundred blocks instead of a hundred
  thousand
- the paper close line prints its entry with units (`0.0099 ETH back for 0.0100 ETH`), like the live one

## 1.3.0 · 2026-09-06

The market.

- every card reads the launch's own declaration: socials and the description from `getTokenInfo()`, the fee recipient (the deployer or a third party), and the `snipeTaxExemptions` array decoded from the `launchAndBuy` calldata, which is a bundle declared in the open. The score moves on all three; `MAX_EXEMPT`, `REQUIRE_SOCIALS` are rules
- the launch-farm fingerprint: the same dev buy to the wei, the same creator tax and the same links from other fresh wallets inside 30 minutes is one operator with many wallets. A red FARM badge, −25, `REFUSE_FARMS` passes it
- the +15 s and +60 s lines carry the block-0 bundle (supply taken in the launch block by wallets other than the deployer, and how many), the top-5 buyers' share, and whether the dev sold; `MAX_BUNDLE_PCT` is a rule; `scan` shows both
- **DEV SOLD**: a `CurveSell` by the deployer or a `Transfer` out of its wallet is read on every mark and every guard poll, straight from the chain; the sniper closes the position on it, `watch --guard` sells on it, whatever the p&l
- `loxley follow <wallet…>`: copy the entries of wallets you trust. One topic-filtered `eth_getLogs` per poll finds every `CurveBuy` they make on any curve; the launch is read, ruled (or not, with `--any`) and mirrored with your size, on paper or `--live`, leaving on the sniper's exits
- `loxley snipe --grad`: the other trigger. Fires on `PoolGraduated`, a buy in the v4 pool the moment the curve closes, paper or live
- `loxley fees <token>`, `loxley dev <wallet>`, `loxley claim`: who is paid on a token (recipient, credits from the curve and the pool, every claim, what is unclaimed), one deployer's whole record with phases, and your own creator fees out of the pons escrow; `wallet` shows the unclaimed balance
- alerts: every FIRE, CLOSED, SIREN and WAIT to a telegram chat (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`) and/or a discord webhook (`DISCORD_WEBHOOK`)
- links: every card ends with the token on pons, the curve on axiom, the token on fomo, the explorer and dexscreener, ctrl+clickable where the terminal allows (OSC-8), `--no-links` for plain text; sign-up links under the banner from `REF_AXIOM` / `REF_FOMO`
- one `aggregate3` on multicall3 per launch instead of a dozen calls: a card reads in about 200 ms on the mock, a few hundred on the real node; the `read in` figure is printed. Point queries (one deployer's launches, one wallet's buys, escrow credits) go to the node in one piece and are halved only when it refuses the range
- `loxley market`: what is trading on Robinhood Chain right now. DexScreener's lists for the chain, the deepest pool per token, price, moves, liquidity, volume, flow, age, the impact of selling 1 ETH, the desk's stamp; `--by`, `--top`, `--token`, `--json`
- `loxley profile`: the desk's record from the book and the new tally of refusals (`~/.loxley/stats.json`, kept by the sniper): fires, wins, what came back, a bar per day, the best and the worst, exits by reason, the sirens, the refusals by rule
- `start/*.cmd`: double-click launchers for Windows (hunt, radar, snipe on paper, desk, doctor, wallet, the mock)
- the mock chain gains per-token pools on graduation, `getTokenInfo`, the escrow, multicall3, a telegram/discord recorder, and levers on `POST /__mock/<launch|walletBuy|graduate|devSell|sweep|crash|credit|alerts>` for scripted rehearsals; 9 new end-to-end tests, 41 in all, green with `node_modules` removed

## 1.2.0 · 2026-09-05

The trigger.

- a wallet: `loxley wallet import` (a private key or a seed phrase, typed without echo, encrypted with scrypt + aes-256-gcm into `~/.loxley/wallet.json`), `wallet new` (a burner with a fresh seed phrase, shown once), `wallet show`, `wallet balance`, `wallet forget`; or `PRIVATE_KEY` / `MNEMONIC` (+ `MNEMONIC_INDEX`) in `.env` for servers
- `loxley buy` and `loxley sell`: on the curve (`buy` / `sell` on the token's pons v2 curve, integer maths to the wei from `getReserves()`, `sellableTokens()`, the fee, the creator tax and `currentSnipeTaxBps()` for your own address) or in the pool (Uniswap v4 universal router behind the pons hook, quoted by the v4 quoter, paid through permit2 on the way out, both parameter layouts of the router detected and remembered). Every send is simulated first, carries a minimum output from `SLIPPAGE_BPS`, and asks for the word unless `--yes`; `--dry` stops at the plan
- the phases: buys and sells route by `getLaunchedToken().phase`; between the sweep and the pool nothing trades and every command says so instead of sending
- `loxley snipe --live`: the paper sniper's detect → read → refuse → draw sequence, then a signed curve buy, marks from exact exit quotes, exits (take profit, stop, trail, hold, the siren once the pool exists) as signed sells, `--exit-on-stop`, a session budget, a max open, an arm before the first launch
- `loxley watch --guard`: the whole holding sold the moment the siren sounds or the position's own rules trip
- `loxley positions`: the book at `~/.loxley/positions.json`, every fill marked live with what leaving fetches now, partial exits, realised p&l, `--json`
- `scan` gains a WALLET block (holding, leaving now, the book's p&l), `doctor` checks the wallet, its balance and the pool-leg contracts
- exact curve prices everywhere `getReserves()` answers (the phantom reserve is read, not assumed); `PoolGraduated` decoded in its current shape and its older one; `LaunchSwept` indexed
- `viem` for signing and ABI, bundled into `vendor/viem.js` and committed: a clone or a zip runs with no `npm install` (the registry is out of reach for a good share of the people this is for); reads still go through the desk's own rpc gate
- 11 new headless tests against the mock chain, which now mines the signed transactions it is sent: 32 in all

## 1.1.0 · 2026-09-05

The terminal.

- `loxley` in a shell: `doctor`, `hunt`, `radar`, `scan`, `watch`, `xray`, `exit`, `snipe`, `replay`, `desk`. Node 18, zero dependencies, reads only
- the launch feed: the factory's `TokenLaunched` and `PoolGraduated` by block range through one rpc gate, a deployer index over the window, cards with the dev buy from the receipt, creator tax and fee from the curve, the opening tax now, curve fill, an estimated fdv, the door on the curve, a launch score with reasons, +15 s and +60 s follow-ups, `--json`
- the paper sniper: named refusals, a draw that waits for `currentSnipeTaxBps()` to decay, paper positions marked with real quotes on the curve and in the pool, the desk's exit rules; `--live` refused with exit code 2 (until 1.2.0)
- the exit watch in the terminal, with the siren, a paper mark and `--rec` black boxes the browser desk replays
- the radar in characters
- `replay` for any black box, including the shipped drill, so the repository works with no network
- a mock chain (`npm run mock`) and 21 headless tests against it; the desk's 13 move to `npm run test:desk`
- the desk gains a `cli` command in its console

## 1.0.0 · 2026-09-05

The first public desk.

- eight-agent council, survival index, ENTER / CAREFUL / AVOID stamp, six siren triggers judged on the pool's history
- launch radar: pons v2 `TokenLaunched` and `PoolGraduated` from the factory's logs, curve fill from `realQuoteReserve()`, serial deployers coloured, full-size mode in the core's seat
- deployer x-ray: the sender of the launch transaction, its balance, its launches in its last 50 transactions, its record on the radar
- black box: every poll recorded, replay at speed on a virtual clock, export and import as json, drag and drop
- exit drill: a synthetic rug grown from the loaded token, labelled as such everywhere
- console over the desk: `~`, twenty-odd commands, history, completion
- URL switches: `token`, `demo`, `radar`, `console`, `replay`, `speed`
- thirteen headless tests against mocked APIs
