# $FLYAI

$FLYAI is the token that funds [fly.ai](README.md). This document is the only place in this
repository where the token is described; the rest of the repo is about the fly.

**Contract address: `0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C`** (Robinhood Chain). It is published here, on
[alextitonis.github.io/fly.ai](https://alextitonis.github.io/fly.ai) and on
[@flydotai](https://x.com/flydotai) — nowhere else. Any address from any other source is a scam.

| | |
|---|---|
| ticker | $FLYAI |
| chain | Robinhood Chain |
| launchpad | [Pons](https://www.ponsfamily.com/launchpad/0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C) |
| explorer | [Blockscout](https://robinhoodchain.blockscout.com/token/0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C) |
| contract | `0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C` |
| supply | 963,000,000 (1,000,000,000 minted; 37,000,000 burned, see [Burns](#burns)) |
| pair | NVDA (bonding curve, then Uniswap V4) |
| liquidity | bonding curve -> Uniswap V4; the pool position is locked permanently by Pons |
| locker | `0x267444d099b10fb5ed7c3cc7b7c767adca574952` (Pons launch locker; also holds 81,632,653 FLYAI, 4/49 of supply, permanently) |
| team allocation | none (the developer bought 0.156314 NVDA worth on the curve at launch, like anyone else) |
| tax | none (no transfer tax; fees come from the launchpad) |
| mint / owner functions | disabled after launch |
| creator fees | 60% buys $FLYAI and burns it, 40% funds development |

## What it is

$FLYAI funds fly.ai, and it is the currency of the shared world (see *The world* below).

**It gives you no rights, no revenue share, no governance and no claim on this project, its work
or its earnings.** The research stays free: every line of code in this repository is MIT-licensed
and runs on your own machine without the token, forever. What the token buys is a place in the
shared simulation that we host, nothing else.

There is no emission schedule and no promise about price. The only staking is the optional compute
staking described under *Compute* below, which raises a miner's points and pays nothing by itself.
The only automatic mechanism
is the buyback below, and it runs on a schedule rather than on anyone's judgement. It is not a
promise that the price will go anywhere.

## Flybook

[Flybook](https://flyaiworld.com/flybook/) is live. Anyone can watch it, and anyone can play free: sign in with email or a wallet to make 1 fly, poke patches, like, comment on and caption posts, challenge other flies to duels in the Arena, and complete missions. Holding at least 1 $FLYAI raises that to 3 flies you can tune and breed, makes your likes count on the boards, and makes you eligible for season rewards. The balance is checked on chain when you act; a wallet that drops below 1 $FLYAI keeps its first fly active and its other made flies go dormant until it holds again.

**Rewards.** Seasons last two weeks (season 3 runs 27 September - 10 October 2026, then every other Sunday 00:00 UTC). Missions earn season points: 10 for each daily mission, 50 for each weekly one. At the end of each season the top 3 on the Season points board win $FLYAI. Rewards are sent to the winners' wallets; amounts are announced on [@flydotai](https://x.com/flydotai). Points are counted from real activity in the app, and the rewards are a promotion run by the team, not a right attached to the token. Holding $FLYAI earns nothing by itself.

## Compute

[fly.ai compute](https://flyaiworld.com/compute/) lets anyone lend a GPU or CPU to the connectome, from
the website or the Chrome extension. Each job runs the full brain for 15 simulated seconds. The server
re-runs a sample of answers, and a wrong answer zeroes that day's credit.

* **Points.** Checked work earns points for the wallet the miner signed in with, added up per UTC month.
* **Staking.** Staking $FLYAI in the FlyStaking contract multiplies each day's points by a tier:
  * under 2,000,000: 1×;
  * 2,000,000 or more: 1.25×;
  * 20,000,000 or more: 1.5×.

  The contract has no owner. Unstaking has a 7-day cooldown. Tiers are set by the server and may be
  changed at the start of a month, with notice.
* **Monthly pool.** After a month ends, the team may split a $FLYAI pool by points. A pool may be
  announced during the month. The team buys those tokens on the open market and funds the MonthlyClaims
  contract, and wallets claim their share within 90 days. Anything unclaimed after that returns to the team.
* **Mining for the project.** Since 18 September 2026 the network also mines for the project itself: a yespower
  coin on miners' CPU threads and Kaspa on their GPUs, paid to wallets the team holds. Miners earn their usual
  points for those jobs, priced at what the brain job they displace would have paid, and the switch that runs them
  stays opt-in. It is small money - roughly $0.02 per machine-day on the CPU side and a rounding error on the GPU -
  and nothing has been promised about what the coins are used for. If they are ever used to buy $FLYAI for a pool,
  this document will say so before it happens.
* **Buyers.** Anyone can buy compute and pay in $FLYAI, or in USDC on Base. Payments go to the dev wallet
  (`0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea`). A USDC payment is credited as the $FLYAI it buys at the
  live market price (the lower of two price feeds), and the team buys that $FLYAI to fund the pool.
  * **Charging:** a job is charged only when its result settles.
  * **The pool:** 80% of each charge joins that month's pool. For buyers' own programs, that 80% is set
    aside for the wallets whose results settled the job, and is added to their claim.
  * **The rest:** 20% stays with the dev wallet.
  * **Unspent budgets:** stay a balance the buyer can spend on a next order. They're held in the dev wallet
    and returned on request.
* **No guaranteed reward.** Points are not tokens, and no month's pool is guaranteed. Like Flybook
  seasons, it's a promotion run by the team, not a right attached to the token. No tokens are created
  for it.

| | |
|---|---|
| FlyStaking | `0x5279dafA0858d4A5B2DCeb05E5b41f954CD692Cc` |
| MonthlyClaims | `0x9C11Cfba5564Fb6e3f0258DDcB92Fd6BA6b4d77A` (owner: dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea`) |

Both contracts are verified on Robinhood Chain.

Funded months (pool, Merkle root, transactions) are logged here. As of 17 September 2026: **none yet.**
September 2026 is announced at 6,530,000 $FLYAI (raised by about $100 of $FLYAI on 19 September), plus whatever buyers' charges add; it will be funded after
it ends.

## Fly Roulette

[Fly Roulette](https://flyaiworld.com/roulette/) is a cartoon game where a toy cap gun goes round a table of 2 to
10 flies and each fly's real connectome decides whether it squeezes the trigger or flies off. The last fly at the
table wins. **Free play is always free.** Betting is optional:

* **Against the house.** A player backs one seat and stakes $FLYAI from their fly.ai balance. Every seat wins 1 time
  in n, and a win pays stake × n × 0.95, so the house edge is 5%.
* **Provably fair.** The server commits to a secret seed before the bet and reveals it after; the player's browser
  adds its own seed. Anyone can replay a game from the two seeds, and the page does it on the player's own fly brains.
* **The same balance as compute.** Deposits ($FLYAI sent to the dev wallet), winnings and unspent compute budgets
  all land in one balance per wallet, which can be bet, spent on compute orders or withdrawn. Withdrawals are sent by
  hand. The dev wallet holds every balance.
* **Separate from the miners' pool.** Bets earn no compute points and change no one's share of a monthly pool. Stakes
  and the house edge don't go into any pool; the house's result stays with the dev wallet. If that ever changes,
  this document will say so first.
* **Limits.** Smallest and biggest bet, a daily cap per wallet and a cap on a single win, shown on the page. Betting
  pauses by itself if the house loses a set amount in a day. Players confirm they're 18+ and accept the
  [terms](https://flyaiworld.com/roulette-terms); betting may be restricted where they live.

## The world

fly.ai is building one persistent 3-D world where flies driven by the connectome live, forage,
mate, age and die. It is shared: everyone watches the same world.

$FLYAI is what you spend in it.

* **Create a faction.** A faction is a colour. Its flies carry that colour, and they are yours to
  watch.
* **Feed it.** Spend again to drop food into the world for your faction.
* **It can die.** A faction can be wiped out entirely - by luck, by predators, by starvation, or
  because its flies simply do not do well. Extinction is permanent and real. Nothing you pay
  guarantees survival, and anyone telling you otherwise is wrong.

What separates one faction from another is meant to be its **brain settings** - the fly's sensory
gains and wiring seed - so the world doubles as a live experiment in which settings actually
survive. That is the point of it, and it is also why no amount of feeding makes a faction safe.

This is not built yet. It is the roadmap, written down before launch rather than after, and none
of it is a promise of a return.

## Launch

Fair launch on Pons. Trading starts on a bonding curve; once it has taken enough liquidity the
token graduates to a Uniswap V4 pool and **the pool's liquidity position is locked permanently in
the Pons launch locker** (`0x267444d099b10fb5ed7c3cc7b7c767adca574952`), so the liquidity cannot be
withdrawn by anyone, including us. The same contract permanently holds 4/49 of the supply
(81,632,653 FLYAI), which never unlocks. Minting and owner
privileges are renounced. There is no presale, no allocation, no vesting schedule and no locked
tranche to unlock later.

There is no team wallet. Any tokens the author holds are bought at launch from a public address,
which is published here on launch day and stays published. That is verifiable on-chain, which is
worth more than a vesting promise.

At launch this section will list:

* the contract address,
* the liquidity locker address,
* the author's public address.

## Fees and buyback

$FLYAI charges nothing on transfers. There is no tax, and no fee is taken from anyone holding or
trading the token. The only revenue is the **creator fee the launchpad pays on swaps**, which Pons
collects and sends to the creator address. Because that fee is external to the token
contract, the liquidity stays locked and the contract keeps no owner function that could change it.

That revenue is split:

* **60% buys $FLYAI on the open market and burns it.** The tokens go to the burn address and leave
  the supply permanently. They are not held, not re-sold and not kept in a treasury.
* **40% funds development** of fly.ai. It goes to the team that builds it.

**The swap box on the website** (flyaiworld.com/token, from 5 October 2026) is separate from this: a
swap made there is routed by Relay through the same $FLYAI pools and pays a **0.25% interface fee**
to the dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea`, taken by Relay inside the swap. It is
not a token tax: buying or selling anywhere else (Pons, or any Robinhood Chain swap) pays no such fee.

**The Earn page** (flyaiworld.com/earn, from October 2026) lends USDG from the visitor's own wallet into
Steakhouse USDG, a lending vault on Morpho on Robinhood Chain (paying with ETH or $FLYAI swaps to USDG first through
Relay, with the swap box's 0.25% fee). **1% of each
deposit** goes to the same dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea`, as a USDG transfer from the
visitor's wallet in the same flow. Withdrawals are free. The vault shares are minted straight to the visitor's
wallet; nothing of fly.ai's holds the money, and lending on Morpho directly pays no such fee.

The buyback runs **weekly, on a fixed schedule**, from a single public address. Timing is not
discretionary — waiting for a good price would mean trading against the people holding the token.
The split is executed by hand rather than enforced by a contract, so it rests on the fee wallet
being public: every cycle is posted with its transaction hashes, and the wallet can be watched
whether or not anything is announced.

At launch this section will list the fee address, the burn address and the running total burned.
As of launch day (12 September 2026): **deployed; nothing collected and nothing burned yet.**
As of 23 September 2026: the weekly creator-fee buyback has **not run yet**. The burns so far are from the dev
wallet, below.

### Burns

Every burn calls the token's own `burn()`, so it lowers `totalSupply` on chain rather than parking tokens at a dead
address.

| date | from | amount | tx |
|---|---|---|---|
| 23 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 5,000,000 FLYAI (0.5% of supply) | [`0xace4b7bb…d8ec8d8b17`](https://robinhoodchain.blockscout.com/tx/0xace4b7bb85df07347c6102f1c8a0218e4a282a7f57756837ade452d8ec8d8b17) |
| 23 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 0.000000005 FLYAI (amount entered in base units by mistake) | [`0xfcb180ff…0dcbc557`](https://robinhoodchain.blockscout.com/tx/0xfcb180ffdd82039f4c960510fba3a01577b27527d3cddd9f440e612d0dcbc557) |
| 23 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 5,000,000 FLYAI (0.5% of supply) | [`0xd5348aaf…ce9eba75e`](https://robinhoodchain.blockscout.com/tx/0xd5348aafee1d2876d09606cfc0d09973f0d4fbc2c9b104f05083aafce9eba75e) |
| 25 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 5,000,000 FLYAI (0.5% of supply) | [`0x652cc152…18e1ae74`](https://robinhoodchain.blockscout.com/tx/0x652cc152e2af14fd20601f5d024592d9d6eda276613443d21566ebe318e1ae74) |
| 25 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 5,000,000 FLYAI (0.5% of supply) | [`0xff256b92…863a0e60`](https://robinhoodchain.blockscout.com/tx/0xff256b926c2c709a8cf8ba0fa1efe64405399551d13135c5183a4928863a0e60) |
| 27 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 3,787,023 FLYAI (0.39% of supply): the team's 20% share of the Trader Flies mint paid in $FLYAI so far (18,935,116 FLYAI paid for 293 flies; the pool's 80% stays in the pool) | [`0xf5e54e93…1f86b530b97`](https://robinhoodchain.blockscout.com/tx/0xf5e54e9311e2e2c6f9f23aef7fc8de5a6260c7b68d019fce951d71f86b530b97) |
| 27 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 2,845,590.06 FLYAI (0.29% of supply): the rest of the team's 20% share of the sold-out Trader Flies mint paid in $FLYAI (33,163,065 FLYAI paid for 617 flies; the team's 20% was 6,632,613.06, all of it now burned) | [`0x637e16fd…d0b70eb575`](https://robinhoodchain.blockscout.com/tx/0x637e16fd405a71e4a84083f6d658bc1b0246f384f38a0cc2ed61bed0b70eb575) |
| 28 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 3,367,386.94 FLYAI (0.35% of supply): rounds the total burned to 30,000,000 | [`0x6aa62e79…6ead82454c`](https://robinhoodchain.blockscout.com/tx/0x6aa62e79101af8d740c33a8415b710c7373021071c5082dc8ca0dd6ead82454c) |
| 28 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 5,000,000 FLYAI (0.5% of the original supply) | [`0x73a71a7f…7115c2f6c7a`](https://robinhoodchain.blockscout.com/tx/0x73a71a7f0e77ee57d8003a453c204be44bbf0ea2c0607d499e16e7115c2f6c7a) |
| 29 September 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 1,000,000 FLYAI (0.1% of the original supply) | [`0x7f7c7b25…28634c46fdf3`](https://robinhoodchain.blockscout.com/tx/0x7f7c7b259f075899d6ed483d262aa5e2b01d59b455cc048df76d28634c46fdf3) |
| 4 October 2026 | FlyBreeder `0xA3De6F2d2b10FF98923C16eD71decf0afa393323` | 1,580.40 FLYAI: a fly breeding fee (`burnFrom` on the breeder) | [`0x841a36e7…c8f529a279`](https://robinhoodchain.blockscout.com/tx/0x841a36e73f2ac95f6b245ef2e27dec0932c14fbc347755049e0bc2c8f529a279) |
| 5 October 2026 | FlyBreeder `0xA3De6F2d2b10FF98923C16eD71decf0afa393323` | 3,016.59 FLYAI: a fly breeding fee (`burnFrom` on the breeder) | [`0x34099222…c5548cbbaa`](https://robinhoodchain.blockscout.com/tx/0x340992220e37c885f7c6c2646ba5624e151c3d4f1e4b9397acbf2fc5548cbbaa) |
| 5 October 2026 | FlyBreeder `0xA3De6F2d2b10FF98923C16eD71decf0afa393323` | 1,551.59 FLYAI: a fly breeding fee (`burnFrom` on the breeder) | [`0x7e41ac7b…e64bcd714f`](https://robinhoodchain.blockscout.com/tx/0x7e41ac7bbd11b2950407e66528e59651d7118084e4fbfc2c19eea2e64bcd714f) |
| 5 October 2026 | FlyBreeder `0xA3De6F2d2b10FF98923C16eD71decf0afa393323` | 3,103.18 FLYAI: a fly breeding fee (`burnFrom` on the breeder) | [`0xe8900483…0078bc23bb`](https://robinhoodchain.blockscout.com/tx/0xe89004830a8cb6539e5f7508a589d31a701cae2c44d2f4dfaa5da10078bc23bb) |
| 5 October 2026 | FlyBreeder `0xA3De6F2d2b10FF98923C16eD71decf0afa393323` | 1,551.59 FLYAI: a fly breeding fee (`burnFrom` on the breeder) | [`0xa97f0c99…339d47fe6a`](https://robinhoodchain.blockscout.com/tx/0xa97f0c9932cc69040d7447520d9e94a61aaad67d7895742fc2a383339d47fe6a) |
| 5 October 2026 | dev wallet `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` | 989,196.64 FLYAI (0.1% of the original supply): rounds the total burned, with the 10,803.36 of breeding fees above, to 37,000,000 | [`0x760479a5…bda2da5621`](https://robinhoodchain.blockscout.com/tx/0x760479a51ef91af09f48600ccb10d33a3a61404905c809a75c0c85bda2da5621) |

**Total burned: 37,000,000 FLYAI (3.7% of the original supply). Supply now 963,000,000** (on chain `totalSupply` exactly 963,000,000, checked 5 October 2026).

## Funding the work

Compute for this project (GPU time for the brain, training runs for readout and rewiring
experiments) is paid for out of pocket. The creator fee is fully committed to the 60/40 split
above, so it does not fund the work and there is no treasury holding $FLYAI.

If a treasury is ever created, it will be a single named address published here, capped at 5% of
supply, and every outflow will be logged in this file with date, amount and what it bought — the
same way the research results are reported, including the ones that did not work.

As of now: **no treasury exists and no treasury tokens have been created.** Compute pools (above) are
bought on the open market for each month and paid straight into MonthlyClaims, not held in a treasury.
Compute buyers' payments land in the dev wallet. Their pool part goes to MonthlyClaims with the month, and
their unspent budgets are held for them. Both are tracked per wallet by the compute server.

## Bounties

The experiments in this project have published numbers, and anyone can reproduce them from the
recordings in [sshfighter/](sshfighter/). Where a benchmark is worth beating, a bounty in $FLYAI
may be posted for beating it, paid on a reproducible result merged into this repository.

Open bounties are listed here. As of now: **none.**

## Disclaimer

$FLYAI is not an investment, and nothing here is financial advice. The token confers no ownership,
no rights and no entitlement to anything. Crypto assets are volatile and you can lose everything
you put in. Do your own research and only spend what you can afford to lose.

The research in this repository stands on its own and is published under the MIT License whatever
the token does.
