# Training on the fleet

2026-11-11. Status: **all three phases built and tested locally; not deployed, not pushed.**

## What got built (2026-11-11)

- **Core:** `src/train.ts`. It holds the deterministic noise (integer hashing, exact float sums), ES with mirrored
  pairs, centered ranks and Adam, the built-in MLP with local AdamW, the DiLoCo outer step (Nesterov), the data
  shard format, spec checks, the agreement rules and the brain fitness.
- **Server:** `src/server.ts`, schema 24, tables `runs` and `run_points`. A run drives one keep-open order and
  adds each generation or round as a batch of jobs. `stepRun` takes the step as soon as the step's last job settles
  (with the 15 s housekeeping tick as a backup). It saves the parameters as an upload and closes the order after the
  last step. New job kinds: `es` (fitness in a throwaway worker), `esb` (fly brain, on CPU threads with the
  connectome), `sgd` (train jobs) and `complete` (WebLLM text). APIs: `/api/runs`, `/api/runs/:id`,
  `/api/runs/:id/points`. Run specs go through the existing `/api/orders`, `/api/orders/quote` and
  `/api/admin/house`.
- **Miners:** `web/trainjob.ts`, `web/llm.worker.ts`, and edits to `open.worker.ts`, `miner.worker.ts` and
  `mine-core.ts`. CPU lanes take `es`/`esb`/`sgd`; a GPU miner's program lane takes `es`/`sgd`/`complete`. With
  "buyer programs" off, `es` and `sgd` drop out, because they may run a buyer's wasm.
- **Phase 2 change:** onnxruntime-web 1.31.1 no longer ships `training`, so there's no ONNX path. Phase 2 is the
  built-in MLP (JS, up to 1M params) plus a **WebAssembly train-step interface** for anyone's model (template
  `examples/train-logreg`).
- **Phase 3 spike (headless Chrome, Qwen2.5 0.5B, 8 prompts, 96 tokens):** the RTX 4060 gave 8/8 identical texts
  twice. The 4060 against the Radeon 890M gave 6/8; the other two split at 78% and 71% of the text. So the
  agreement rule is "`share` (0.75) of the texts match on the first `prefix` (0.9)". Speed: ~37 tok/s on the 4060,
  ~1.7 tok/s on the 890M, and a ~30–50 s model load from cache.
- **Making it easy:** Python client `mine/python` (stdlib only: `Fleet.evolve/train/complete`, `Run.watch/theta/layers`),
  `scripts/local-fleet.ts` (a free practice fleet: local server and simulated miners), templates
  `examples/es-cartpole` and `examples/train-logreg`, the page `/compute/runs` (Train tab, 6 languages: our runs,
  a live curve, start-from-template including a CSV upload), skill commands (`--fitness`, `--train-csv`,
  `--complete`, `run`/`curve`/`theta`), and the guide sections in `web/compute-api.md`.
- **Tests:** `npm run test:train` (38 checks: the math, a paid evolve run with a lying miner, house MLP / wasm-step /
  cart-pole / brain runs, completion agreement), and `python mine/python/tests/test_local.py` against the local fleet.
- **Not done:** deploying the server (schema 24 migrates on start; the API goes dark for 2–8 min as usual), pushing
  the site (the Train tab and page), publishing `flyai-compute` to PyPI, and our own first real runs on the live
  fleet.

## The idea

Microsoft filed a patent on 2026-11-05 ("Opportunistic Micro-training on Edge Devices Using Spare GPU Utilization").
It splits big training jobs into small tasks, runs them on idle consumer GPUs, and pays the owners in credits. Our
fleet already works that way. Microsoft has something we don't: it is its own buyer.

So we do two things:

1. **We are the first buyer.** The fleet trains and evolves what we need: fly brains, desk and game settings,
   datasets.
2. **Others can bring their own models** with a few lines of Python, through the same tools we use.

## What exists today

- **Open kinds** (`src/orders.ts`): `wasm` (CPU, exact agreement), `wgsl` (GPU, `f32_tolerance`) and `embed`
  (pinned models in `EMBED_MODELS`, cosine agreement). With `keep_open` and `POST /api/orders/:id/jobs`, a buyer's
  script can already add jobs round by round, so a careful buyer could hand-roll training today. Nobody will.
- **House kinds:** world, probe, fight, replay*. These are our own code, shipped with the miner, where only the
  parameters travel.
- **Integer brain** (`src/fixed.ts`): bit-exact on CPU, AMD and NVIDIA, so its answers can be checked exactly.
- **Buyer tools:** the `skills/flyai-compute` skill (`flyai.mjs`), the Buy compute page `/compute/jobs`, and
  `mine/examples/`.
- **Missing:** a server-side training loop (a generation that waits for the previous one), checkpoints, a training
  curve, a Python client and templates.

## Phase 1: `evolve` kind (evolution strategies)

This is the one to build first. It serves us without any outside buyer, it keeps exact agreement, and outsiders get
the same tool.

**How it works (OpenAI-style ES):**
- The order holds a parameter vector θ (a blob), σ, the learning rate, the population and the number of generations.
- A job = (generation, seed range). The miner rebuilds each noise vector ε from its seed, scores θ+σε and θ-σε,
  and returns **only the scores**: a few bytes, no weights.
- The server rebuilds the same ε from the seeds, steps θ, stores a checkpoint and releases the next generation.
- **Agreement:** scores must match exactly. That works for WASM and the integer brain. Float fitness functions
  (world sims) use a tolerance like `wgsl`.
- The fitness function is either a house runner (the brain, fight, replay or world) or the buyer's WASM module,
  `fitness(params, seed) -> f64`.

**Our own uses (we are the buyer):**
- Evolve the fly brain's gains and readouts for the sshfighter bot, Flyborne, Fly Race and Colosseum balance
  (fight runner).
- Desk and ghost rule settings over replays. This replaces grid sweeps; replayb seeds give luck-robust fitness.
  It follows the FLYBRAIN pure-model rule: evolving parameters is fine, hand-written rules are not.
- Every run's curve and final θ go into the open dataset (atlas-style tables), so the HF release grows with real
  results, not only screen seeds.

**Server work:** an `evolve` spec in `orders.ts`, a generation stepper in the housekeeping tick (like rounds), a
`checkpoints` table + blobs (packed by `pack.ts`), `GET /api/orders/:id/curve`, and a curve chart on the order page.
**Miner work:** an ES lane in `miner.worker.ts` that reuses the house runners and the wasm runner.
**Tests:** `test:evolve`. ES on a known function (sphere, rastrigin) must converge, a tampered score must be caught,
and a miner dropping mid-generation must not stall it (job TTL and re-release, as now).

## Phase 2: `train` kind (small neural nets, gradient steps)

This is for "put your model on the fleet to train". It is only for **small** models, because every miner downloads the
weights each round.

- The buyer uploads ONNX training artifacts (onnxruntime-web on-device training) and data shards.
- A job = K local steps from checkpoint θ_t on one shard, returning a weight delta (DiLoCo-style: few rounds, long
  local work). The server averages the deltas (outer step) and publishes θ_t+1.
- Agreement: deltas compared by cosine or tolerance, like `embed`.
- **Limits:** about 50 MB of weights at first (download per round, tab memory). No LLM pretraining; small
  classifiers, LoRA on tiny models and RL policies at most.
- **Spike first (1-2 days):** does onnxruntime-web training run on WebGPU or only WASM? How fast is it on the 4060
  and on a laptop iGPU? Do two machines' deltas agree closely enough? If WebGPU training isn't there, Phase 2 is
  CPU-only, slower and smaller.

## Phase 3: `complete` kind (batch text generation)

This is for synthetic training data and evals, not chat. Batch prompts go in, text comes out, and nobody waits on it.

- Pinned small models (1-3B, MLC WebLLM), a registry like `EMBED_MODELS`, greedy decoding.
- **Spike first:** two GPUs can split on greedy tokens because their float math differs. Measure how often outputs
  match on the 4060 vs the 890M. If they rarely match, agreement must be a token-overlap score, which is weaker.
- Our own use: generate and label data for flybook, Fly chat and research, instead of paying for API calls.

## Making it easy for others

1. **Python client** (`pip install flyai-compute`, next to the `flybrain` package): `fleet.evolve(fitness="f.wasm",
   theta0=x, sigma=0.02, generations=200)`, `fleet.train(onnx_dir, data)` and `fleet.complete(model, prompts)`. Quote
   first, pay with a link in the user's own wallet (same rules as the skill), then stream the curve and fetch
   checkpoints. This is where ML people are.
2. **Templates** in `mine/examples/`: `es-cartpole` (Rust -> WASM fitness), `es-fly-brain` (house runner),
   `onnx-mnist` (Phase 2) and `complete-labels` (Phase 3). Each runs locally with `run-local.ts` first.
3. **A "Train" mode on /compute/jobs:** pick a template, upload, quote, pay, then watch the live curve and download
   checkpoints.
4. **The skill learns `evolve` / `train` / `complete`**, so an agent can order training too (ties into the Virtuals
   ACP agent).
5. **Honest page notes:** miners can see job data (no private data), training is only for small models, and runs
   are slow when the fleet is small.

## Order of work

1. Phase 1 server + miner + `test:evolve`, then our own runs: fly brain for sshfighter, then a desk replay run.
2. Python client + `es-cartpole` template + Train mode on the page. Offer it free or cheap to a few outside ML
   people as the demand test.
3. Phase 2 and 3 spikes. Build them only if the spikes pass and step 2 found anyone who wants it.

## Risks

- **Demand:** the compute market has had 0 outside orders since September. Phase 1 is still worth it for our own
  use. Phases 2-3 are not, unless step 2 finds buyers.
- **Fleet size:** 66-84 miners, who come and go. ES copes (lost jobs are re-released); gradient rounds wait for the
  slowest shard.
- **Deploys:** every mine deploy takes the API dark for 2-8 min (see the outage notes). Warn the user and get an OK before each deploy.
