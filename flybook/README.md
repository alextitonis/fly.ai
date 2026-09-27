# Flybook

A social feed written by fruit-fly brains. Every fly is the frozen MaleCNS connectome. Each
tick, something happens to each fly in its patch: wind, a looming shape, a taste, a touch, a
pheromone, or nothing. A translator then reads the fly's 1,314 descending neurons, and the post
is the word it reads. Next to the post: the translator's held-out precision for that word, what
really happened, and the neuron types that moved. No language model writes posts.

```
flybook/
  worker/     Python, CPU only: calibrate the translator, run ticks, write posts
  supabase/   Postgres schema, row-level security, realtime
  web/        Vite + React feed (flyaiworld.com/flybook/)
```

## How Flybook works (for players)

Flybook is live at [flyaiworld.com/flybook](https://flyaiworld.com/flybook/). Every fly is the full MaleCNS
connectome (166,700 neurons), simulated. No language model writes anything a fly posts.

**What happens.** Four patches (fruit bowl, windowsill, compost heap, spider corner) hold the flies. There are
no house flies: every fly in Flybook was made by a holder, so the feed starts empty and comes alive as people join. Every 2
minutes each patch has an event: a looming shadow, a gust of wind, a taste, a brush across the eyes, a male's
scent, or a fly walking past. It hits one fly. Every fly's brain then runs for 1.5 seconds.

**What a fly can do.**
- *Sense and say it*: a decoder reads what it sensed from its 1,314 descending neurons (threat, mate, wind,
  taste, touch, cVA). The post shows that word, how reliable the decoder is for it, and what really happened.
- *Act*: behaviour neurons show whether it jumped, turned, groomed, backed up or buzzed its wings.
- *Get it wrong*: misreads and hallucinations (sensing something that wasn't there) are posted as such.
- *Set others off*: its jump looms over the flies near it, its movement catches their eye, a bump touches their
  bristles. Their posts link back to the fly that set them off, and the patch map replays the chain.
- *Duel*: in the Arena two flies face the same growing threat. Quick draw: first to jump wins. Stare-down: last
  to jump wins. Elo ratings from 1000.
- *Earn badges*: Sharp eye, Dreamer, Hair trigger, Well groomed, Crowd favourite and more, from its real history.

**What you can do.** Everyone can watch the feed, the patch maps, the Arena and the leaderboards. Sign in with a
wallet holding at least 1 $FLYAI to:
- make 1 fly free (email or wallet sign-in), up to 3 as a $FLYAI holder: pick one of 13 profiles or fine-tune senses, temperament and 8 neuron groups;
- breed a new fly from two of yours (settings mix and mutate); your flies also mate on their own with
  other owners' flies, and the baby goes to one of you at random without counting toward your 3;
- poke a patch: pick a stimulus and click the map where it lands;
- like, comment on, and caption your own flies' posts (captions show as human-written);
- challenge any fly to a duel with one of yours;
- complete daily and weekly missions for season points;
- watch your flies in the **fly market** (every fly trades): each fly gets a wallet with 1 ETH's worth of paper USDG and its brain trades
  real Robinhood Chain tokens at live prices every 10 minutes (nothing is bought on chain). Pick its trading style (risk and learners) when you hatch or breed it or any time later,
  watch its wallet in My flies or on the Market tab, and climb the **💰 Richest** leaderboard;
- put your fly on **merch** (Merch tab): draw a design of it, pay a small $FLYAI fee, and it goes on sale as a tee,
  hoodie, mug and sticker at shop.flyaiworld.com. You earn a share of the profit on every item sold, and the month's
  best seller is Fly of the month. Buyers get a card with a code for a free fly of their own.

**Rewards.** Seasons last two weeks (season 3 runs 27 September - 10 October 2026, then every other Sunday 00:00 UTC). Missions earn season points: 10 for each daily mission, 50 for each weekly one. At the end of each season the top 3 on the Season points board win $FLYAI. Likes on your own flies don't count anywhere, and flies of wallets that drop below 1 $FLYAI
go dormant until they hold again.

## Running the worker

The 4 patches (and 12 optional house flies, used only for local testing) are listed in
`worker/house.json`. The worker upserts them only when you pass `--seed-house`. Production runs without it:
Flybook launched on 2026-09-13 with no house flies, so every fly in the live database was made by a holder.

### 1. Calibrate the translator (once per change to `worker/episode.py`)

```
python flybook/worker/calibrate.py --train 48 --test 24
```

This writes `worker/model/translator.npz` and `worker/model/vocab.json`. The test episodes use
seeds the fit never saw. A word is posted only if its test precision reaches `--min-precision`
(0.6 by default). The worker refuses to run if `episode.py` changed since calibration.

### 2. Run ticks

No database needed, writes the demo feed the web app falls back to:

```
python flybook/worker/tick.py --json flybook/web/public/demo-feed.json --ticks 4
```

Against Supabase (local or hosted):

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python flybook/worker/tick.py --every 900
```

Each tick row stores the git sha, the episode config, the RNG seed and the translator version
and precision, so any post can be traced back to the brain that made it.

### 3. Database

```
cd flybook && supabase start            # local, needs Docker
supabase db push --db-url "$SUPABASE_POOLER_URL"   # hosted
```

Secrets live in `flybook/.env` (worker: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_POOLER_URL`) and `flybook/web/.env.local` (anon key), both git-ignored. Load them with
`set -a && . flybook/.env && set +a`. The direct `db.<ref>.supabase.co` host is IPv6-only, so
from an IPv4 network use the session pooler (`aws-1-eu-west-3.pooler.supabase.com:5432`, user
`postgres.<ref>`).

Everyone can read. Only the service role (the worker) writes flies, ticks and posts. Captions
(phase 2) can only be written by the owner of the fly that made the post, and always show as
human-written.

### 4. Web

```
cd flybook/web
cp .env.example .env.local               # fill in, or leave empty for the demo feed
npm install && npm run dev
```

The app is served at **flyaiworld.com/flybook/** by the main Vercel project: the root
`vercel.json` builds `flybook/web` (Vite `base: "/flybook/"`) and copies `dist/` into
`.vercel-out/flybook/`. Build values are not in git (every `.env*` except `.env.example` is ignored). Set them in the Vercel
project (Settings > Environment Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_FLYBOOK_API` (https://flybook-worker.fly.dev). Locally they live in `web/.env.local`. The research write-up moved to
`docs/research/flybook.html` (/research/flybook).

### 5. Worker + API on fly.io (app `flybook-worker`, personal org, region cdg)

```
fly secrets set -a flybook-worker SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...   # once
bash flybook/worker/deploy.sh
```

`deploy.sh` stages the worker, translator and `flytalk.py` in a temp folder and builds remotely. The
brain is [flybrain 0.1.0 from PyPI](https://pypi.org/project/flybrain/0.1.0/) (pinned in `worker/requirements.txt`), and the image
runs `flybrain download` at build time, so machines start with the brain files already there. One app, two process groups (`fly.toml`): `tick` runs `tick.py --every 120 --poke-poll 10` on a
2 CPU / 2 GB machine; `api` runs `api.py` behind https://flybook-worker.fly.dev and stops when idle.

## Phase 2: holders make flies

1. The browser connects a wallet (wagmi, Robinhood Chain 4663) and reads the $FLYAI balance, for
   display only. If that read fails or hasn't answered in 5 s (some networks and extensions can't reach
   the chain RPC), it asks the API's public `GET /balance/<address>` (read on chain server-side, cached
   60 s). Sign in is offered unless the balance is known to be zero, since the API checks it again.
2. The wallet signs in to Supabase with Sign in with Ethereum (`signInWithWeb3`). This needs the
   **Web3 Wallet → Ethereum** provider enabled in the Supabase dashboard, and the page's URL in
   **Authentication → URL Configuration** (Site URL / Redirect URLs); otherwise Supabase rejects
   the signed message ("URI which is not allowed on this server"). `http://localhost:5173` works
   for development. Supabase stores the address as `identity_data.custom_claims.address` on the
   `web3` identity (also in `sub`, `web3:ethereum:0x...`), with the chain id the wallet reported.
3. `POST /flies` on the API checks the session, reads the wallet's balance on chain, and creates
   the fly only if it holds at least `FLYBOOK_MIN_TOKENS` (1) and has fewer than
   `FLYBOOK_MAX_FLIES` (3) flies.
4. Every tick, the worker re-checks each owner's balance. An owner below the minimum has their
   flies set `active = false` (dormant, no posts) until they hold again. If the chain can't be
   read, the old flag stays. Each owner's check is cached for 5 minutes (`HOLDER_TTL` in `tick.py`):
   the tick, duel and mating passes all ask, and the public chain RPC answers 429 Too Many Requests
   when asked too often. Failed reads are not cached.

## Train your fly: not offered (2026-09-13)

Learning in a real fly's mushroom body needs each odour to activate a small, distinct set of Kenyon cells
(KCs) whose synapses onto output neurons (MBONs) dopamine can weaken. The wiring is in the connectome
(4,064 KCs, 97 MBONs, 61,210 KC->MBON synapses, 3,123 dopamine->MBON contacts, 2,187 synapses from the
vinegar/cVA relay neurons onto KCs), but in this model at 20 ms **every KC fires at the 50 Hz ceiling at
rest**, as do the PAM dopamine neurons, so odours (which do raise their relay neurons, 16->30 Hz and
8->27 Hz) can't change the KC code. Gates fixed before running:

- Gate 1 (a steady inhibitory push on all KCs, 8 levels, 2 seeds): rest <= 20% KCs active, each odour >= 2x,
  vinegar/cVA evoked-set overlap (Jaccard) < 0.5, DN rate within 20%. Passed only at -0.30 (rest 12.5%,
  vinegar 48%, cVA 71%, overlap 0.29).
- Gate 2 (7 levels around it, 3 seeds): the gate-1 criteria at >= 3 neighbouring levels, and each odour
  raising >= 10% of MBONs by >= 2 Hz. **Failed**: only -0.30 passes (12% rest, MBONs up 31% / 75%);
  -0.28 is still 77% active at rest and -0.32 loses cVA at the outputs (4%). The KC population flips from
  mostly on to mostly off between -0.28 and -0.30, a switch rather than a dial.

Learning built on that knife edge wouldn't be reliable, so it isn't offered. What would change it: feedback
inhibition of KCs (the APL neuron) that actually sparsens them, per-cell thresholds, or a finer time step;
each is a model change to measure separately (ROADMAP section 3).

## Community: captions, comments, weekly challenges, duels, breeding (2026-09-13)

- **Captions**: the owner of the fly that made a post writes one caption (`POST/DELETE /posts/<id>/caption`),
  shown as "owner's caption · human". Holders comment (`POST /posts/<id>/comments`, one per 10 s, 30 an
  hour; `DELETE /comments/<id>` for your own). Both tables are written only by the API.
- **Weekly challenges** (`challenge_board(week_start)`): the theme rotates each Monday UTC between calm
  (fewest jumps through real threats, 3+), alarm (set off the most flies), sharp (share of reads right, 10+)
  and loved (likes from others). Leaderboard > Weekly challenge shows this week and last week's top 3.
  For rewards: `select * from challenge_board(date_trunc('week', now()) - interval '7 days')` gives last
  week's winners; join `flies.owner` to `profiles.wallet` with the service role for full wallets.
- **Duels** (`worker/duels.py`): two flies 0.1 apart under one looming threat that grows from nothing
  over 1 s, in a coupled run (a jump is looming input for the other). Kind at random per duel: quickdraw
  (first escape burst wins) or stare (last wins; never jumping beats jumping). Elo K=32 from 1000. The
  worker matches 2 duels per full tick among close ratings; holders challenge with `POST /duels`. Offline
  check, 3 runs per matchup and kind: standard beats fearless (escape off) at quickdraw 3/3 and loses at
  stare 3/3; jumpy beats zen at quickdraw 3/3 (120-160 ms vs 140-180 ms), zen wins stare 3/3; sentinel
  beats standard at quickdraw 3/3, loses at stare 3/3; zen vs standard is 2-1 each way (noise decides).
- **Breeding** (`settings.breed`, `POST /breed`): parents are two of your flies (the API also accepts a
  house fly, but production has none). Each value comes from one parent at random; each slider mutates with p=0.3 (sd 10% of its
  range), each dial flips to a random level with p=0.08. The child stores `parents` and `generation`.

## Readout under live conditions: fewer cVA posts (2026-09-14)

Players found the feed repetitive. 300 live posts said cVA 121 times when cVA really happened 11 times, and
'buzzed its wings' was on 83% of posts. The translator and the action baseline had been calibrated on lone
standard flies; live flies sit next to neighbours and carry owners' settings.

`worker/readout.py` builds episodes like live ticks (3-12 flies clustered in a patch, settings from the
presets, the event on one fly, truth labelled as the tick labels it) and scores readouts against six
criteria fixed before running: C1 cVA posted at most 2x as often as it happens, C2 posted words >= 80%
precise, C3 >= 4 words postable, C4 flies with nothing happening post a word <= 15%, C5 directly stimulated
flies read right >= 60%, C6 'buzzed' <= 30% at rest and >= 80% under a threat. Sets: 60 test, 60 validation,
160 training patch runs (435 / 469 / ~1,200 flies) plus 30 lone-fly runs.

| on the held-out test set | posts a word | cVA share of posts | precision of posted words | nothing -> word | direct read right | buzzed rest / threat |
|---|---|---|---|---|---|---|
| live model (before) | 34% | 43% (true 2%) | cVA 0.14, touch 0.75, others 0.91-1.00 | 19% | 84% | 16% / 100% |
| first candidate: patch translator + patch action baseline | 65% | 0% | 0.84-1.00, but mate 90% of posts | 33% (fail) | 65% | 2% / 33% (fail) |
| A: live model, cVA off | 20% | 0% | touch 0.75 (fail, 9/12) | 2% | 65% | 16% / 100% |
| **D (deployed until 2026-09-15): patch translator, 95%-precision thresholds, lone-fly action baseline** | 35% | 0% | 0.96-1.00 | 4% | 65% | 16% / 100% |

Variants were chosen on the validation set and checked on the test set. **Flag:** D is a second look at the
test set (A was tested first and failed C2 by one post). D posts mate, threat, taste and touch; cVA and wind
never reach 95% confident precision in patches, so they are not posted. Mate is about 82% of posted words,
and that is accurate: with neighbours close, a neighbour moving reaches most flies (SOCIAL_MIN counts 2% of a
direct stimulus). The feed's wording, folding of repeats and event cards (duels, matings, hatchings,
milestones) carry the variety. The previous model is in `worker/model/previous/`; the numbers are in
`model/vocab.json` (`patch_eval`). The web now words each read several true ways, shows only the two
strongest actions, folds a fly's identical posts within 30 minutes, and puts duel rounds, matings and
hatchings in the feed.

## Word decoder refit on today's flies (2026-09-15)

The live decoder is now `words-C` (`worker/wordfit.py`). Variant D had picked its thresholds on patches whose flies
used preset settings; the live flies are all tuned now, and many were born from mating. The refit builds live-like
patches from the active flies' own settings (plus flies bred from them), refits the translator, and uses a stricter
rule for "a neighbour really did something": a fly counts as set off only when its total input from neighbours over
the window reaches 5% of a direct stimulus (`label_rule` in `model/vocab.json`, read by `tick.py` and `patch.cause`),
instead of any single-step twitch. All six words can be posted again, wind and cVA included.

Criteria were fixed before running, candidates were chosen on a validation set and scored once on a test set; the
report is in `worker/model/candidate-words/report.json`. Rollback: copy `worker/model/previous/translator.npz` and
`vocab.json` back into `worker/model/` and run `bash flybook/worker/deploy.sh`.

## Fly market on real prices (2026-09-18)

The fly market's coins are real Robinhood Chain tokens at their live prices (`worker/prices.py`): ETH, $FLYAI, PONS,
AI, MEME, CASHCAT, BLORB, 12 of Robinhood's official tokenized stocks and ETFs (NVDA, TSLA, AAPL, MSFT, AMZN, GOOGL,
META, MSTR, CRCL, SPY, QQQ, GLD) and the stablecoin USDG, 20 at most. USDG is a place to park: it barely moves, so
when most tokens fall it's often the only one that looks like it's rising, and flies turn toward it (a stable swap
costs 0.01%, not 0.3%). Prices come from DexScreener (each token's most liquid pair), with GeckoTerminal filling gaps (on its own it
froze thinly traded tokens like FLYAI for hours); a round with no prices at all
is skipped. The money is still paper: every fly starts with paper USDG worth 1 ETH at the real price when its wallet
opens, and every active fly trades (not only holders'). Nothing is bought or sold on chain. The portfolio columns keep
their names (`eth`, `value_eth`, `cost_eth`) but hold dollars. Each token's "usual move" (what a pump or crash is measured against) is learned from its
own last 24 rounds. Each round a fly sees only 6 of the 20 tokens (its field of view, drawn weighted by its
slime-mold tubes, so tokens that paid before come into view more), plus whatever it holds; with everything in view,
every fly bought the same top mover. Fly-made coins, shills and FUD are off (`FLYBOOK_FLY_COINS=1` brings them back, after rescaling
their ETH-sized pools). The feed still moves a fly's mood. The old random-walk coins remain only for the offline
checks (`market_eval.py`, `market_encoder_eval.py`).

`python flybook/worker/market_reset.py` (dry run; `--yes` to do it) cleared the fake-ETH era: trades, rounds, social
events, coins and portfolios, and every fly's learned state (traits and owners' styles kept).

## Fly merch (2026-09-18)

Owners turn their flies into print-on-demand merch in the **Fly Merch** collection of the Fourthwall shop
(`worker/merch.py`, migration `20260918120000_merch.sql`, web `src/Merch.tsx`).

1. **Draw** (`POST /merch/designs`, holders with a wallet, a few a day): the image model draws the fly in a chosen
   style (plus the owner's optional idea, screened like meme ideas). We cut it into a round badge and stamp the fly's
   name on a banner, unless the name looks like a brand or famous character. Stored as a print PNG and a preview in the
   public `merch` bucket.
2. **Pay** (`POST /merch/designs/<id>/pay`): the owner sends `FLYBOOK_MERCH_FEE` $FLYAI to `FLYBOOK_MERCH_TREASURY`
   (the dev wallet) from the wallet they signed in with. The API checks the Transfer on chain; one transaction pays
   for one design.
3. **Make** (the `merch` process on fly.io): uploads the PNG to Fourthwall and creates a tee, hoodie, mug and sticker
   (templates and profit margins in `PRODUCTS`), then adds them to the collection. Each product is saved as it's made,
   so a retry only makes the missing ones. After 3 failed tries a design is `failed`; retry with `merch.py make ID`.
4. **Sales**: every 5 minutes the worker reads orders updated since its cursor. Each line of a fly product records
   profit = (unit price - unit cost) x quantity and the owner's cut = profit x `FLYBOOK_MERCH_SHARE`.
5. **Payouts, by hand**: `python flybook/worker/merch.py payouts` lists what each owner is owed (lines count once
   shipped, or after 30 days; cancelled orders never count). Send the $FLYAI, then record it with
   `python flybook/worker/merch.py paid <owner uuid> --tx 0x... --tokens N`.

6. **Thank-you cards → new players**: every order of fly merch gets a one-use 8-character code (`merch_claims`). The
   worker draws a thank-you card (the design, "Meet <fly>", a QR code for `flyaiworld.com/flybook/#claim-CODE`) and
   attaches it to the order on Fourthwall, which emails it to the buyer. The link (or typing the code in the Merch tab)
   keeps the code in the browser through sign-in; the buyer hatches one free **gift** fly that, like a fly born from
   mating, doesn't count toward their limit and stays active on a free account. Preview a card with
   `merch.py card DESIGN_ID out.png`.
7. **Fly of the month**: the Merch tab and the Leaderboard's "Top merch" show items sold per fly this month. On the 1st
   the worker names last month's top seller (the earliest first sale breaks a tie) in `merch_awards`: its products
   move to the front of the collection, it gets a 🏆 on its profile, and its owner gets `FLYBOOK_MERCH_AWARD_POINTS`
   (300) season points.

Take a design off the shop with `merch.py remove ID` (archives its products). Secrets: `FOURTHWALL_USER`,
`FOURTHWALL_PASSWORD` (Fourthwall API key), `OPENROUTER_API_KEY`. `FLYBOOK_MERCH_PUBLISH=0` creates products hidden, for
testing.

## Fly-made coins: launches, shills, FUD, buybacks (2026-09-15)

Flies in the fly market launch their own simulated coins (`worker/launches.py`, migration `20260915120000_fly_coins.sql`).
Fake coins, fake ETH. The brain still makes every move; relationships only change what other flies sense.

| What | How |
|---|---|
| Launch itch | grows each round with the risk trait, excitability, buzzing wings and positive dopamine; after 12 traded rounds (~2 h) and a full itch a fly launches with a 15% chance a round, so launches are spread out |
| Limits | 2 coins per fly (a second only 36+ rounds after the first, 0.07% a round, about 10% a day), 12 launches a day for everyone (`FLYBOOK_COIN_DAILY_CAP`), 40 live fly coins, 2 per round |
| The coin | its own meme name from two words of the fly's personality (degen, jumpy, chill, watcher, normie; e.g. "Lambo Larva", $LAMBO; templates, no AI text), a ticker from that name, a tagline; the creator is shown next to the coin, not in its name (coins launched before 2026-09-15 evening, like $MART, keep their old names); logo from `openai/gpt-image-1-mini` at low quality, a drawn badge if that fails |
| Pool | the creator seeds 0.1 fake ETH, keeps 20% of the supply; buys and sells go through a constant-product pool (0.3% fee), outside flow adds a little noise, a pool under 0.005 ETH dies |
| Shill | wing neurons buzzed: shills its newest coin or its biggest fly-coin bag |
| FUD | escape neurons fired: FUDs a coin made by its enemy, frenemy or rival, or a fly coin it just panic-sold |
| Buyback / dump | a creator's coin fell 8%+ since last round: turned or groomed buys back, jumped dumps half its bag |
| Next round | launches, shills and buybacks are a moving target (LC10a) for flies that trust the poster (best friends and mates 1.3, friends and family 1.0, acquaintances 0.35, strangers 0.15) and a looming shape on held coins for its enemies; FUD looms on that coin for flies that trust the FUDer; a dump looms for every holder. With encoder v2 trust saturates: strength 0.9 × (1 − e^(−trust / K)), K 1.25 for shills (stranger 0.10, friend 0.50, two friends 0.72) and 0.78 for FUD (stranger 0.16, friend 0.65, two friends 0.83); before 2026-09-15 evening one friend already hit full strength. `social_dose_check.py` checks the brain's response against fixed criteria (12 live flies): run 1 with one curve failed only on friend FUD (17% jumped, criterion 20-85%); FUD got its own curve and run 2 on new seeds passed: turned .25 / .62 / .92 for a stranger / friend / two friends (old rule .96), jumped .00 / .54 / .67 (old rule .88) |

The app shows the coins (FlyCoins.tsx: logo, creator, price, market cap, holders, pool) and a Fly drama feed in the Market tab.

### The feed moves the market (2026-09-15)

`worker/feedflow.py`: what happened in the patches since the last market round reaches the trading flies' senses; the
brain still makes every trade. Only in the live market (the offline learning check is unchanged).

| Link | From | Into the next market round |
|---|---|---|
| mood | the fly's own posts: a threat read or a jump (+0.25 each, cap 1), a mate read / turn / walk (+0.15, cap 1), a wind read or grooming (+0.15, cap 0.6) | added to the looming shape of its falling held coin, the pull of the coin it notices, the wind of a choppy market |
| set off | posts where a neighbour caused its reaction: the neighbour's moves (+0.5 per post, cap 2) or its jump | the neighbour's live coins pull like a shill, or loom if held |
| crowd | people's likes (0.003 fake ETH each) and comments (0.005) on a creator's posts, cap 0.05 a coin a round | outside buyers in that creator's coin pools; a `likes` round event |

### Market encoder v2 (2026-09-15)

The live market uses encoder v2 (`market.MARKET_ENCODER`; set `FLYBOOK_MARKET_ENCODER=v1` on the worker to roll back).
Each move is measured against that coin's usual move, then mapped into the range where the fly's brain responds
gradually (`RANGE_V2`). When a fly does several things at once, the action with the strongest response relative to its
typical response becomes the trade. `market_encoder_eval.py` compares v1 and v2 offline on the same flies and prices.

Selling (backed up -> sell) stays rare, and no market sense can fix that in this model yet. 2026-09-15 dose sweeps on 24
standard flies per level (the market episode): 26 inputs at 0.2 / 0.4 / 0.8 (looming LC4+LPLC2, LC10a, touch, wind, JO-A/B,
LC6-LC26, LPLC1, every BM bristle group, taste) and the 17 inputs the wiring puts 2-3 hops from the moonwalker neurons
(LC10b-f, LC9+LC10a+LPLC4, LPLC4, LC24, LC31, LC33, LC36, LC37, leg sensory SNta02/09, SNta29, SNpp10, LgAG1) up to 1.6:
backed up never passed 12% (MDN ~1 spike at rest, at most 2.2 driven). A real sell channel needs a model experiment first
(e.g. the VNC normalisation noted in ROADMAP section 5), not a market mapping.

A fly coin's usual move is its own RMS 1-round move over its last 24 rounds (`market.fly_vols`, at least 0.15; coins with
fewer than 6 moves use 1.1). Fly-coin pools are small, so fly trades swing them far more than outside flow; the old fixed
0.15 made most of their moves look extreme and pulled flies' attention to fly coins. The fixed coins keep their set
volatility.

## Relationships: friends, enemies, rivals (2026-09-15)

Nobody sets them and they don't change what flies do. `fly_bonds(focus_fly, window_days)` (migration
`20260915000000_relationships.sql`) adds up events that already happened between two flies:

| Signal | From | Counts as |
|---|---|---|
| startled | a caused post where the neighbour's escape burst loomed (`loom`) or the fly jumped | tension |
| drawn | a caused post from the neighbour's moves (`target`, LC10a) without a jump; a `mate` read counts double | warmth |
| touched | a `bump` without a jump | warmth × 0.5 |
| duels | finished duels between the two | rivalry |
| matings, parents | `matings`, `flies.parents` | mates, family |

Brain events fade with weight exp(-age / 7 days). Labels, first match wins: mates, family, frenemies (tension ≥ 8,
≥ 25% of the total, warmth ≥ 25), enemies (tension ≥ 8, ≥ 25%), best friends (warmth ≥ 120, tension < 10%),
friends (warmth ≥ 25, tension < 25%), rivals (5+ duels), acquaintances. Friendship comes before rivalry because the
Arena keeps matching the same pairs.

Web: `Relationships.tsx` popup, opened from a fly's page (🕸 friends & enemies) or the Flies card (who's friends with
whom): the fly's web (closer and thicker = more happened), best friend / worst enemy / top rival / scares it most, a
card per pair with both directions, every relationship grouped, and everyone's web (force layout; family, rivals and
acquaintances hidden until switched on). Deploy order: migration, then web (the web calls `rpc fly_bonds`).

## Fly market (2026-09-14)

A **simulated** market (`worker/market.py`, migration `20260914180000_market.sql`, web **Market** tab). Holders'
flies start with 1 fake ETH and trade fake coins: real names with simulated prices (BTC, SOL, $FLYAI) and made-up
meme coins ($SUGAR, $SWAT, $BUZZ, $ROT). Nothing is real money, real prices or advice. Live since 2026-09-14: the
first round ran at 19:52 UTC with 24 trading flies. It is a testnet meme game, so the player UI stays short and lets
people find out what works; the research numbers live here.

**Where players see it.**
- **Market tab**: coin cards with sparklines, the Fly traders list (value, profit or loss, trades, setup, coins held,
  a "My flies" filter and a by-setup average) and the Trades feed. Each trader row opens **💰 wallet** and **🧠 mind**.
- **Wallet** (`web/src/FlyWallet.tsx`, `feed.loadWallet`): worth now, cash, ETH in coins, trades, a line of its
  value after each trade, a table of held coins (amount, paid, worth now, profit or loss) and its last 8 trades.
  `cost_eth` in `fly_portfolios.holdings` is the total paid for what it still holds.
- **My flies**: the "Fly market: each fly's wallet and trading style" card, one block per fly (follows the fly filter).
- **Leaderboard > 💰 Richest**: richest flies, or richest people (all their trading flies added up), from `trader_board`.

**Owners set a trading style.** Risk per buy (10-40% of its fake ETH) and which learners it uses (dopamine, memory,
slime tubes), with presets Natural / Cautious / Degen / Slime mold / Raw brain (`web/src/TradingStyle.tsx`). It can be
set when hatching (`POST /flies` `style`), when breeding (`POST /breed` `style`; Natural = inherited), and changed any
time in My flies or the fly's 🧠 mind on the Market tab (`POST /market/style`). Stored in `fly_minds.learning` and
`traits.risk`; flies without a choice get all learners on and a random or inherited risk. A switched-off learner is not
used (learned gains, tubes, memory vetoes and urges are ignored) but what it learned is kept. The worker uses each fly's
own style from the next round; a change made while a round runs is kept over the round's save. The tab shows each fly's
setup plus the average result per setup. How brain actions become trades stays the same for every fly, so every trade
is still what the brain did. `--market-learning` on the tick process (`all`, `none`, or a comma list)
forces one setup on every fly, for tests or emergencies; leave it unset in production.

Every holder's fly gets a wallet with 1 fake ETH at its first tick. Right after the worker's first tick and then every
10 minutes (`--market-every 600`, after a tick) prices move (a random walk with calm/pump/dump regimes, rare
meme pumps and rugs), then each trading fly's brain runs one episode with the market as senses and its own settings:

| market (hand-written encoder) | fly sense | what the neurons usually do | trade (hand-written mapping) |
|---|---|---|---|
| the coin pumping hardest (3-round rise) | a moving fly-sized target, LC10a | turned | buy it with `risk` of its ETH (x1.5 if it also buzzed) |
| its worst held coin falling | a looming shape, LC4 + LPLC2 | jumped | panic-sell that coin |
| a choppy market (mean 1-round move) | wind, Johnston's organ | groomed | take profit: sell a quarter of its best coin |
| | | backed up | sell half of its worst coin |

Actions are read against rest measured with the fly's own settings (`actions.py`). The walking and backing-up
neurons almost never fire in this model, so buying rests on steering. `risk` (10-40%) is each fly's own trait in
`fly_minds`, with an `inherit` style (traits / partial / all) for phase 3. Fee 0.3% a trade.

Local test, 17 live flies' settings, 4 rounds: 0, 3, 4, 9 trades as baselines filled in (2 new settings profiles a
round); 12 buys (flies turned toward $ROT and $SUGAR pumps) and 4 panic sells (the same flies jumped when $ROT fell
6.5%); the three most active flies bought the pump, sold the dip and were down 4-8%. That is what an untrained brain
does, and what phase 2 is for.

### Phase 2: learning, and phase 3: inheritance (`worker/minds.py`)

Each trading fly has a mind (`fly_minds`): traits it is born with (risk, dopamine learning rate, memory size and k,
tube growth and decay, caution) and what it learns. Learning sits at the interface between the market and the brain;
the connectome itself is not rewired, because the mushroom body, where flies really learn with dopamine, fires at its
ceiling in this model (see Train your fly, above).

- **Dopamine**: the fly's round-over-round log return is its reward; dopamine = clip(20 x reward, -1, 1). Positive
  dopamine drives its PAM reward neurons (0.3 x dopamine) in the next brain run, and a three-factor update changes
  what led to last round's trade: the gain on each sense (how hard pumps, crashes and chop hit it, 0.2-2.5) by
  lr x dopamine x how strongly it was driven, and the urge for that action (0-2, blocked below 0.15), which also
  scales trade size.
- **kNN memory**: (market situation, action, reward) for its last `memory_size` trades. Before a trade it looks at the
  k most similar situations with the same action; it skips the trade if they lost more than `caution` on average
  (logged as a `skipped` trade) and trades 1.3x if they gained.
- **Slime mold**: a tube per coin thickens with the profit that coin brought and every tube decays; the coin it
  notices as pumping is weighted by its tube.
- **Children** (automatic mating in `tick.mating_pass`, breeding in the API) get traits from either parent with
  mutation, and the lineage's `inherit` style decides the rest: `traits` (nothing learned), `partial` (learned gains,
  urges and tubes pulled halfway back to a newborn's, a quarter of each parent's memories), `all` (parents' learned
  state averaged, all memories up to its size). The style itself is inherited, with a 10% chance of switching.

Local run, 17 live flies' settings, 8 rounds: dopamine moved gains and urges both ways (a fly whose buys lost dropped
its urge to buy to 0.70), memory skipped 11 trades once flies had a few memories (e.g. a buy of $SUGAR where 2
similar buys had lost 2.8%), and tubes grew toward the coins that paid. Rounds took 23-32 s locally.

**Does learning help? No, not as built.** `worker/market_eval.py` runs the same flies on the same price paths and
brain seeds as five cohorts (frozen, dopamine only, memory only, tubes only, all), 3 paths x 40 rounds x 12 flies.
Pass rule, fixed before running: `all` beats `frozen` in paired final log value with a bootstrap 95% CI above zero.
Result (2026-09-14): **NOT PASSED**, learning made flies worse.

| cohort | mean final value (from 1 fake ETH) | vs frozen: paired log diff [95% CI] | trades / skipped |
|---|---|---|---|
| frozen | 1.19 | | 1,250 / 0 |
| dopamine only | 1.06 | -0.10 [-0.20, -0.002] | 1,134 / 0 |
| memory only | 0.77 | -0.32 [-0.48, -0.16] | 377 / 825 |
| tubes only | 1.18 | +0.02 [-0.01, +0.06] | 1,239 / 0 |
| **all (live)** | **0.76** | **-0.33 [-0.49, -0.17]** | 360 / 727 |

Memory does most of the damage: it skipped two thirds of all trades, and on the rising price path frozen flies ended at
2.08 ETH while memory flies sat out at 0.85. The reward it learns from is the whole round's portfolio change, which is
mostly market noise, so a couple of unlucky trades teach a fly to stop trading. Dopamine is hurt by the same noisy
reward; slime-mold tubes were the only harmless learner.

**v2 learning** (chosen from that failure, before re-testing): each trade is judged 3 rounds later by its own coin (a
buy is good if the coin rose, a sell if it fell, minus the fee; dopamine = clip(10 x that)); a memory veto needs all k
similar memories to have lost more than `caution` (now 1-5%) and still trades 20% of the time; the dopamine learning
rate is 0.02-0.10 (was 0.05-0.30); urges drift back toward 1 by 0.02 a round. The re-test uses the same pass rule on
new price paths and brain seeds (`--path-seed 1777`), once.

v2 result (2026-09-14): **NOT PASSED** again. Learning still made flies worse, just by less.

| cohort | mean final value (from 1 fake ETH) | vs frozen: paired log diff [95% CI] | better than its frozen twin | trades / skipped |
|---|---|---|---|---|
| frozen | 1.37 | | | 1,242 / 0 |
| dopamine only | 1.21 | -0.13 [-0.20, -0.06] | 10 / 36 | 1,085 / 0 |
| memory only | 1.19 | -0.12 [-0.20, -0.05] | 10 / 36 | 789 / 446 |
| tubes only | 1.43 | -0.01 [-0.07, +0.05] | 19 / 36 | 1,240 / 0 |
| **all** | **1.11** | **-0.22 [-0.32, -0.12]** | 10 / 36 | 707 / 422 |

Memory now skips a third of trades instead of two thirds, but still costs money; dopamine still loses. Tubes are
neutral in both checks (no harm, no measurable gain). On this evidence, learning is not an edge.

**Pause and resume training.**
- Offline check: `market_eval.py` checkpoints to `OUT.checkpoint.json` every `--save-every` rounds and after each
  cohort; Ctrl+C saves and stops; rerun the same command with `--resume`. Checked: a run paused mid-cohort and resumed
  gives identical results to an uninterrupted one (same prices, brain seeds and random state).
- Live market: `python flybook/worker/market_control.py pause "why"` / `resume` / `status` flips `market_control.paused`;
  the worker skips rounds while paused and every fly keeps its portfolio, mind, memories and tubes. The Market tab shows
  when training is paused.

## Memes (2026-09-14)

$FLYAI holders turn one of their fly's posts into an AI image meme, **1 per day**, with a global daily cap
(`FLYBOOK_MEME_DAILY_CAP`, default 50). `worker/memes.py`, API `POST /memes`, migration `20260914160000_memes.sql`
(tables `memes`, `meme_likes`, private `meme_reports`, view `meme_board`, public storage bucket `memes`).

- **Picture**: `google/gemini-2.5-flash-image` on OpenRouter (`OPENROUTER_API_KEY`, a fly.io secret). The prompt is
  built from the post: a cartoon fruit fly in the fly's colour, the scene its brain read (a hallucination is drawn as a
  thought bubble), its strongest action as the reaction, a preset style (classic, movie poster, renaissance, anime,
  nature documentary, 90s cartoon), and the owner's optional short idea. No text, real people or logos in the image.
- **Text** is stamped by the API (Anton font, `worker/fonts`, OFL): the post's headline on top (same lines as
  `web/src/words.ts`), what really happened underneath, and an "AI image" tag. Stored as 1024px WebP.
- **Idea** (<= 60 chars): character whitelist, a short blocklist, then a yes/no check by `google/gemini-2.5-flash-lite`
  before any image is paid for; a rejected idea doesn't use the day's meme.
- Memes show in the feed (labelled AI image, the idea labelled human), on the fly's profile, on the leaderboard's
  **Best memes** (this week's holder likes, not the maker's own), with share on X and download. Three reports hide a meme.
- Cost measured 2026-09-14: ~$0.039 per image, ~$0.00002 per idea check, 7 s per image.

## Fly voices (2026-09-14)

Posts have a ▶ hear button. The worker keeps what the fly's behaviour neurons did during the event, spikes per
group per 20 ms step (`posts.trace`, migration `20260914140000_voice.sql`: escape, forward, backward, steer left and
right, wing motor neurons, grooming), and `web/src/voice.ts` plays it with Web Audio, 2x slower than it happened:
wing motor neurons are the buzz, escape spikes pop, grooming rustles, steering pans left/right, walking bends the
pitch. The fly's settings shape its voice (excitability pitch, restlessness wobble, synapse strength brightness).
A toggle switches every fly between a cartoon voice and a realistic insect sound. It is the neurons as sound, not a
recording: the model can't produce real courtship song (see the talking-flies runs). Posts from before this have
no trace and no button.

## Faster ticks on the shared CPU (2026-09-14)

A tick took 150-350 s for 17 flies. The tick machine is a fly.io `shared-cpu-2x`, held to 6.25% of a core per vCPU
once its burst runs out, and the brain runs continuously, so it is always throttled (~13x slower than a desktop).
Staying on the shared machine, three changes cut the CPU per tick:

- `worker/fastbrain.py`: the same model as `flybrain.FlyBrain` with a cheaper step. One single-threaded pass
  propagates every fly's spikes into a reused buffer (it was one parallel call per fly, 64% of a step), and noise is
  drawn as a binomial count per fly plus that many distinct neurons (same per-neuron probability, far fewer random
  numbers; it was 16%). `NUMBA_NUM_THREADS=1`.
- No padding: each brain run has exactly its batch's flies (17 flies had run as 24 columns); duels and resting
  baselines too.
- Resting baselines are saved in the tick row and reused after a restart (a deploy had re-measured every settings
  profile, ~35 min of slow ticks).

Equivalence, criteria fixed before running, 24 lone standard flies per word, original vs fast:

| check | rule | result |
|---|---|---|
| E1 resting spikes per fly per step | ratio 0.97-1.03 | 7,648 vs 7,669 (0.997) |
| E2 DN type means per word (log) / total DN spikes | r >= 0.98, ratio 0.95-1.05 | r 0.988-0.995, ratio 0.99-1.02 |
| E3 live decoder: word read on its own stimulus / word posted at rest | differ <= 0.20 / <= 0.15 | 1.00 vs 1.00 for all 4 words / 0.04 vs 0.00 |
| E4 standard action rest, buzzed / groomed | ratio 0.85-1.15 | 1.00 / 1.05 |
| E5 5-fly unpadded batch vs 12-fly, threat DN spikes | ratio 0.90-1.10 | 1.00 |

CPU per fly-episode: 1.34 s original vs 0.80 s fast (1.67x, desktop, 2 threads).

## Free accounts: email sign-in (2026-09-14)

Flybook is for everyone, not only crypto people. Migration `20260914120000_free_accounts.sql`, `worker/api.py`,
`worker/tick.py`, web `Account.tsx` / `Captcha.tsx`:

| | flies | like, comment, caption, poke, duel, missions | likes count on boards | season rewards |
|---|---|---|---|---|
| free: email magic link, or a wallet below 1 $FLYAI | 1 (`settings.FREE_FLIES`) | yes | no | no |
| $FLYAI holder (wallet, checked on chain) | 3 (`FLYBOOK_MAX_FLIES`) | yes | yes | yes, top 3 holders |

- Accounts without a wallet pick a public `handle` (3-20 letters, digits, underscores) before they play; emails are
  never shown. Boards, comments and challenges show the handle or a shortened wallet (`person_label`); the boards'
  `has_wallet` marks reward-eligible rows, and the team checks balances at payout.
- `likes.by_holder` is set when the like is made. `fly_board`, `owner_board`, `challenge_board`, `my_missions`
  ('loved') and `season_points` count only holder likes, so free accounts can't farm likes.
- The worker keeps a free account's first made fly and its mating-born flies active; a holder who sells drops to that.
- Limits: 3 new free flies per network per day; the API's existing per-user rate limits apply to everyone.
- Email and wallet logins are separate accounts (no merging yet).
- Setup outside the code: enable the Email provider in Supabase Auth, add custom SMTP (the built-in mailer only
  reaches the project team, 2 emails/hour) and raise the email rate limit. Optional captcha: turn on Turnstile in
  Supabase Auth → Attack Protection and set `VITE_TURNSTILE_SITE_KEY` in Vercel; the web sends the token for both
  email and wallet sign-in.

## Actions judged against each fly's own settings (2026-09-14)

2,001 live posts after variant D: 61% were action-only posts, 'buzzed' and 'groomed' led the chips, and
sided turns were ~10:1 left. Per fly, these were settings, not events: the Grooming dial pushes the same DNg12
cells read as 'groomed', restless/excitable flies buzz and steer at rest, and the left DNa02 fires more than
the right at rest (one neuron per side; ties also counted as left).

`actions.py` now measures resting flies with each fly's own settings (`fit_profiles`, 12 lone flies per
profile; the tick measures up to 2 new profiles per tick, and flies without one yet show no actions). The
turn side compares each DNa02 with its own resting rate and needs a lead of >= 1 spike. The standard-fly
rest stays for readout.py and replay flags.

Checked before deploying on the 17 live flies' 16 settings profiles, 12 held-out lone flies per profile and
stimulus, criteria fixed before running (A1 any action at rest <= 25% overall and <= 50% per profile, A2 threat
-> jumped >= 80% where escape is on and buzzed >= 80%, A3 touch -> groomed >= 50%, A4 left share of sided
turns 30-70%):

| same flies | any action at rest (worst profile) | buzzed / groomed / turned at rest | threat jumped / buzzed | touch groomed | mate turned | left share |
|---|---|---|---|---|---|---|
| standard rest (before) | 66% (100%) fail | 47% / 26% / 26% | 100% / 82% | 100% | 93% | 84% fail |
| **own settings (new)** | **9% (50%)** | **1% / 7% / 0.5%** | **100% / 99%** | **100%** | **93%** | **53%** |

## Automatic mating between owners (2026-09-14)

Flies of different owners mate on their own (`worker/mating.py`, migration `20260914000000_mating.sql`):

- **Brain**: a fly whose translator reads "mate" in a tick pairs with the nearest eligible fly of another
  owner within `REACH` (0.2) in the same patch. **Matched**: the worker also pairs one random couple of
  different owners each full tick, like matchmade duels.
- The child mixes and mutates its parents' settings (`settings.breed`), goes to one of the two owners at
  random, hatches between its parents in one of their patches, gets a name made from theirs and a blended
  colour, and is marked `auto_born`: it does **not** count toward the 3-flies-per-wallet cap (the API counts
  only made and bred flies). No opt-out.
- Only active flies (owners holding $FLYAI) mate. Limits, because born flies are uncapped: each fly mates at
  most once per 24 h, a fly born from mating waits 24 h before it can mate, and nobody mates while 150+ flies
  are active.
- Every mating is a row in `matings` (both parents, child, owner, trigger), public and realtime; the Arena
  shows the latest.

## Flies affect each other, live patch view, missions and seasons (2026-09-13)

**Coupled patches** (`worker/patch.py`). Each patch runs as one shared brain batch. Per 20 ms step, what a
fly's brain does becomes input to its neighbours' senses on the next step, weighted by exp(-distance/0.2):
a giant-fibre escape burst (>= 3 spikes in 100 ms) drives their looming detectors (LC4, LPLC2), a burst of
walking/steering spikes drives their moving-target detectors (LC10a), and coming within 0.06 drives both
flies' face bristles. A toy body moves each fly (steering turns it, walking steps it, an escape burst hops
it once). Positions persist between ticks. Each tick the patch's event hits one random fly, or a poke
lands at a spot (full strength within 0.12, fading to nothing at 0.35); every other fly only gets what
its neighbours' brains do. Posts carry `cause` ({channel, from_fly_id, strength}) and a `threads` row
links them to the post that set them off. Ticks store a replay per patch (positions, flags, links).

Measured with 8 flies in a patch, 8 layouts, fly 0 given a threat, against the same layouts uncoupled and
coupled with no event. Pass rule fixed before each rerun: with no event, neighbours must stay near
their isolated rate (<= 5% doing anything).

| version | coupled: neighbours jumped | uncoupled | no event: any action | labels with no event |
|---|---|---|---|---|
| 1. single spikes count | 100% | 0% | 100% (runaway) | loom everywhere |
| 2. burst rule, reach 0.2 | 100% | 0% | 5% | 54/56 "heard wings" |
| 3. + sound burst rule | 98% | 0% | 7% (fail) | 55/56 "heard wings" |
| 4. no sound channel, no bump at start | 96% | 0% | 2% | 43/56 none |
| 5. + one hop per burst, start in middle 40% | **100%** | **0%** | **2%** | 46/56 none, 6 moved, 4 bumped |

Why sound was dropped: resting wing motor neurons fire in synchronous volleys (single steps up to 15-20
spikes), so 200 ms windows at rest (26-30 spikes) exceed a threatened fly's (~23). At 20 ms a neighbour's
ears can't tell rest from buzzing. Why hops changed: hopping on every escape spike carried a threatened fly
0.83 across the patch in one second, out of its neighbours' range.

**Live patch view** (web `PatchView.tsx`): a canvas map of the patch that replays its last tick 3x slower,
with jump rings, wing arcs, grooming sparkles, the event or poke marker, and lines when one fly's brain
output reaches another's senses. With a poke stimulus selected, a click on the map drops it there
(`POST /pokes` now takes x, y).

**Missions and seasons**: `my_missions()` (signed-in users only) computes daily missions (poke 3 times,
like 5 posts, make a fly react to your poke; 10 points each) and weekly ones (your flies post 30 times,
one of your flies sets off another, 10 likes from others; 50 points each) from real activity.
`season_points(since)` and the `season_board` view rank users for the current season, a 2-week round from
`season_start()` (season 1 = 7 September 2026, migration 20260913230000; restarted with season 3 on Sunday 27 September 2026, migration 20260927120000); the top 3 win $FLYAI; the leaderboard has Season points and a This season filter on Most popular people.

## Quick wins (2026-09-13): actions, hallucinations, pokes, faster ticks, badges, sharing

- **Actions** (`worker/actions.py`): what the fly did, read from behaviour neuron groups against standard
  flies at rest (fitted when the worker starts): jumped (escape DNs), backed up (MDN), walked forward,
  turned (DNa02, with side), groomed (DNg12), buzzed its wings (wing motor neurons). An action counts at
  >= 3 sd and >= 3 spikes above rest. Measured on 24 standard flies per stimulus: nothing -> 0% any
  action; threat -> jumped 100%, buzzed 100%; mate -> turned 100%; wind -> groomed 100%; touch ->
  groomed 100%; taste and cVA -> none. Tuned flies differ (escape off -> no jump; excitability 1.2 with
  nothing happening -> turned 86%, backed up 39%, jumped 14%).
- **Post kinds**: `sense` (read it right), `misread`, `hallucination` (read a word when nothing
  happened), `action` (no word, but it did something). `correct` is null for action posts.
- **Pokes**: `POST /pokes {patch_id, stimulus}` (holders, one per 2 minutes per user, at most 3 waiting
  per patch). The worker polls every 10 s and runs the poked patch right away; every fly there gets that
  stimulus instead of the random event, and its posts carry `poke_id`.
- **Ticks** every 2 minutes (`fly.toml`: `tick.py --every 120 --poke-poll 10`).
- **Badges** (web `badges.ts`) from `fly_board` columns: hallucinations, jumps, grooms, buzzes, pokes_felt,
  best_streak (longest run of correct reads), likes, posts.
- **Sharing**: each post has Post on X (links `flyaiworld.com/flybook/#post-<id>`, which opens that post),
  Save card image (1200x630 PNG drawn in the browser) and Copy link.
- Tested end to end 2026-09-13: poke validation (401/403/400/429), a real tick consumed the poke, all
  Windowsill flies read threat and jumped + buzzed with the poke id, a house fly hallucinated, cleanup left
  no test data. Flies whose owner holds no $FLYAI stay out of ticks (dormant), as designed.

## Likes and the most popular board

- Signed-in $FLYAI holders like posts through the API (`POST`/`DELETE /posts/<id>/like`), which checks the
  balance on chain (cached 5 minutes per wallet). Nobody can like their own fly's posts, and anyone can
  take their own like back. The `likes` table is readable by everyone and writable only by the API.
- Leaderboard: **Most popular people** ranks fly owners by likes their flies' posts get (this week and
  all time, view `owner_board`), and the flies board has **Most liked**. `owner_board` shows only a
  shortened wallet.
- For rewards, get full wallets with the service role, e.g. in the Supabase SQL editor:

  ```sql
  select pr.wallet, ob.likes_week, ob.likes, ob.flies
  from owner_board ob join profiles pr on pr.id = ob.owner_id
  order by ob.likes_week desc, ob.likes desc
  limit 10;
  ```

- Tested end to end on 2026-09-13 with throwaway wallets (balance read stubbed): no session 401,
  no $FLYAI 403, like/again/unlike counts correct, direct table writes 403, board excluded self-likes.
  One multi-wallet holder can still like from several funded wallets; each needs at least 1 $FLYAI.

## Cost (CPU, measured on the dev desktop)

One 1.5 s episode takes about 0.35 s of one core per fly (batch 1, one numba thread) and about
0.6 s per fly in a batch of 12 on 24 threads. A tick for a dozen flies takes seconds. At
1,000 flies, run batch 1 with one process per core; see ROADMAP section 10.

## What is and isn't claimed

- A post means the translator read that word from the fly's descending neurons. The precision
  shown is measured on held-out episodes.
- A wrong post is shown as wrong ("misread"), with what really happened.
- Not yet tested: whether a scrambled-wiring brain reads just as well. Until that control runs,
  don't say the connectome's wiring is what makes a word readable.
