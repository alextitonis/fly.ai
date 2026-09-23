# fly.ai compute

People lend their GPU or CPU to the network from a browser tab. The free work is the fly brain: each job runs
the full connectome (166,700 neurons, 25 million synapses) for 15 simulated seconds and counts what the motor
neurons do. The server checks a sample of the answers by re-running them and keeps each day's credit. Credit
becomes monthly points per wallet, multiplied by the wallet's stake tier. After each month, a $FLYAI pool is
split by points and claimed from a contract.

Anyone can also buy compute:
- **Brain experiments.**
- **Their own programs:** WebAssembly or GPU shaders.

Buyers pay in $FLYAI (or USDC on Base) per finished job, and 80% goes to miners. We queue our own work as house
orders: brain tuning, world simulations and encoding data.

**Status (2026-09-17):**
- **API:** live at https://flyai-mine.fly.dev (database schema 12), with:
  - wallet sign-in, once for every page (30-day sessions), stake tiers, monthly points and claims;
  - paid orders with bids, budgets and balances, and results by webhook, stream or pull;
  - buyers' programs (WASM and WGSL);
  - house orders;
  - paying in USDC on Base at the live $FLYAI price, gasless through the server's relayer;
  - miners giving back jobs they hold (`/api/release`), so a reloaded page doesn't sit on 64 jobs.
- **Card payments:** built (Coinbase Onramp, guest orders with no wallet) but **switched off**: the Coinbase keys
  were removed from the server secrets while Coinbase's verification is pending. Setting `CDP_API_KEY_ID` and
  `CDP_API_KEY_SECRET` again turns them back on (see *Paying with a card*).
- **Website:** live at www.flyaiworld.com/compute/: Mine, Buy compute, Stake, Claims and Leaderboard, with wagmi
  wallets (browser wallets and WalletConnect for phones) and mining on phones. The API guide is at
  /compute/compute-api.md.
- **Contracts:** deployed and verified on Robinhood Chain.
- **Pool:** September 2026 announced at 6,530,000 $FLYAI (raised from 5,250,000 by ~$100 on 2026-09-19); not yet snapshotted or funded (after 1 October).
- **House work:** the research orders (tuning, world, encoding, demo) were stopped on 18 September so the fleet
  mines instead; their results up to that point are still readable with `npm run pull:house`. The only house work
  now is `mining/yescrypt` and `mining/kaspa`.
- **Examples:** `examples/`, published on GitHub, including `btc-pool`: a bridge from a Bitcoin pool to a
  hash-search order, with a guided setup for non-coders (checked against live pools, no real share yet).
- **Mining for the project: LIVE** since 18 September. The bridges run on their own Fly app (`flyai-bridge`) and
  feed two house orders: yespower on the CPU (~$0.02 per machine-day) and Kaspa on the GPU (a rounding error, but
  it proves the path). No pool has accepted a share yet; see *Mining for the project*.
- **Extension:** version 0.2.0 built, not yet on the Chrome Web Store. It takes brain jobs, plus our own world
  runs and probes when "Also run world sims and probes" is on. Buyers' programs and embeddings run on the website
  only (see *Browser extension*).
- **Embeddings (`kind: "embed"`):** built and tested end to end (18 September): text in, one vector per text out,
  run on miners' GPUs with transformers.js. See *Embeddings*.
- **Results page:** `/compute/results` shows what each research order found (`GET /api/experiments`).

People mine from either place, and both earn points for the linked wallet:
- **The website's Mine page:** runs while the tab is open.
- **The extension:** runs in the background.

Standalone: it shares the connectome files and parser with `world/` and nothing with flybook.

## Run

```sh
cd mine
npm run check      # integer engine: exact helpers, deterministic, seed/drive sensitive (~10 s)
npm run validate   # integer brain vs the world's float brain, 6 conditions x 4 seeds (~5 min)
npm start          # http://localhost:8787/compute/ to mine, /compute/bench for GPU vs CPU
```

Needs Node 22.18+ (built-in TypeScript stripping and `node:sqlite`). No runtime dependencies and no
build step: the server strips types from the `.ts` files as it serves them. `npm install` only
brings in dev types for `npm run typecheck`. GPU mining needs WebGPU (desktop Chrome and Edge).

| env | default | |
|---|---|---|
| `PORT` | 8787 | |
| `MINE_DB` | `data/mine.db` | SQLite file |
| `CONNECTOME_DIR` | `../world/public/connectome` | output of `flybrain export --web` |
| `VERIFIERS` | cores − 1, at most 4 | server threads that re-run answers (~300 MB of memory each) |
| `AUDITS` | 3 | an answer is re-run with chance `AUDITS / (miner's jobs today + AUDITS)` |
| `CANARY_RATE` | 0.15 | share of handed-out jobs whose answer the server already knows |
| `CANARY_POOL` | 100000 | idle verifiers work open jobs until this many answers are known |
| `PRUNE_AFTER_HOURS` | 24 | finished screen jobs untouched this long are summed into `screen_sums` and deleted; credit, `/api/results` and the job totals are unchanged, and canaries, paid, program and house jobs are never pruned |
| `MIN_CHECKED` | 2 | checked answers a miner needs in a day before its credit counts |
| `AUDIT_QUEUE_MAX` | 500 | re-runs waiting beyond this are skipped (canaries still apply) |
| `OPEN_TARGET` | 3000 | when fewer jobs are open, the next round of the screen is added |
| `MAX_JOBS` | 64 | jobs one miner can hold at once (a GPU holds a batch of up to 32) |
| `JOB_TTL_MIN` | 20 | minutes before an unreturned job goes back out |
| `TRUST_PROXY` | unset | set behind a reverse proxy so per-IP limits use `X-Forwarded-For` |

## The work

The job grid is a sensory-to-motor screen:

- **Channels:** each eye channel (LPLC2, LC4, LPLC1, LC10a) and touch (SNta), on each side.
- **Grid:** 4 drive strengths × gain {2, 3, 4} × tonic {0.10, 0.14, 0.18} × 3 seeds, plus undriven controls. That's 1,107 jobs per round.
- **Rounds:** when open jobs drop below `OPEN_TARGET`, the server adds the next round with 3 new seeds.
  Work never runs out, and every round tightens each cell's average.
- **Each job:** 5 seconds at rest, then 10 seconds driven. It records spikes per motor group in both windows.
- **Where to read it:** `/api/results` averages the jobs over seeds.

For example, driving the left LPLC2 raises DNp01 (the giant-fiber escape neuron) on the left side by about 11 Hz.

What the UI's job counts mean:

- **Session:** jobs, units and units/min since Start on this page (units/min, because a world run is one job worth several brain jobs). It resets when the page reloads.
- **Jobs today / units:** your jobs accepted today, and the credit left after checks. Points = units × stake multiplier.
- **Standing today:** `ok` if every checked answer matched, `zeroed` after a wrong one.
- **Your share:** what this month's points would be worth at today's pool, and the share they are. An unlinked miner
  sees what it would get if it linked a wallet now; program jobs already paid to wallets are added on top. It is an
  estimate: it moves as everyone mines, and the month's snapshot decides.
- **Fleet line:**
  - **online:** miners active now.
  - **jobs today:** all miners' jobs today.
  - **"X of Y screen jobs done":** progress through the current grid, which grows by a round when it runs low.

### Beyond the screen

The screen proves the network works. Useful work now runs as orders:

- **Paid orders:** buyers' brain sweeps and programs.
- **House orders:** our own tuning, world simulations and encoding datasets, stored for good and pulled with
  `scripts/pull-house.ts`.

Still to come:
- **Evolution:** keep the best-scoring brains each round and mutate them.
- **Scoring:** a per-experiment score from the recorded output.
- **Results page:** `/compute/results`.
- **Fitting:** Flybook's translator and the market's action reader, fitted on the probe data.

## Paid orders

Anyone can buy connectome sweeps on the Buy compute page (`/compute/jobs`) or through the API. Orders are off
until `PAY_TO` is set. The code is in `src/orders.ts` and the "paid orders" part of `src/server.ts`, and
`npm run test:orders` runs the whole flow on anvil.

- **The job:** the buyer picks channels, sides, drive strengths, gains, tonics, seeds and rest steps. Each job is
  the same 750-step integer brain run as the screen, so GPU batches, verifiers and existing miners all work
  unchanged. Seeds come outermost, so an order cut short still has whole seeds of every condition.
- **The bid:** a price per job, at least `MIN_BID`. When a miner claims work, a random live order is drawn,
  weighted by its bid, and only then the free screen. Higher bids feed the pool more and get picked more often.
  Canaries still come first at `CANARY_RATE`.
- **The limits:** `max_parallel` is how many of an order's jobs are out at once. The buyer sets it, capped at
  `ORDER_MAX_PARALLEL`. Each job has one holder at a time, so this also caps how many miners work on one order.
  Sweeps hold at most `ORDER_MAX_JOBS` jobs.
- **The budget and the end:** an order runs until its sweep is done, its budget is spent, its optional time
  limit (`hours`) passes, or the wallet stops it. The unspent budget goes back to the wallet's balance, which
  can fund its next order.
- **Charging:** a job is charged at the bid when its answer settles, meaning `ORDER_REDUNDANCY` (2) different
  clean miners (wallets count once) returned the same answer, or the server ran it itself. If clean miners
  disagree, the job goes to the front of the audit queue, so a liar is struck at once. The server takes on a job
  only while `budget − spent − jobs out × bid` covers it, so charges never exceed the budget. With few miners
  around, idle verifiers work paid jobs regardless of `CANARY_POOL`.
- **Resale:** jobs are unique by params. When a sweep overlaps work already settled, including the screen's
  own runs, those answers are charged at `CACHED_PRICE` (or the bid, if lower) and are ready at once.
- **The pool:** `POOL_SHARE` (0.8) of every charge goes into the month it happened in. Pool figures and
  estimates (`announced_pool`) show the operator's announcement plus the buyers' part. A snapshot without `pool`
  uses that total and refuses a pool smaller than the buyers' part. The rest stays with the treasury (`PAY_TO`).
- **Paying:** no contract. The buyer sends one plain $FLYAI transfer of the order's budget to `PAY_TO`, and
  the server reads the receipt. Transfers carry no memo, so each budget ends in a random tag of 1–999,999 wei
  that's unique among unpaid orders. The server matches the exact amount, the order's wallet as sender, a block
  no older than the order, and a transaction not used before. A late payment for an expired order still
  starts it. A payment for an order that's already funded goes to the balance.
- **Signatures:** funding from the balance and stopping an order each need a `personal_sign` from the order's
  wallet, over a message the server writes.
- **Balances:** kept in the `ledger` table (deposit, fund, release, withdraw, charge). They're held in the
  treasury wallet. To return one: send the tokens back, then record it with `POST /api/admin/withdraw`.
- **Feeding results** (`src/webhooks.ts`): every settled row gets a `seq` that only grows. Buyers can pull pages after a seq, keep a server-sent event stream open, or give a `webhook` when creating the order. Webhook calls carry batches of up to 500 rows plus a final call. They're signed `X-Flyai-Signature: t=<ms>,v1=HMAC-SHA256(secret, "t.body")`, the secret is shown once at creation, and failures are retried with backoff (10 s doubling to 1 h, 60 tries). Webhook URLs must be https and resolve to public addresses; they're checked at creation and again before each call, and redirects aren't followed. The buyer guide with code is `web/compute-api.md`, downloadable from `/compute/compute-api.md`.
- **Results:** `GET /api/orders/:id/results` (JSON, or `?format=csv`) returns spike counts per motor group
  before and after the drive, marked `checked_by` server or miners. Hashes are never included. Anyone with the
  order id can read the results.

| env | default | |
|---|---|---|
| `PAY_TO` | unset | treasury address that receives payments; orders are off without it. `fly.toml` sets the dev wallet |
| `MIN_BID` | 1000 | lowest bid per job, whole tokens. `fly.toml` sets 20 (~$0.001 on 2026-09-16) |
| `CACHED_PRICE` | 250 | charge per job already settled (or the bid, if lower). `fly.toml` sets 5 |
| `POOL_SHARE` | 0.8 | share of each charge that goes to the month's pool |
| `ORDER_MAX_JOBS` | 50000 | jobs in one sweep |
| `ORDER_MAX_PARALLEL` | 64 | cap on an order's jobs out at once |
| `ORDER_MAX_HOURS` | 720 | longest time limit |
| `ORDER_TTL_MIN` | 60 | how long an unpaid order holds its tag |
| `ORDER_REDUNDANCY` | 2 | agreeing miners that settle a paid job |

### Paying with a card: USDC on Base (schema 11)

People without $FLYAI can pay in USDC on Base, which they buy with a card in an app like Coinbase or through
an onramp link. The order is still run and charged in $FLYAI, so miners, charges and the pool are unchanged.

- **Price:** `POST /api/orders/:id/usdc` quotes the budget in USDC at the live $FLYAI price. The price is the lower
  of GeckoTerminal and DexScreener, with no margin, cached for a minute (`GET /api/price`). The quote holds for
  `USDC_QUOTE_MIN`, and its amount ends in a tag under a tenth of a cent, so a transfer matches one order.
- **Paying:** either an exact USDC transfer (`POST /api/orders/:id/pay {tx, chain: "base"}`), or, with `RELAYER_KEY`
  set, **gasless**: the buyer signs an EIP-3009 `transferWithAuthorization` for free and
  `POST /api/orders/:id/usdc/authorize` sends it from the relayer wallet, which pays the gas. The relayer
  simulates every transfer first, so a bad signature or too little USDC costs nothing. The signed authorization
  names the payer, `PAY_TO` and the amount, so the relayer can't move anything else. It holds only gas money.
- **Credit:** the USDC's $FLYAI value at the quoted price goes into the wallet's balance and funds the order. Paid
  after the quote expired, the price at that moment is used, and if it no longer covers the budget it waits in the
  balance.
- **The pool:** 80% of each charge joins the month's pool as with any order, so the pages show it at once.
  `GET /api/month` adds `usdc_received` and `buyer_pool_from_usdc` (the part of the buyers' pool from
  USDC-paid orders), and the Leaderboard shows the breakdown. The USDC lands in the dev wallet, and the
  operator buys the $FLYAI to fund the pool by hand.
- **Paying by card, no wallet (Coinbase Onramp, schema 12; currently off):** with `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` set (a
  Coinbase Developer Platform secret key, Ed25519, with Onramp enabled for its project), **Pay with card** needs no
  sign-in:
  1. **Order:** `POST /api/orders {guest: true, ...}` makes a guest order held by `PAY_TO`, and returns its key once.
     The page keeps the id and key in the browser.
  2. **Checkout:** `POST /api/orders/:id/card` opens a single-use Coinbase checkout (`src/cdp.ts`) selling the order's
     price in USDC, at least `CARD_MIN_USD`, paid on Base straight to `PAY_TO` and filed under `order-<id>`.
  3. **Confirm:** `GET /api/orders/:id/card` asks Coinbase for that reference's transactions. A successful purchase
     to `PAY_TO` is checked on Base, credited in $FLYAI at the quoted price, and funds the order: everything a guest
     paid becomes its budget, and what the runs don't use returns to `PAY_TO`'s balance. A 30-second background check
     does the same, so an order starts even if the buyer closes the page. A declined card shows as failed.
  4. **After:** the order is listed in that browser, with a link (`/compute/jobs?order=<id>`, where Coinbase sends the
     buyer back), results, and a Stop that uses the key.

  Orders with a wallet (for example from the Bitcoin pool setup's pay link) can be paid the same way; their extra
  stays in their balance. Coinbase's docs don't say whether a purchase may go to a wallet other than the buyer's, so
  this may not fit Onramp's intended use. `CDP_SANDBOX=1` marks checkouts as tests, and `CDP_API_BASE` points at a
  stand-in in tests.
- **Other onramps:** `USDC_ONRAMP_URL` is another provider's buy link, with `{wallet}` and `{amount}` filled in. With
  neither, the page tells buyers to buy USDC in an app and send it on Base to their address, and shows the address.

| Env | Default | |
|---|---|---|
| `USDC_PAYMENTS` | 1 | 0 turns USDC payments off |
| `USDC_RPC`, `USDC_TOKEN`, `USDC_CHAIN_ID` | Base mainnet, native USDC `0x8335…2913`, 8453 | |
| `USDC_QUOTE_MIN` | 30 | how long a USDC price holds |
| `RELAYER_KEY` | none | the gasless relayer's key (a fly secret); keep a few dollars of ETH on Base in it. `GET /api/admin/relayer` shows its address and gas |
| `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` | none | Coinbase Onramp card checkout (fly secrets) |
| `CARD_MIN_USD` | 2 | the smallest card purchase |
| `CDP_SANDBOX` | off | 1: card checkouts are marked as tests |
| `USDC_ONRAMP_URL` | none | another provider's buy link template |
| `FLYAI_USD_PRICE` | none | tests only: a fixed price |

Tests: `npm run test:orders` covers quotes, exact transfers, replays, the month's USDC totals and gasless payments
(a mock USDC with EIP-3009 in `contracts/test/MockUSDC.sol`, on anvil). Headless Chrome covered the card-buyer
flow: no USDC gives directions and the address; with USDC it's one free signature and no transaction from the
buyer; the Leaderboard shows the USDC part of the pool.

**Other kinds of work later:** specs carry `kind` (only `connectome-sweep` exists). A new kind needs three
things: its expansion in `orders.ts`, a runner the verifiers can re-run, and an engine in `web/`. It must stay
deterministic across GPUs, which is what makes answers checkable. For work that can't be bit-exact (float ML
inference, rendering), redundancy alone would have to judge answers, with a tolerance instead of a hash. That's
weaker, and a separate design.

## Buyers' programs

Buyers can run their own code, not only brain sweeps: a WebAssembly module (`kind: "wasm"`, CPU) or a WGSL compute
shader (`kind: "wgsl"`, GPU), over uploaded inputs or `count` jobs numbered 0..N-1. The buyer guide with examples,
limits and ideas is `web/compute-api.md`, downloadable at `/compute/compute-api.md`. Examples live in `examples/`
(Rust with the flyai imports, Rust WASI, both built and tested). `npm run test:programs` covers it all.

- **Code:**
  - `src/wasmcheck.ts`: the module inspector.
  - `web/openjob.ts`: the runner, flyai imports and a deterministic WASI subset, plus the shader runner.
  - `web/open.worker.ts`: one fresh worker per job.
  - `src/server.ts`: the "buyers' programs" section.
- **Miners:** lanes claim `kinds` (the website's CPU lanes `wasm`, the GPU lane `wgsl` and `wasm`) with
  `open_max` programs per claim. Clients that don't send `kinds` (old extensions) get only brain jobs. The
  Mine page has a switch, on by default. The extension never takes buyers' programs (`buyerPrograms: false`):
  the Chrome Web Store forbids running downloaded code, WebAssembly included.
- **Checking:** there's no server re-run and nobody is struck.
  - **Settles:** when `redundancy` wallets return the same output (for shaders, within an optional f32
    tolerance).
  - **Disputed:** after `redundancy + 2` answers with no agreement, every distinct output goes to the buyer.
  - **Non-matching answers:** earn nothing (status `expired`).
- **Pay:** the pool part of each charge goes straight to the settling wallets (the `earnings` table). The
  snapshot adds it on top of the points split. Program jobs earn no points, so buying trivial jobs for your
  own miners can't farm the operator's pool.
- **Order key:** returned once at creation. It lets code add jobs (`POST /api/orders/:id/jobs`) to a
  `keep_open` order and stop it.
- **Uploads:**
  - **Storage:** blobs sit in `BLOBS_DIR` (default next to the database, `/data/blobs` on Fly), at most
    `BLOB_MAX_MB` (8) each.
  - **Rate:** 600 uploads and 2 GB an hour per IP.
  - **Total:** capped at `STORE_MAX_MB` (2000 on Fly, alongside the database on the 10 GB volume), counted in whole 4 KB blocks as the disk stores them.
  - **Cleanup:** deleted after `BLOB_TTL_DAYS` (14) unused, unless an unpaid or live order needs them.
  - **Serving:** as sandboxed downloads.
- **Price:** the lowest bid is `MIN_BID` per started 30 s of the job's time limit.
- **Security:**
  - **The server never runs buyer code.** The inspector returns or refuses, and is fuzzed with 20,000
    broken modules. The server test sends 24 junk 6 MiB modules at once and checks it stays up.
  - **Miners:** they re-inspect every module themselves before running it. They cap memory at 256 MiB
    and output at 4 MiB, check downloads against their hashes, and kill the worker at the time limit.
  - **Tested in Chrome on the RTX 4060:** WASM, WGSL, a tampered download and a broken shader.
- **Also new:** a struck miner's pending paid brain jobs are re-run by the server at once. `SEED_PAID=0` stops
  idle verifiers working paid brain jobs (the order test uses it).

## Embeddings

`kind: "embed"`: a buyer uploads batches of texts (each input is a JSON array of 1 to 256 strings) and gets
back one float32 vector per text. The models are listed in `EMBED_MODELS` (`src/orders.ts`): `minilm-l6` and
`bge-small-en`, 384 numbers each, pinned to one Hugging Face revision and run in fp32. The buyer guide has an
*Embeddings* section, the Buy compute page has an *Embeddings* mode (upload a .txt/.json/.jsonl file), and the
`flyai-compute` skill takes `--embed file`.

- **Miners:** `web/embed.worker.ts` loads transformers.js 4.3.0 from jsDelivr and keeps the model loaded
  between jobs. It runs on WebGPU where there is a GPU and on the WASM CPU backend where there isn't. The GPU
  miner's program lane takes embed jobs, and so does a CPU miner's first thread (one model in memory). A model
  that won't load, or a job that overruns, gives the job back; an embed job has no error answer.
- **Checking:** two answers agree when every text's vectors are at least `compare.cosine` similar (default
  0.9999, `cosineAgree`). Measured on the RTX 4060, the lowest cosine between WebGPU and WASM vectors was
  0.9999995 (MiniLM and bge), so any honest hardware passes and made-up vectors don't. Inputs are validated
  when ordered, and the server checks each answer is exactly texts × 384 floats.
- **Speed:** 64 texts in 0.07–0.12 s on the 4060 (1.6–3.4 s on one CPU thread) once the model is cached; the
  first job downloads 90–133 MB.
- **Tested:** `npm run test:programs` (11 embed checks), and end to end in headless Chrome: a WebGPU miner and a
  CPU-only miner settled three batches (1, 4 and 64 texts) by agreement.

## Research results

`GET /api/experiments` summarizes every house order except `mining/*` (`src/experiments.ts`): the
motor group each sense drives most (tuning), colony survival (world), learning on vs off over the same seeds,
which conditions move the descending neurons and wings (encoding), and the demos (π, TSP, Mandelbrot). It's
recomputed in the background every 30 minutes from the settled results, reading a sample of the big orders
(400 world runs, 300 probes). `/compute/results` shows it, with each order's CSV. The verifier tells the
server the probe record-set sizes, since the main thread has no connectome.

## House orders: our own work

Work we queue for ourselves, created with the admin token. It needs no payment, charges nothing and adds nothing
to the pool. It runs after every paid order and before the free screen. Brain sweeps earn their usual points;
other house jobs earn `units` points per settled job, by default sized to the work, times `PROGRAM_BONUS` (1.01) so
that switching on "also run programs" pays a little more than leaving it off. The units carry the parity rate
themselves: until 2026-09-20 the multiplier was 1.25 and the units were set low to compensate, which read as a 25%
bonus in the UI and collided with the Operator stake tier's 1.25x. On a GPU miner these CPU jobs run in a lane of
their own beside the batch. Everything they upload or produce is kept for good (`blobs.keep`).

- **Kinds:**
  - **Any buyer kind:** `connectome-sweep`, `wasm`, `wgsl`.
  - **`world`** (house only): one seeded run of the world simulation (`world/src/sim.ts`) per job. Miners run
    it in a fresh worker (`web/worldjob.ts`); the output is a JSON summary. Identical in Chrome and Node for the
    same seed.
  - **`probe`** (house only): named stimulus conditions played into the integer brain (`src/probe.ts`) on the
    CPU lanes' loaded connectome. The output is u16 spike counts, bins × neurons, for the 1,314 descending
    neurons and 58 wing motor neurons. It matches the screen engine spike for spike. Senses match Flybook's
    words (threat, mate, wind, taste, touch, cva) plus `reward` (PAM).
- **Settling:** two agreeing miners settle a job; nobody is struck.
- **API:**
  - **Admin:** `POST /api/admin/house {label, spec, max_parallel?, hours?, units?}` creates an order;
    `POST /api/admin/house/:id/jobs {count|inputs}` adds jobs (programs); `POST /api/admin/house/:id/stop`
    stops one.
  - **Public:** `GET /api/house` lists house orders and progress.
- **Seeding:** `node scripts/seed-house.ts [--dry-run] [--only prefix]` (needs `ADMIN_TOKEN`) starts the first
  orders and skips labels that already exist:
  - **tuning/threat, tuning/target, tuning/touch:** wider brain sweeps.
  - **world/life, world/learning-on, world/learning-off:** paired seeds.
  - **encoding/words:** 7 conditions × 300 seeds.
  - **encoding/market:** 19 conditions × 150 seeds, graded drives, with and without reward.
  - **demo/*:** the example programs.
- **Pulling results:** `node scripts/pull-house.ts [--label prefix]` copies results into `mine/data/house/<label>/<id>/`
  (git-ignored), picking up where it stopped: `results.jsonl`, `outputs/`, and a probe `layout.json` giving
  each output column's neuron index, cell type and side.
- **Miners:** CPU lanes claim `world` and `probe` too; the GPU lane claims `world`. Clients that don't send
  `kinds` still get only brain jobs.
- **Tests:** `npm run test:house`.
- **Caveats:**
  - **Engine difference:** probes use the integer engine. Decoders fitted on this data describe it; the Python
    FlyBrain agrees statistically, not spike for spike.
  - **Cross-engine floats:** world runs are float JavaScript. Chrome and Node agree; other browsers may
    disagree, and those jobs just end up disputed.

## Example programs

`examples/` has prebuilt, tested programs to copy from:
- **Programs:** pi, a proof-of-work hash search, Mandelbrot tiles, a TSP search, a WASI word count and a GPU
  matrix multiply.
- **`run-local.ts`:** runs a module exactly as a miner would, twice.
- **`order.ts`:** create, pay, watch, add jobs and stop from the command line.

`examples/README.md` covers using them and making a new one. `npm run test:examples` checks every example
gives the right answer.

## The integer brain

Answers are checked by comparing a hash of every spike, so an honest miner must get *exactly* the
server's result. Floats can't promise that across GPU drivers (fused multiply-add, reordering, vendor
rounding). A spiking network turns one flipped threshold into a different spike train within a few
steps, so honest GPUs would disagree and get zeroed.

So jobs run in `src/fixed.ts`, the connectome in integers:

| | |
|---|---|
| voltage | Q16 (1.0 = 65536), spike at ≥ 65536, reset to 0 |
| synapse | Q20 weight; inputs summed with 32-bit wraparound, so summing order never matters |
| update | `v ← mulshift16(v, decay) + mulshift16(input, gain·4096) + tonic + drive + noise` |
| noise | `lowbias32(neuron, step key)` under a threshold, so every neuron draws independently |
| record | each spike adds a keyed hash of (neuron, step) into two 32-bit sums, which don't depend on order |

Every operation wraps at 32 bits exactly as WGSL does. The server ships the only numbers derived from
`Math.exp` (the weight table and decay) in `/api/model`, so every engine starts from the same integers.

**It is still the same brain.** `npm run validate` compares it with `world/src/connectome.ts` (float)
over 6 conditions × 4 seeds:

- **Population rates:** the same to within about 0.004 Hz (e.g. 2.260 vs 2.259 Hz at rest).
- **Sensory effects:** within a few percent. Left LPLC2 raises DNp01 L by +11.10 Hz (float) vs
  +11.15 Hz (integer). Touch raises the right leg kick by +8.17 Hz vs +8.21 Hz.
- **Motor-group rates:** correlated at 1.000 across 240 comparisons.

`world/` still runs the float engine. The two agree statistically, not spike for spike.

## GPU

`web/gpu.ts` runs the integer brain in WebGPU, up to 32 jobs per batch. Each step is two compute
passes, one invocation per neuron:

1. **Synapses:** sum incoming weights from neurons that fired, for every brain at once. `fired[j]` is
   a 32-bit mask with one bit per brain, so an input that is silent in every brain costs one read.
2. **Neurons:** update, spike and record for every brain.

A final pass totals each brain's record and counts, and only that is read back. The
GPU's results are checked by the server's CPU re-runs like anyone else's.

`/bench` in headless Chrome on one laptop with two GPUs:

- **Exactness:** 4 very different jobs gave identical hashes and spike counts on the CPU, on both GPUs,
  and at scattered positions in a batch of 32. NVIDIA and AMD agree bit for bit.

| jobs/hour | CPU, 1 thread | GPU, 1 job | GPU, batch 16 | GPU, batch 32 |
|---|---|---|---|---|
| RTX 4060 Laptop | 579 | 1,144 | 9,278 | **11,129** (19× a CPU thread) |
| Radeon 890M (integrated) | 514–583 | 216–355 | 2,121–2,929 | 3,263–3,881 (5.6–7.6×) |

Mining runs from the real page at batch 32:

- **RTX 4060:** 640 jobs in 5 minutes, at 124–162 jobs/min (likely thermal throttling). With the
  checking described below, the server's queue stayed at 0–4 the whole run. It checked 13 answers, all
  matched, and none were skipped. The earlier fixed 10% check rate left 12 waiting after 5 minutes.
- **Radeon 890M:** 65.7 jobs/min. The server re-ran 9, and all matched.

At 300,000 jobs in the database, claiming a batch of 32 takes 14 ms and a submit takes 8 ms. Four
verifier threads clear checks about 3–4× faster than one.

**Phones:** the Mine page runs there too (CPU threads, or WebGPU where the phone's browser has it with
100 MB buffers). A phone pauses a tab in the background or behind a locked screen, so the page keeps the
screen on while mining (Screen Wake Lock) and says so. Each CPU thread holds ~350 MB (measured peak in
Node: 335 MB), so phones get at most 2 threads, and GPU batches start at 8. Tested only in headless Chrome
at phone size (layout, limits, wake lock, jobs submitted), not on a real phone yet.

**Laptops with two GPUs:** Chrome on Windows starts on the integrated GPU and ignores WebGPU's
`powerPreference`. To mine on the discrete GPU, set Chrome to "High performance" in Windows Settings
→ System → Display → Graphics. For testing, launch Chrome with `--force_high_performance_gpu`.

## Mining for the project

Our own mining, so the network earns something without needing buyers: the coins go to the project's wallets, and
the miners running it still get their usual points. **Live since 18 September 2026.**

### What runs where

- **The bridges** live on their own Fly app, `flyai-bridge` (Treasure org, `cdg`, one shared-cpu-1x machine, no
  volume): [`mine/bridge/start.ts`](bridge/start.ts) keeps both pool bridges running, restarts either one with a
  backoff if it dies, and serves a status page at **https://flyai-bridge.fly.dev/**. Deploy with
  `bash mine/bridge/deploy.sh`; its pools, addresses and the admin token are Fly secrets.
- **CPU: yespower** ([`examples/yespower`](examples/yespower), [`examples/yespower-pool`](examples/yespower-pool)).
  A pure-Rust port of the reference implementation, matching all fourteen of its published vectors. Mining
  `yescrypt` at zpool, paid in BTC. **243 H/s per browser thread, about $0.02 per 8-thread machine-day.**
- **GPU: Kaspa** ([`examples/kaspa`](examples/kaspa)). kHeavyHash as a WebGPU shader, checked against
  rusty-kaspa's own vectors and against the reference implementation nonce for nonce on a real GPU. Mining at
  HeroMiners. **11.2 MH/s on an RTX 4060, about 2% of native** - a fraction of a cent a year, because the network
  is ASIC-dominated. It is here because it is the only GPU proof-of-work with a published specification *and*
  vectors, so the whole path is proven with a shader that can be swapped when a worthwhile coin appears.

### What a mining job pays

A mining job is priced at what the brain job it displaces would have paid for the same seconds of the miner's
machine, so switching the fleet to mining costs nobody points:

| Job | Work | Points | Rate | Brain jobs |
|---|---|---|---|---|
| `mining/yescrypt` | 20,000 nonces, about 82 s of one browser thread | 105 | 1.28 units/s | 1.27 units/s |
| `mining/kaspa` | 16.8 M nonces, about 1.5 s of a desktop GPU | 48.75 | 32.5 units/s | 32.3 units/s |

`YESPOWER_UNITS` and `KASPA_UNITS` set them (the Points column is what a miner is credited, so it includes
`PROGRAM_BONUS`; the env values are that divided by it — 103.96 and 48.267 at 1.01). Re-price them
whenever the job sizes change, or the toggle quietly starts paying less than the screen - which is exactly what a
miner told us in September, and how these numbers were arrived at.

Both run as keep-open house orders (`mining/yescrypt`, `mining/kaspa`) at redundancy 1. That costs nothing in
trust: the bridge re-hashes every hit before submitting, so a miner can hide a share but never invent one, and
nobody can redirect the reward because the header commits to the pool's coinbase.

### Wallets

`mine/.wallets/` (git-ignored, with a copy outside OneDrive) holds the seed phrases. Treat both as hot wallets:
their phrases have been through a chat transcript. Generate fresh ones before anything worth keeping accumulates.

| Coin | Address | Pool |
|---|---|---|
| Kaspa | `kaspa:qq798wcm...jjkm92unupn6n4` | `kaspa.herominers.com:1206` |
| Bitcoin | `bc1qqhaz05wl8ll8z50237rd845fjms3h0nce7vekr` | `yescrypt.mine.zpool.ca:6233`, paid in BTC |

### What the pools taught us

- **zpool states yescrypt difficulty the way Bitcoin does**, not cpuminer's `diff / 65536`. Submitting on the
  cpuminer convention earns "Invalid share". `--diff-divisor` exists for pools that differ; we run it at 1.
- **zpool's floor is around 0.02-0.25** even when the password asks for less (`d=0.0005`), so a single browser
  would take days per share. The fleet together is what makes it work.
- **Kryptex's Kaspa floor is 4096** - about 18 days per share for a browser GPU. HeroMiners' port 1206 gives
  difficulty 4, roughly 26 minutes per GPU, which is why we are there.
- **Kaspa runs at ten blocks a second**, so the pool pushes a new job every half-second. The matrix is built
  lazily for jobs we actually cut work from, and many shares will still land stale: that is the pipeline's
  latency, not the hashrate.

### Still open

- **No pool has accepted a share yet.** Jobs flow and every hit is verified locally, but the first accepted share
  is what confirms the target conventions end to end. Watch `fly logs -a flyai-bridge` for `share ... accepted`.
- **The GPU coin worth real money is Pearl**, whose proof-of-work is an integer matrix multiply. A hand-written
  WGSL kernel on a 4060 reached 9.7 TOPS - 6% of what the card's tensor cores do natively, since WebGPU cannot
  reach them - so about **$0.05 per machine-day**. Their miner is a vLLM plugin built on CUTLASS kernels, so a
  browser version is a from-scratch reimplementation that must match their hashing bit-exactly. Worth starting
  only at several hundred concurrent miners.
- **Everything else was measured and rejected:** Monero (~$0.004 per machine-day: RandomX needs a runtime JIT and
  a 2 GB dataset, so a browser pays 30x over native), Bitcoin (~$0, ASICs), Ergo, Chia, Gridcoin and the folding
  coins (either untradeable or impossible in a browser). Donated browser compute is worth cents a day per machine
  whatever it mines, and far more than that when a buyer pays for it.
- **Disclosure:** the Mine page and TOKEN.md should say what mining earns and where it goes before this is
  presented to miners as a reason to join. In-browser mining can get a site flagged as cryptojacking, which is
  why the switch stays opt-in.

## Fly Roulette bets

[Fly Roulette](../world/roulette.html) (www.flyaiworld.com/roulette/) plays free in the browser. Its "Play for
$FLYAI" panel bets on the same server, from the same balance and sign-in as compute orders. Code: `src/roulette.ts`
(endpoints, limits, settling), `src/roulette.worker.ts` (plays bet games), and the shared rules in
`world/src/roulette/game.ts` + `readout.ts` (the page, the server and the Verify replay all run these files).

- **The game is the server's.** A player gets a commit (sha256 of a secret server seed), then bets with its own
  client seed. All chance (brain seeds, names, first shooter, where the cap sits) comes from sfc32 seeded with
  sha256(server:client); every choice comes from a fly's float connectome (the same engine as the page). One worker
  thread plays all live games, one turn at a time in turn order (about 1 s of CPU a turn); the page polls the events.
  When the game ends the seed is revealed, and replaying from the seeds gives the same events (tested in Node, and in
  Chrome by the page's Verify button). A restart replays live games from their seeds and settles them once.
- **Odds.** Seats are interchangeable (independent brain seeds, uniform first shooter), so each wins 1/n
  (`world/tools/roulette-fair.ts` checks the rules over 20,000 games per table size). A win pays
  stake × n × (1 − `ROULETTE_EDGE`).
- **Money.** Schema 14 adds ledger kinds `bet` (tx `roulette:<game>`) and `payout` (tx `roulette-win:<game>`, or
  `roulette-refund:<game>` for a void game); the unique tx index rules out double payouts. `balanceOf` counts them.
  Deposits without an order: `POST /api/balance/deposit {tx}` credits a $FLYAI transfer from the signed-in wallet to
  `PAY_TO`. Withdrawals: players ask (`withdraw_requests`); the operator sends the tokens and records it with
  `POST /api/admin/withdraw`, which closes the request.
- **Not the miners' pool.** Bets touch no points, day credit, pool or charge rows. The house result is visible in
  `GET /api/admin/roulette` and stays with the dev wallet.
- **Settings** (`fly.toml` env, whole tokens): `ROULETTE_ON` (`1` to take bets; off by default),
  `ROULETTE_EDGE` (0.05), `ROULETTE_MIN_BET`, `ROULETTE_MAX_BET`, `ROULETTE_MAX_DAY` (per wallet per UTC day),
  `ROULETTE_MAX_PAYOUT` (biggest single win), `ROULETTE_HOUSE_STOP` (pause when the house is down this much over
  24 h), `ROULETTE_MAX_LIVE` (games played at once). Terms: `docs/roulette-terms.html`, version 1.
- **Operations.** The dev wallet must hold at least `balances_held` from `GET /api/admin/roulette`, which also shows
  the house's net (all time and 24 h), live games and open withdrawal requests.
- **Tests:** `npm run test:roulette` (anvil + test token: the schema 13 → 14 upgrade, deposits, terms, every limit,
  a game settled once with the revealed seed replayed, a restart mid-game, withdrawals, the house stop, the off
  switch).

## Browser extension

```sh
npm run build:extension   # → extension/dist; load it at chrome://extensions → Developer mode → Load unpacked
```

The popup uses the website's design:

- **Contribute switch:** off by default. Nothing runs until the user turns it on, and turning it off stops
  all work immediately.
- **Use:** GPU or CPU. The GPU option is disabled when WebGPU can't be used here.
- **Intensity:** GPU batch of 8, 16 or 32 jobs, or 1–4 CPU threads.
- **This machine:** what the popup's WebGPU sees, and separately what the background miner sees. It also
  shows the laptop dual-GPU hint.
- **Today:** jobs, checks, credited units and share, plus standing.
- **Settings:** wallet or name label, and the server. Servers other than `localhost:8787` and
  `*.flyaiworld.com` ask for permission first.

How it runs:

- **Background worker:** `extension/background.ts` is stateless. It opens an offscreen document while the
  switch is on and closes it when it's off. A service worker can't use WebGPU, and Chrome stops it when
  idle.
- **Offscreen document:** `extension/offscreen.ts` runs the same `web/mine-core.ts` miner as the website
  and reports its state to the popup through `chrome.storage.session`.
- **Bundled code:** Chrome extensions can't load code from a server, so `extension/build.ts` bundles the
  engine (type-stripped, `.ts` imports rewritten to `.js`) and draws the icons.
- **What it runs (0.2.0):** brain jobs, and with "Also run world sims and probes" on (the default) our own world
  runs and brain probes, whose code ships inside the extension. It never takes buyers' WebAssembly or shaders
  (the store counts downloaded WebAssembly as remote code) or embeddings (their model code comes from a CDN). The
  build writes a stub `embed.worker.js`, so the package has no remote code at all, and the manifest keeps
  Chrome's default content policy.

Tested in headless Chrome 152 on the RTX 4060, loaded through the DevTools pipe (`Extensions.loadUnpacked`):

- **Off:** off by default, with no offscreen document.
- **GPU check:** the popup and the background miner both saw the RTX.
- **On:** switching on mined on the GPU, 64 jobs at about 230 jobs/min, and the server received all of them.
- **CPU:** switching to CPU mid-run kept mining.
- **Off again:** switching off closed the offscreen document, and the server got no further jobs.

0.2.0, tested the same way on 18 September against a local server: on CPU with world sims on, it took and
settled all 3 jobs of a world order within 10 seconds while mining brain jobs, with no errors.

Loading from inside the OneDrive folder failed over DevTools ("File path cannot be resolved"). A copy
outside OneDrive loaded fine. The normal Load unpacked button wasn't tried.

**Before publishing:** the Chrome Web Store bans extensions that mine cryptocurrency. This one computes
brain simulations, not coins, but it pays in a token. The listing should describe it as research
compute ("mining" appears nowhere in the extension), and review may still ask about the rewards. The
default server is the deployed one, `https://flyai-mine.fly.dev`.

## Website (Vercel)

The pages live on the main site at **www.flyaiworld.com/compute/**: Mine, `/stake`, `/claim`,
`/leaderboard`, `/connect` and `/bench`. They use the site's `/assets/site.css`, nav and footer, plus
`web/compute.css` for the few pieces the site doesn't have.

- **Build:** `scripts/vercel-build.sh` runs `node mine/scripts/build-web.mjs .vercel-out/compute`. It
  strips types from `web/*.ts`, writes `config.js`, bundles the wallet kit and copies the pages. It needs
  Node 22.13+ on Vercel.
- **Wallet kit:** `mine/wallet/` is wagmi (`@wagmi/core`, WalletConnect) bundled by esbuild into
  `web/wallet/kit.js`, the only bundled code on the pages. Vercel installs it (`npm ci` in `vercel.json`).
  Pages load it only when a wallet is needed. `web/wallet/kit.d.ts` gives its types to the pages; keep it
  in step with `wallet/src/kit.ts`. For local pages, run `npm ci && npm run build` in `mine/wallet`.
- **Phones:** the build uses the site's Reown project id (`330e7582…`, public by design; `MINE_WC_PROJECT_ID`
  overrides it). Its domain list on dashboard.reown.com must include www.flyaiworld.com. The picker offers WalletConnect, which opens wallet apps on a phone or shows a
  QR code on a computer. On a phone with no wallet in the browser, the picker also links to "open this page
  in MetaMask / Trust / Coinbase Wallet". With an empty id, only browser wallets and those links are offered.
- **API:** the pages call the fly.io server (`MINE_API`, default `https://flyai-mine.fly.dev`).
- **Brain files:** the miner loads them from `/simulation/connectome` on the same site, not from Fly.
- **Sign-in:** the Fly server has `PUBLIC_ORIGIN = https://www.flyaiworld.com` (in `fly.toml`), so wallet
  sign-in messages and the extension's Connect link name the website.
- **Locally:** `npm start` serves the same layout at `http://localhost:8787/compute/`.

**Release order:** the API first (`bash mine/deploy.sh`, after `fly secrets set`), then push to GitHub so
Vercel rebuilds the site. The new pages need the new API. The API was deployed on 2026-09-16; the pages
go live on the next push.

## Deploy

Live at **https://flyai-mine.fly.dev**: app `flyai-mine` in the Treasure org (`treasure-403`), region
`cdg`.

- **Machine:** one shared-cpu-2x machine with 2 GB of memory.
- **Database:** SQLite on the encrypted 10 GB volume `mine_data` (1 GB at first; it filled on 09-19 and again at
  5 GB on 09-23, before finished screen jobs were pruned), mounted at `/data`, with daily snapshots
  kept for 5 days.
- **Scaling:** the database lives on the volume, so there is one machine and it never auto-stops.

```sh
bash mine/deploy.sh    # stages server + world engine files + connectome (~58 MB), builds remotely
```

First-time setup, including the IP allocation that failed automatically, is at the top of
`deploy.sh`. Settings live in `fly.toml`: `PUBLIC_ORIGIN`, `VERIFIERS = 2` and `CANARY_POOL = 500`.

**Last deploy: 2026-09-17** (schema 9: house orders). The deploys of 2026-09-16 and 17 added, in order:
1. **Schema 5:** wallet sign-in, points, stake tiers and claims.
2. **Schema 6:** paid orders.
3. **Schema 7:** result delivery (webhooks, streams).
4. **Schema 8:** buyers' programs and uploads.
5. **Schema 9:** house orders.

The database upgraded itself each time, keeping its jobs and miners. The secrets `ADMIN_TOKEN`,
`CLAIMS_CONTRACT`, `STAKING_CONTRACT` and `STAKE_TIERS` are set. `fly.toml` carries `PAY_TO` (the dev wallet),
`MIN_BID` 20, `CACHED_PRICE` 5, `POOL_SHARE` 0.8 and `STORE_MAX_MB` 2000. Uploads live in `/data/blobs` on the
volume.

`deploy.sh` is run by the operator. Claude Code's auto mode blocks production deploys, so a session asks
the operator to run it.

**Shared CPUs throttle checking.** Right after deploy, the server re-ran about 1.5 jobs a minute,
against about 16 on the development laptop. Fly's shared vCPUs are throttled under sustained load. That's
why the canary pool is capped at 500: filling a pool of 3,000 would keep both vCPUs pinned for over a
day and delay real checks. With a real fleet of miners, move to `performance-2x` (`fly scale vm
performance-2x`), which costs more but isn't throttled, then raise `CANARY_POOL`.

## Contracts on Robinhood Chain

Deployed 2026-09-16 and verified on Sourcify and on Etherscan (robin.etherscan.io, "Exact Match"):

| contract | address | settings |
|---|---|---|
| MonthlyClaims | `0x9C11Cfba5564Fb6e3f0258DDcB92Fd6BA6b4d77A` | owner `0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea` (dev wallet), claim window 90 days |
| FlyStaking | `0x5279dafA0858d4A5B2DCeb05E5b41f954CD692Cc` | no owner, cooldown 7 days |

Both use $FLYAI, `0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C`.

To re-verify on Etherscan (key in `.env.local`), from `mine/contracts`:
`forge verify-contract <address> <Contract> --verifier etherscan --verifier-url "https://api.etherscan.io/v2/api?chainid=4663" --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args $(cat verify/<Contract>.constructor-args.txt)`.

**Blockscout** doesn't show the source automatically, because its API is behind a Cloudflare check that
blocks `forge` and Sourcify's forwarding. To publish it there:

1. Open the contract on robinhoodchain.blockscout.com and choose **Verify & publish**.
2. Pick **Sourcify**, or **Solidity (Standard JSON input)** with compiler 0.8.28.
3. For the JSON option, upload `contracts/verify/<Contract>.standard-input.json` and paste
   `contracts/verify/<Contract>.constructor-args.txt` as the constructor arguments.

## Operations

All commands are for Git Bash from the repo root.

### Local values and secrets

`mine/.env.local` is git-ignored. It holds the chain, token, owner and deployer addresses, the contract
addresses, the server URL, `ADMIN_TOKEN` and `STAKE_TIERS`. Load it into a shell before running anything
below:

```bash
set -a; source mine/.env.local; set +a
```

The deployer wallet's key is in `mine/contracts/.deployer/`, also git-ignored. That wallet only pays gas
and has no control over the contracts. Both folders sit inside OneDrive, so they sync to the cloud; never
commit them or paste them anywhere.

The Fly app's secrets must match `.env.local`:

```bash
fly secrets set -a $FLY_APP ADMIN_TOKEN=$ADMIN_TOKEN CLAIMS_CONTRACT=$CLAIMS STAKING_CONTRACT=$STAKING STAKE_TIERS="$STAKE_TIERS"
fly secrets list -a $FLY_APP      # names only; values are never shown
```

### Update the server

```bash
cd mine && npx tsc -p tsconfig.json && npm run check && npm run test:auth && cd ..
bash mine/deploy.sh
fly logs -a $FLY_APP --no-tail | tail -20
curl -s $SERVER/api/stats
```

The database migrates itself on start. Changing a secret restarts the machine, with no deploy needed.

### Update the extension

The default server is set in `extension/settings.ts`.

```bash
cd mine && npm run build:extension && cd ..
```

Reload `mine/extension/dist` at `chrome://extensions`. For the Chrome Web Store, zip the *contents* of
`dist/` and bump `version` in `extension/manifest.json` first.

### Contracts

Contracts can't be updated. A fix means deploying new ones and pointing `CLAIMS_CONTRACT` and
`STAKING_CONTRACT` at them. Stakers have to withdraw from the old staking contract themselves, since it
has no owner.

```bash
cd mine/contracts && forge test
# dry run, then add --broadcast --verify --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/
TOKEN=$TOKEN OWNER=$OWNER CLAIM_WINDOW_DAYS=$CLAIM_WINDOW_DAYS COOLDOWN_DAYS=$COOLDOWN_DAYS \
  forge script script/Deploy.s.sol --rpc-url $RPC --private-key "$(cat .deployer/private-key.txt)"
```

After a real deploy, copy the addresses from `broadcast/Deploy.s.sol/4663/run-latest.json` into
`.env.local`, then set the Fly secrets again.

### Stake tiers

Tiers are whole $FLYAI tokens and live only on the server, so changing them needs no contract change.
**Change them on the 1st of a month.** A month's points are rated with the tiers in force when they're
added up, so a change mid-month re-rates days already mined. Announce changes ahead, since raising
`min` drops people below it.

```bash
# edit STAKE_TIERS in mine/.env.local, then:
set -a; source mine/.env.local; set +a
fly secrets set -a $FLY_APP STAKE_TIERS="$STAKE_TIERS"
curl -s $SERVER/api/stake-config
```

For reference, at $0.00005092 per $FLYAI (2026-09-16), 2,000,000 tokens ≈ $100 and 20,000,000 ≈ $1,000.
Re-check the price monthly on DexScreener (FLYAI/NVDA, Uniswap V4 on Robinhood Chain).

### Every month

1. **During the month (optional):** announce a pool, and miners see an estimate at their share. Run it
   again with a larger number to raise the pool. `"pool": null` withdraws it.

   ```bash
   curl -s -X POST $SERVER/api/admin/announce -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "content-type: application/json" -d '{"month":"2026-10","pool":"9800000"}'
   ```

2. **About 3 days after the month ends:** take the snapshot. This can happen only once per month, so
   check the pool figure first.

   ```bash
   curl -s $SERVER/api/month?month=2026-10           # points per wallet, sanity check
   curl -s -X POST $SERVER/api/admin/snapshot -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "content-type: application/json" -d '{"month":"2026-10","pool":"9800000"}'
   # note "month_id", "root" and "pool_wei"
   ```

3. **Fund and open the month from the owner wallet.** The owner must hold `pool_wei` of $FLYAI. It's
   final, so the month can't be topped up after this.
   - With MetaMask on the dev wallet: on the token, `approve(CLAIMS, pool_wei)`; then on `CLAIMS`,
     `openMonth(month_id, root, pool_wei)`. Use Blockscout's "Write contract" tab on each verified
     contract.
   - Or with `cast`, if the owner key is imported as `owner`:

     ```bash
     cast send $TOKEN "approve(address,uint256)" $CLAIMS <pool_wei> --rpc-url $RPC --account owner
     cast send $CLAIMS "openMonth(uint256,bytes32,uint128)" <month_id> <root> <pool_wei> --rpc-url $RPC --account owner
     ```

4. **Miners claim on `/claim`.** Check progress with
   `cast call $CLAIMS "months(uint256)(bytes32,uint128,uint128,uint64,bool)" <month_id> --rpc-url $RPC`,
   which returns the root, total, claimed amount, deadline and whether it's been swept.

5. **After the claim window** (`CLAIM_WINDOW_DAYS` after opening), return what nobody claimed:

   ```bash
   cast send $CLAIMS "sweep(uint256,address)" <month_id> $OWNER --rpc-url $RPC --account owner
   ```

6. **Log it:** add the month's pool, root and transaction hashes to `TOKEN.md`.

### Health checks

```bash
curl -s $SERVER/api/stats            # miners online, jobs, check queue (audit_queue should stay low)
curl -s $SERVER/api/month            # this month's leaderboard data
fly status -a $FLY_APP
fly scale vm performance-2x -a $FLY_APP    # if checks fall behind with many miners
```

## Wallets

Credit belongs to a miner, and a miner proves its wallet with Sign-In with Ethereum (`src/wallet.ts`).
Several miners, say a laptop, a desktop and the extension, can link the same wallet.

**One sign-in for every page (schema 10).** The pages sign in once (`web/account.ts`, the Sign in button
in the tabs): the wallet signs one EIP-4361 message from `POST /api/session/nonce`, and `POST /api/session`
returns a 30-day session token (`SESSION_DAYS`) that the browser keeps in localStorage. The server stores
only its hash. Pages send it as `x-flyai-session` to link miners (`POST /api/session/link`, with the miner's
token or the extension's link code), pay from the balance and stop orders, with no further signature.
Transactions (paying, staking, claiming) still go through the wallet, and the connected account must be
the signed-in one. The per-action signatures below still work for API clients and older pages.

1. **Nonce:** the page sends the wallet's address with the miner's token (`POST /api/auth/nonce`). The
   server writes an EIP-4361 message itself, with this server's domain, chain ID 4663 (Robinhood Chain),
   a single-use nonce and a 10-minute expiry, and keeps it. It never parses text a client wrote.
2. **Sign:** the wallet signs it with `personal_sign`. This is free and sends no transaction.
3. **Verify:** `POST /api/auth/verify` recovers the signer with secp256k1 and Keccak from the audited
   `@noble` libraries (the server's only runtime dependencies). If the signer matches, the wallet is
   linked. Signing again with another wallet moves the miner there.

**The extension** can't reach a browser wallet, because wallet extensions don't inject into other
extensions' pages. Its Connect button asks for a one-time link code (`POST /api/link`, 10 minutes, single
use) and opens `/connect#code` in a normal tab, where the code stands in for the miner's token.

Tested:

- **`npm run test:auth`, 33 checks:**
  - both flows link the wallet, and a session links both without a signature, then stops working on sign-out;
  - refused: wrong signer, text changed by one character, malformed signature, reused nonce, reused code,
    and missing token and code;
  - a schema-2 database (as deployed before wallets) upgrades in place and keeps its miners.
- **`npm run check`:** the EIP-55 spec checksums and the standard `hashMessage("hello world")` vector.
- **Headless Chrome with a stand-in wallet:**
  - the website's Connect button links;
  - the popup opens `/connect#code`, signing there links the extension's miner, and the popup then shows
    the wallet;
  - one sign-in on /stake carries to /jobs, /claim and Mine: an order is paid through wagmi and stopped, and
    a miner is linked, all with no second signature; signing out ends the session on the server;
  - at phone size with no wallet: no sideways scroll, and the picker offers WalletConnect (its modal opens)
    and the open-in-wallet-app links.

Not supported yet: smart-contract wallets (EIP-1271, e.g. Safe).

## Staking

`contracts/src/FlyStaking.sol` has no owner and no admin functions, so nobody but the staker can move
staked tokens.

- **Stake:** `stake` counts at once.
- **Unstake:** `requestUnstake` stops the amount counting immediately. `withdraw` works only after the
  cooldown (7 days by default), and `cancelUnstake` puts it back.

The server (`src/staking.ts`) samples `stakedOf` for wallets whose miners were active that day: every
`STAKE_SAMPLE_MIN` minutes, and right after a wallet links. Each day's points are multiplied by the tier
of that day's **lowest** sample. Stake added mid-day doesn't boost that day; it counts from the next day,
and the UIs say so. Stake can't leave between samples either, because unstaking stops counting at once and
locks the tokens for the cooldown.

**Tiers:** set with `STAKE_TIERS` (JSON, whole tokens). The code's placeholder defaults are Holder 0+ at 1×,
Operator 100k+ at 1.25× and Foundry 1M+ at 1.5×; **live since 2026-09-19 the thresholds are Operator 2M+ and
Foundry 20M+** (`STAKE_TIERS` on the server, not in `fly.toml`). If the lowest tier's `min` is above 0, unstaked
wallets earn no points, which makes staking a requirement to mine for payouts. Staking is **off**
until `STAKING_CONTRACT` is set; until then every wallet counts 1×. It is set in production, so staking is on.

**Where it shows:** `/stake` stakes and unstakes through the browser wallet, the website and extension
show the tier, and `GET /api/stake-config` feeds the page.

Two different numbers, and they can disagree on purpose: `/stake` reads `stakedOf` straight from the chain, so it
shows the tier the wallet's stake has **earned**; the mining page's Stake row comes from the server's samples, so it
shows what is **counting today**. New stake earns its tier at once and counts from 00:00 UTC, because a day uses the
lowest sample taken during it.

`stakeOf` used to report 0 staked whenever there was no sample for the current day — which is every wallet in the
minutes after 00:00 UTC, and any staker whose miner is not running, since only wallets seen mining that day get
sampled. Their stake looked like it had vanished (reported by a staker on 2026-09-20). It now falls back to the last
sample ever taken for that wallet and asks the chain again in the background, at most once a minute per wallet so a
polled page cannot spam the RPC. The mining page leads with the tier the stake has earned
(`2.1M FLYAI · Operator 1.25× from 00:00 UTC · today counts 1×`) instead of the tier counting today.

**Tests:**

- **`forge test`:** 8 staking tests, including a fuzz check that the contract always holds exactly what's
  staked plus what's waiting to be withdrawn.
- **`npm run test:claims`,** on anvil:
  - a stake made on-chain is read as a tier when the wallet links;
  - a staked day doubles that day's points, and the payout split follows.
- **Browser:** `/stake` did approve and stake, an unstake request, and staking it again against anvil,
  checked on-chain.

## Audit fixes

An audit found nothing critical or high. These findings were fixed:

- **Points gaming (medium):** staking just before the day's last sample boosted the whole day. The
  multiplier now uses the lowest sample of the day (tested on anvil).
- **Constructor checks (low):** both contracts reject a zero token address. `MonthlyClaims` requires a
  claim window of 7–730 days; a window of 0 would let the owner sweep before anyone could claim.
  `FlyStaking` requires a cooldown of 1–90 days; 0 removes the protection, and a huge value overflows
  and locks every stake. The deploy script uses SafeCast.
- **Renounce (low):** `renounceOwnership` on `MonthlyClaims` always reverts.
- **Month IDs (informational):** now bounded above at 299912.
- **Second unstake (informational):** `/stake` warns before a second unstake request restarts the
  cooldown.
- **Owner-set roots (informational):** `/claim` says the treasury posts each month's split.
- **EVM version:** pinned to `shanghai`, so the contracts don't depend on the ArbOS version supporting
  Cancun.

Left as is: tokens sent to `MonthlyClaims` by mistake can't be recovered. Adding a rescue function would
add complexity. `forge test` now runs 25 tests.

## Monthly claims

Nothing is funded while a month runs.

1. **Points:** miners earn points, which are credited units added up per wallet over the UTC month.
   Zeroed or unchecked days add nothing. `GET /api/month`, `/api/me` and both UIs show points and
   share, never token amounts.
2. **Snapshot, after the month ends (wait a few days so late checks land):** run
   `POST /api/admin/snapshot {month, pool}` with `Authorization: Bearer $ADMIN_TOKEN`. It splits `pool`
   tokens by points (exact to the wei, reproducible) and stores a Merkle root and one proof per wallet
   (`src/payouts.ts`). A month can only be snapshotted once, and never while it's still running.
3. **Fund, as owner:** on the token, `approve(claims, pool_wei)`; then on the claims contract,
   `openMonth(month_id, root, pool_wei)`. This funds exactly that month in the same transaction.
4. **Claim:** a wallet opens `/claim`, sees its months (`GET /api/claims?wallet=`, which includes
   ready-made calldata) and claims. The claim sends it the tokens, and the wallet pays the gas.
5. **Sweep:** after the claim window (90 days by default), `sweep(month, treasury)` returns anything
   unclaimed.

`contracts/src/MonthlyClaims.sol` uses OpenZeppelin's `MerkleProof`, `SafeERC20` and `Ownable2Step`. The owner can't change a month's root once
posted, or take its funds before the window ends. Claims can never exceed what was funded, and
fee-on-transfer tokens are refused. Deploy with `contracts/script/Deploy.s.sol`, then set
`CLAIMS_CONTRACT` and `ADMIN_TOKEN` (`fly secrets set`).

Tests:

- **`npm run test:payouts`:** 14 checks on the split and the tree. It also writes the fixture the Solidity
  tests claim with.
- **`cd contracts && forge test`:** 13 tests, using proofs made by the TypeScript code.
- **`npm run test:claims`,** 17 checks on anvil with a real server:
  - points per wallet, with a zeroed day excluded and unlinked miners counted separately;
  - the snapshot guards;
  - the owner funding the month on-chain;
  - a wallet claiming with the server's calldata;
  - double claims and someone else's claim refused.

`/claim` was also driven in headless Chrome against anvil. The page listed the funded month and
claimed it (the wallet received its amount on-chain), and after a refresh it read "claimed".

**Going live:**

1. Reviewed: audit findings applied.
2. Contracts deployed on 2026-09-16 (see *Contracts on Robinhood Chain*).
3. Fly secrets set.
4. Server deployed on 2026-09-16; the database is at schema 5.
5. `TOKEN.md` has a *Compute* section. Log each funded month there.

Still to do: announce and fund the first pool (planned at about $500, about 9.8M FLYAI).

## Why answers can be checked

How answers are checked, without the server re-running a fixed share of a fast GPU's work:

- **Canaries:** `CANARY_RATE` of every miner's jobs already have a server answer. They cost the server
  nothing and scale with the miner: faking 100 jobs at 15% meets a canary with probability 1 − 0.85¹⁰⁰,
  which is effectively certain.
- **Re-runs:** an answer is re-run with chance `AUDITS / (jobs today + AUDITS)`, on a pool of
  `VERIFIERS` threads (`src/verifier.ts`). Early answers of the day are usually checked and later ones
  rarely, never predictably. That's about `AUDITS × ln(jobs/AUDITS + 1)` re-runs a day, around 24
  for 10,000 jobs.
- **The canary pool:** every re-run answer joins it. Verifiers with nothing to check work open jobs
  themselves, so fast miners don't run out of canaries they haven't had yet. An idle 4-thread server
  added about 20 known answers a minute.
- **Same reply every time:** a miner can't tell which answers get checked, and every submit gets the same reply.
- **Wrong answers:** one wrong answer zeroes the miner's day. It also marks the miner, so their unchecked answers stop counting and those jobs go back out.
- **Hashes stay private:** they are never published, so answers can't be looked up.

## API

| | |
|---|---|
| `POST /api/register {label?}` | → `{miner, token}`. `label` is an optional name. 5 per IP per hour |
| `POST /api/auth/nonce {address, code?}` (Bearer, or `code`) | → `{nonce, message}`: the EIP-4361 message to sign |
| `POST /api/auth/verify {nonce, signature}` | → `{wallet, miner}` once the signer matches; links the wallet |
| `POST /api/session/nonce {address}` | → `{nonce, message}`: the sign-in message, no miner needed |
| `POST /api/session {nonce, signature}` | → `{session, wallet, expires_at}`: a 30-day session for the signer |
| `GET /api/session` (x-flyai-session) | → `{wallet, expires_at}`, or 401 |
| `POST /api/session/link {code?}` (x-flyai-session, and Bearer or `code`) | links the miner to the session's wallet, no signature |
| `POST /api/session/end` (x-flyai-session) | signs out: the session stops working |
| `POST /api/link` (Bearer) | → `{code, url, expires_at}`: a one-time `/compute/connect#code` for the extension |
| `GET /api/model` | engine constants: `w20` (base64 int32 × 256), `decay`, `noise_thresh`, `noise_amp`, `outputs` |
| `POST /api/claim {count?}` (Bearer) | → `{jobs: [{job, params, expires_at}]}` (count 1..32), or 204 when there's nothing to do |
| `POST /api/submit {job, result}` (Bearer) | → `{status: "received"}` |
| `POST /api/release {jobs?}` (Bearer) | gives claimed jobs back unrun: the listed ids, or every job the miner holds → `{released}`. Pages call it on stop, reload and unrunnable programs, so a reload doesn't leave `MAX_JOBS` filled until `JOB_TTL_MIN` |
| `GET /api/me` (Bearer) | today's jobs, checks, credited units, share, standing; wallet, stake tier, this month's points, share, rank, days left and pool estimate |
| `GET /api/month?month=YYYY-MM` | points per wallet, end date, days left, announced pool, snapshot |
| `GET /api/claims?wallet=` | the wallet's snapshotted months with proofs and ready-made calldata, plus chain info |
| `GET /api/stake-config` | staking contract, token, tiers and function selectors |
| `POST /api/admin/announce {month, pool}` (Bearer `ADMIN_TOKEN`) | set, raise or withdraw (`null`) a month's announced pool |
| `POST /api/admin/snapshot {month, pool}` (Bearer `ADMIN_TOKEN`) | split a finished month's pool; → `month_id`, `root`, `pool_wei` |
| `GET /api/epoch?day=YYYY-MM-DD` | per-miner credit for a UTC day: `ok` / `unchecked` / `zeroed`, and share |
| `GET /api/stats` | fleet counts |
| `GET /api/results` | screen results in Hz, averaged over seeds, no hashes |
| `GET /api/orders/config` | whether orders are open, pay-to, limits, prices, live bids (`market`), channels, outputs |
| `POST /api/orders/quote {spec, bid?}` | → jobs, how many are already settled, what the whole sweep costs at the bid |
| `POST /api/orders {wallet, spec, bid, budget, hours?, max_parallel?}` | → an unpaid order with `budget_wei` (budget + tag) to transfer |
| `POST /api/orders/:id/pay {tx}` | match the transfer and start the order (409 while it isn't mined) |
| `POST /api/orders/:id/intent {action: fund\|stop}` | → `{nonce, message}` for the order's wallet to sign |
| `POST /api/orders/:id/fund\|stop {nonce, signature}` | fund from the balance, or stop and return what's unspent; `{}` with the order wallet's `x-flyai-session` works too |
| `GET /api/orders/:id` | status, end reason, jobs taken on / out / settled / dropped, bid, budget, spent, returned |
| `GET /api/orders/:id/results?after=&limit=` | settled rows after a `seq`, in settle order (`format=csv` for all of them) |
| `GET /api/orders/:id/stream?after=` | server-sent events: `result` per settled row, `status` on changes |
| `GET /api/orders?wallet=` | the wallet's orders and balance |
| `GET /api/balance?wallet=` | balance and its ledger |
| `GET /api/admin/orders` (admin) | charged, pool and treasury per month; balances held; orders |
| `POST /api/admin/withdraw {wallet, amount, tx}` (admin) | record a balance sent back on-chain |
| `POST /api/balance/deposit {tx}` (x-flyai-session) | credit a $FLYAI transfer from the signed-in wallet to `PAY_TO` (once) |
| `POST /api/balance/withdraw-request {amount}` (x-flyai-session) | ask for balance back; one open request per wallet |
| `GET /api/roulette/config` | on/paused, edge, limits, multiplier per table size |
| `GET /api/roulette/me` (x-flyai-session) | balance, terms, today's stakes, live game, withdrawal request, last 20 bets |
| `POST /api/roulette/terms {over18: true, accept: true}` (x-flyai-session) | accept the betting terms |
| `POST /api/roulette/commit` (x-flyai-session) | → `{commit_id, hash}`: sha256 of a secret server seed, 15 minutes |
| `POST /api/roulette/games {commit_id, client_seed, flies, pick, stake}` (x-flyai-session) | bet and start a game → the game |
| `GET /api/roulette/games/:id?after=` | the game: table, stake, payout, events after a seq; `server_seed` once it's over |
| `GET /api/admin/roulette` (admin) | house net, balances held, live games, open withdrawal requests |

## Not in v1

- **Chrome Web Store listing.** The extension is loaded unpacked for now. It takes brain jobs only: WebAssembly
  needs `wasm-unsafe-eval` in its content policy, and it doesn't ship the world or probe runners yet.
- **Evolution, scoring and a results page.** House orders collect data; nothing scores it or shows it yet.
- **Refunds on-chain.** Buyers' unspent budgets are balances held in the dev wallet. Sending one back is manual:
  send the tokens, then call `POST /api/admin/withdraw`.
- **Program jobs in other browsers.** WASM agrees everywhere. World runs are float JavaScript: Chrome and Node
  agree, other engines may not, and those jobs end up disputed.
- **Automatic month funding.** Snapshots and funding are still the manual steps under *Every month*.
- **Intel and Apple GPUs, Firefox and Safari.** NVIDIA (Lovelace) and AMD (RDNA 3) in Chrome match
  the CPU exactly. The others should by design, but haven't been tried.
- **An idle server stays busy.** Verifiers keep working open jobs until `CANARY_POOL` answers are
  known, so the server's CPU is in use whenever miners aren't. Set `CANARY_POOL` lower to limit it.
- **Batches over 32.** The per-neuron fired mask is one u32. Two masks would allow 64.
- **Sybil limits beyond 5 registrations per IP per hour.** One person with many tokens can share out
  their own work. It still has to be real work, and each token gets checked on its own.
- **Durable audit queue.** Audits waiting at a restart are dropped; those answers stay unchecked.
