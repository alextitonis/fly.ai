---
name: flyai-compute
description: Run jobs on the fly.ai compute network and pay for them - fly connectome experiments, the user's own WebAssembly programs and WGSL GPU shaders, embeddings, batch text completion, and training runs (evolution strategies, small neural nets on their data), run by browser miners. Prices the job, creates the order, hands the user a pay link to pay in $FLYAI with their own wallet, then downloads the results. Use when the user says "run this on fly.ai compute", "submit a job to flyai", "order compute", "run a connectome sweep", "/flyai-compute", or wants to check, top up, stop or collect a fly.ai compute order.
---

# fly.ai compute 🪰

Browser miners run jobs for $FLYAI. There are two kinds of job:
- **Brain experiments** (`connectome-sweep`): drive a sense in the full 166,700-neuron fly connectome and record what the
  motor neurons do.
- **The user's own programs**: WebAssembly (CPU) or WGSL (GPU) programs, one job per input.
- **Embeddings**: text in, one vector per text out (`minilm-l6` or `bge-small-en`, 384 numbers each), run on miners'
  GPUs. Use them for search, clustering, deduplication or RAG. Each job is a batch of up to 256 texts.
- **Text completion**: prompts in, greedy text out from a small open model (`qwen2.5-0.5b`, `qwen2.5-1.5b`,
  `llama3.2-1b`) on miners' GPUs. Use it for labels, synthetic data and evals. It is not for chat: nobody waits on a job.
- **Training runs**: `evolve` (evolution strategies: the user's WebAssembly fitness, or the fly brain, scored by
  miners generation by generation) and `train` (a small MLP, or their own WebAssembly train step, on their data
  shards, DiLoCo style). The server takes the step between generations and keeps the parameters. Small models only:
  up to 100,000 evolved parameters, nets up to 1,000,000 weights.

A job is charged only when it settles, which means two miners returned the same answer (or `redundancy` of them did). 80% of every charge goes to the miners.

Everything goes through `scripts/flyai.mjs`, which sits next to this file. It needs Node 18+ and no installs. Its notes for the person
go to stderr, and a JSON line for you goes to stdout. The full API guide is
https://www.flyaiworld.com/compute/compute-api.md. Fetch it when you need a field this file doesn't cover.

## Rules

- **Money moves only with the user's OK.** Always quote first, show the cost, and wait for a clear yes before `create`.
  Creating an order is free and unpaid, but it holds the price for 60 minutes and says "pay me".
- **Never ask for, read, or type a private key or seed phrase.** The user pays in their own wallet through the pay link.
  If they want to pay from the terminal with their own tools (e.g. Foundry `cast`), they run that command themselves.
  Suggest the `! <command>` prefix so the output lands in the conversation.
- **Keep the `order-<id8>.json` file** that `create` writes. It holds the order key, the only way to add jobs or stop
  the order from the terminal, and the webhook secret. Neither is shown again. Tell the user where the file is, and
  don't paste its contents into chat.
- **Test programs before ordering.** A program that doesn't give the same bytes twice will never settle, and the
  buyer's budget sits there. In the fly.ai repo, run `node mine/examples/run-local.ts <program.wasm> --index 0`. It
  runs the job twice exactly as a miner would and checks that both runs agree.

## Steps

1. **Work out the job with the user.**
   - Brain experiment: write a `spec.json`. For example:
     ```json
     {"kind":"connectome-sweep","channels":["LPLC2","LC4","none"],"sides":["L","R"],"amounts":[0.2,0.4],"gains":[3],"tonics":[0.14],"seeds":5,"warm":250}
     ```
     Channels: `LPLC2` looming, `LC4` fast threat, `LPLC1` small object, `LC10a` target, `SNta` leg touch, `none` control.
     Every combination is one condition, run once per seed.
   - Their own program: a `.wasm` file (Rust `wasm32-unknown-unknown` or `wasm32-wasip1`, C via wasi-sdk, Zig,
     TinyGo, AssemblyScript) or a `.wgsl` compute shader. Jobs come from `--count N`, where job i gets i as a
     little-endian u32, or from `--inputs dir`, one job per file. The guide's "Writing a WebAssembly job" section
     shows the `flyai` imports and how to make outputs deterministic.
   - Embeddings: a text file, with one text per line (.txt), a JSON array (.json) or JSON lines (.jsonl). The
     script splits it into batches.
   - Examples to start from: https://github.com/alextitonis/fly.ai/tree/main/mine/examples (pi, hash-search,
     mandelbrot, tsp, wordcount, matmul-wgsl).

2. **Quote it:**
   ```bash
   node scripts/flyai.mjs quote --spec spec.json
   node scripts/flyai.mjs quote --program job.wasm --count 1000 [--timeout 60] [--redundancy 2]
   node scripts/flyai.mjs quote --program job.wgsl --count 64 --dispatch 256,1,1 --output-bytes 4096 [--tolerance 0.0001]
   node scripts/flyai.mjs quote --embed docs.txt [--model minilm-l6|bge-small-en] [--batch 128]
   node scripts/flyai.mjs quote --complete prompts.txt [--model qwen2.5-0.5b] [--batch 16] [--max-tokens 256]
   node scripts/flyai.mjs quote --fitness f.wasm --dim 5 [--generations 100] [--pairs 64] [--sigma 0.1] [--lr 0.05]
   node scripts/flyai.mjs quote --train-csv data.csv [--hidden 64] [--rounds 40]
   node scripts/flyai.mjs quote --spec run.json        # any evolve/train spec (see the guide's "Training runs")
   ```
   Show the user the number of jobs, the price per job and the most it can cost. Mention that jobs already done
   cost less. The lowest bid depends on `timeout_s` (it grows with every started 30 s), and `config` shows the
   current `min_bid` and market. A higher `--bid` gets picked by miners more often.

3. **Get a yes, then create it** with the wallet that will pay. It must be the user's own address; ask for it:
   ```bash
   node scripts/flyai.mjs create --wallet 0xTHEIRS --spec spec.json [--bid N] [--budget N] [--hours H] [--webhook https://...]
   ```
   `--budget` defaults to the full cost, and whatever isn't spent returns to the wallet's balance. Add `--keep-open`
   to a program order to keep feeding it jobs.

4. **Pay:** give the user the `pay_link` from the output: `https://www.flyaiworld.com/compute/jobs?pay=<id>`.
   They open it, sign in with the order's wallet and pay in $FLYAI on Robinhood Chain; a card button shows there too
   when card payments are switched on. The page starts the order itself.
   If they would rather send the $FLYAI transfer themselves, it must be **exactly `budget_wei`** (the last digits are
   the order's tag) from the order's wallet to `pay_to`, then:
   `node scripts/flyai.mjs pay --order ID --tx 0x...`. Paying in USDC on Base from code is in the guide's
   "Paying in USDC on Base" section (`pay --order ID --tx 0x... --chain base` after the transfer).

5. **Follow it and collect the results:**
   ```bash
   node scripts/flyai.mjs status --order ID
   node scripts/flyai.mjs watch --order ID [--out results/]     # waits until done; --once takes what's there now
   ```
   For embeddings, `N.out` holds batch N's vectors as float32, one row of 384 per text, in the order of the file's
   texts (batch N holds texts N×batch to N×batch+batch-1). In Python that's `numpy.fromfile(path, "<f4").reshape(-1, 384)`.
   The vectors are normalized, so a dot product is the cosine similarity.
   For programs, `N.out` is job N's output bytes, and `N.json` is its row: who checked it, any `error` (e.g.
   `"timeout"`), and `answers` when miners disagreed (`disputed`). Brain sweeps have no `.out` file. Their `N.json`
   holds the condition plus `base` and `stim`, the spike counts for each motor group before and during the
   stimulus. The guide's "A result row" section turns those into Hz. Read it before interpreting results for the
   user.
   If you want results pushed instead, suggest `--webhook`. The guide shows how to check its signature.

6. **Later:** `add --order ID --count N` (keep-open orders) and `stop --order ID`. Both read the key from the
   `order-*.json` file in the current folder, or take `--key`.

7. **Training runs** print `run` and `run_link` when created. Follow them with:
   ```bash
   node scripts/flyai.mjs run --run RUN_ID                  # status, step, the last point
   node scripts/flyai.mjs curve --run RUN_ID --out curve.csv
   node scripts/flyai.mjs theta --run RUN_ID [--best]       # the parameters: float64 (evolve) or float32 (train)
   ```
   For an evolve run, `center` is the score of the current parameters, the number to watch. For a train run, watch
   `eval_acc`, or `train_loss` when there's no eval shard. A fitness module gets `u32 episode, u32 dim, f64 params`
   and outputs one f64 score. It must be deterministic, so no host `Math.sin`; the template is
   `mine/examples/es-cartpole`. To try a run free before paying, `node scripts/local-fleet.ts` in the fly.ai repo's
   `mine/` starts a local server with practice miners (`FLYAI_SERVER=http://localhost:8790`). Orders there need the
   admin token `local` (the Python client's `Fleet(admin_token="local")`).
   Completion results: each `N.out` is JSON `{"texts": [...]}`. Two miners agree when 3 in 4 of their texts match on
   their first 90%, which is weaker than exact. Tell the user that.

## Good to know

- Miners are browsers: a WASM job gets 1 thread and up to `timeout_s` (1–600 s), with no network or files. A WGSL job
  gets one dispatch and an output of up to 4 MiB. Big models, CUDA and long-running services don't fit. Suggest
  splitting the work into many small, deterministic jobs.
- `redundancy` 1 trusts the first miner. It's cheaper and faster, but unchecked. The default of 2 needs two wallets
  to agree. For WGSL, `--tolerance` compares floats within a margin, since different GPUs round differently.
- Order statuses: `unpaid` → `live` → `done`, or `ended` (budget, time limit or stopped), or `expired` (never paid).
- The API is https://flyai-mine.fly.dev. Set `FLYAI_SERVER` to use another server (e.g. a local test server).
