# fly.ai compute API: running experiments from code

Run experiments on the full fly connectome (166,700 neurons, 25 million synapses), your own WebAssembly
programs and GPU shaders, or text embeddings, on the fly.ai compute network from your own code.
You pay in $FLYAI per finished run. Results reach you as miners settle them: pull them in pages, keep
a live stream open, or have them POSTed to your server.

- **API:** `https://flyai-mine.fly.dev`
- **Chain:** Robinhood Chain, chain id `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`
- **Token:** $FLYAI `0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C`, 18 decimals
- **Web page:** https://www.flyaiworld.com/compute/jobs
- **Example programs** (source, prebuilt `.wasm`, order and run scripts): https://github.com/alextitonis/fly.ai/tree/main/mine/examples

All requests and responses are JSON. Amounts are whole tokens as strings (`"20"`, `"1.5"`), or wei as
strings where the field name ends in `_wei`. No API key is needed: an order belongs to the wallet that pays
for it.

## How an order works

1. **Price it (optional):** `POST /api/orders/quote`.
2. **Create it:** `POST /api/orders`, with your wallet, the experiment, a price per run (`bid`) and a
   `budget`. Optionally add a `webhook`.
3. **Pay:** send one $FLYAI transfer of exactly `budget_wei` from that wallet to `pay_to`, then
   `POST /api/orders/:id/pay` with the transaction hash.
4. **Collect results** as they settle: pull, stream or webhook.
5. **The order ends** when every run is done, the budget is spent, the time limit passes, or you stop it.
   What it didn't spend goes to your wallet's balance, which can pay for your next order.

A run is charged at your bid only when its answer is settled. That means two different miners returned
exactly the same answer, or the server ran it itself. Runs the network has already done cost the cached
price and settle at once. Miners pick orders at random, weighted by bid, so a higher bid is picked more
often.

`GET /api/orders/config` returns the current values: `min_bid`, `cached_price`, `pool_share`,
`max_jobs`, `max_parallel`, `max_hours`, `pay_to`, `token`, the live `market`, the `channels`, and the
names of the motor `outputs`.

## The experiment (`spec`)

Every combination of the lists is one condition, and each condition is run once per seed.

```json
{
  "kind": "connectome-sweep",
  "channels": ["LPLC2", "LC4", "none"],
  "sides": ["L", "R"],
  "amounts": [0.1, 0.2, 0.4, 0.8],
  "gains": [3],
  "tonics": [0.14],
  "seeds": 10,
  "warm": 250
}
```

| field | meaning | range |
|---|---|---|
| `kind` | the experiment type; only `connectome-sweep` exists so far | |
| `channels` | senses to drive; `none` is an undriven control, run once per gain, tonic and seed | see below |
| `sides` | which side's neurons are driven | `L`, `R` |
| `amounts` | stimulus strength: voltage added to the channel's neurons every step while the stimulus is on | 0.0001–2 |
| `gains` | scale on every synapse | 0.5–8 |
| `tonics` | steady background drive to every neuron | 0–0.5 |
| `seeds` | a count `n` (seeds 1..n) or a list of seeds; each seed is new noise | 1–1000 |
| `warm` | rest steps before the stimulus starts, out of 750 (1 step = 20 ms) | 0–749 |

| channel | what it senses |
|---|---|
| `LPLC2` | looming: something big approaching |
| `LC4` | fast looming, a threat |
| `LPLC1` | a small object approaching |
| `LC10a` | a target up close (courtship chasing) |
| `SNta` | leg touch (tarsal contact) |
| `none` | nothing: a control |

The runs go in seed order: all conditions for the first seed, then the next seed. An order stopped early
by its budget or time limit still has whole seeds.

## Order terms

| field | | |
|---|---|---|
| `wallet` | required | the address that pays and owns the order |
| `spec` | required | the experiment above |
| `bid` | default `min_bid` | $FLYAI per settled run |
| `budget` | required | the most the order can spend; the quote's `full_cost` runs the whole experiment |
| `hours` | optional | stop after this long (0.25 up to `max_hours`) |
| `max_parallel` | default `max_parallel` | how many of your runs miners hold at once |
| `webhook` | optional | https URL to POST results to |

## Quick start with curl

```sh
API=https://flyai-mine.fly.dev
SPEC='{"kind":"connectome-sweep","channels":["LPLC2","none"],"sides":["L","R"],"amounts":[0.2,0.4],"gains":[3],"tonics":[0.14],"seeds":3,"warm":250}'

# price it
curl -s -X POST $API/api/orders/quote -H 'content-type: application/json' -d "{\"spec\":$SPEC,\"bid\":\"20\"}"
# → {"jobs":15,"cached":3,"fresh":12,"bid":"20","full_cost":"255",...}

# create it
curl -s -X POST $API/api/orders -H 'content-type: application/json' \
  -d "{\"wallet\":\"0xYourWallet\",\"spec\":$SPEC,\"bid\":\"20\",\"budget\":\"255\",\"webhook\":\"https://example.com/flyai\"}"
# → {"id":"…","status":"unpaid","budget_wei":"255000000000000412345","pay_to":"0x…","webhook_secret":"…",...}
```

**Keep `webhook_secret`.** It's shown only in this response.

An unpaid order holds its amount for `ttl_min` minutes (60). A payment that arrives late still starts it.

## Paying from code (viem)

```ts
import { createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const API = "https://flyai-mine.fly.dev";
const robinhood = defineChain({
  id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: robinhood, transport: http() });

const post = async (path: string, body: unknown) => {
  const res = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error), { status: res.status });
  return json;
};

const order = await post("/api/orders", { wallet: account.address, spec, bid: "20", budget: "255" });

// exactly budget_wei: its last digits identify the order
const tx = await wallet.writeContract({
  address: order.token, abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
  functionName: "transfer", args: [order.pay_to, BigInt(order.budget_wei)],
});

// 409 means the server's RPC hasn't seen the block yet: try again
for (;;) {
  try {
    await post(`/api/orders/${order.id}/pay`, { tx });
    break;
  } catch (err: any) {
    if (err.status !== 409 && err.status !== 502) throw err;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
```

Payment errors:
- **402:** the transaction doesn't send exactly `budget_wei` from the order's wallet to `pay_to`.
- **409:** the transaction isn't mined yet, or it already paid another order.

## Paying in USDC on Base

For buyers who start from a card: buy USDC on Base (any app or exchange), then pay the order with it. The
order still runs in $FLYAI: the USDC is credited at the live $FLYAI price.

```ts
const q = await post(`/api/orders/${id}/usdc`, {});   // {usdc, units, expires_at, pay_to, token, gasless}
// a) gasless (when q.gasless is set): sign, and the server sends the transfer and pays the gas
const validBefore = Math.floor(q.expires_at / 1000);
const nonce = `0x${crypto.randomBytes(32).toString("hex")}`;
const signature = await wallet.signTypedData({
  domain: q.gasless.domain,
  types: { TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  primaryType: "TransferWithAuthorization",
  message: { from: wallet.account.address, to: q.pay_to, value: BigInt(q.units), validAfter: 0n, validBefore: BigInt(validBefore), nonce },
});
await post(`/api/orders/${id}/usdc/authorize`, { from: wallet.account.address, value: q.units, valid_after: 0, valid_before: validBefore, nonce, signature });
// b) or send exactly q.units of USDC (6 decimals) to q.pay_to on Base yourself, then:
await post(`/api/orders/${id}/pay`, { tx, chain: "base" });
```

The price holds until `expires_at`. Paid later, the price at that moment is used. `GET /api/price` shows the
current $FLYAI price in USD.

## Paying from your balance, or stopping an order

Both take a free signature from the order's wallet over a message the server writes. (Signed in on the
website, the pages send the wallet's session header instead, so there's nothing to sign.)

```ts
const { nonce, message } = await post(`/api/orders/${id}/intent`, { action: "fund" }); // or "stop"
const signature = await wallet.signMessage({ message });
await post(`/api/orders/${id}/fund`, { nonce, signature });                             // or /stop
```

`GET /api/balance?wallet=0x…` shows the balance and its history. `GET /api/orders?wallet=0x…` lists the
wallet's orders along with its balance.

## Getting results

Every settled row has a `seq`, and a later row always has a higher one. Keep the last `seq` you processed
and you'll never miss a row or see one twice, whichever way you collect them.

### A result row

```json
{
  "seq": 1042,
  "channel": "LPLC2", "side": "L", "amount": 0.4, "gain": 3, "tonic": 0.14, "seed": 2, "steps": 750, "warm": 250,
  "checked_by": "miners",
  "spikes": 5123456,
  "base": [12, 0, 3, "…one count per motor group"],
  "stim": [40, 2, 9, "…"]
}
```

- **`base`** counts each motor group's spikes before the stimulus (steps 0 to `warm`), and **`stim`**
  counts them during it (`warm` to `steps`). The groups are named in `outputs`, in the same order.
- **`checked_by`** is `server` (the server ran it) or `miners` (two independent miners agreed exactly).
- **Rates in Hz:** `base[g] / output_sizes[g] / (warm * dt)`, and
  `stim[g] / output_sizes[g] / ((steps - warm) * dt)`. `dt` (0.02 s) and `output_sizes` come with every
  results response.

### 1. Pull

`GET /api/orders/:id/results?after=<seq>&limit=<1..5000>` returns
`{status, settled, jobs, next, more, outputs, output_sizes, dt, rows}`. Ask again with `after=next`.
Once `status` is `done` or `ended` and `more` is false, you have everything.

```python
import time, requests

API = "https://flyai-mine.fly.dev"
after = 0
while True:
    page = requests.get(f"{API}/api/orders/{ORDER}/results", params={"after": after, "limit": 5000}).json()
    for row in page["rows"]:
        handle(row, page["outputs"])
    after = page["next"]
    if page["status"] in ("done", "ended") and not page["more"]:
        break
    if not page["more"]:
        time.sleep(15)
```

`?format=csv` downloads every settled row as one CSV.

### 2. Stream (server-sent events)

`GET /api/orders/:id/stream?after=<seq>` stays open. It sends:
- **`result`:** one row per event, as each run settles. The event `id` is the row's `seq`.
- **`status`:** sent when the order's status changes, e.g. `{"status":"done","end_reason":"sweep",...}`.

Browsers reconnect by themselves and resume from the last `id`.

```js
const es = new EventSource(`https://flyai-mine.fly.dev/api/orders/${ORDER}/stream`);
es.addEventListener("result", (e) => handle(JSON.parse(e.data)));
es.addEventListener("status", (e) => {
  const s = JSON.parse(e.data);
  if (s.status === "done" || s.status === "ended") es.close();
});
```

```python
import json, requests

with requests.get(f"{API}/api/orders/{ORDER}/stream", params={"after": after}, stream=True, timeout=90) as r:
    event = None
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: ") and event == "result":
            row = json.loads(line[6:]); handle(row); after = row["seq"]
        elif line.startswith("data: ") and event == "status":
            if json.loads(line[6:])["status"] in ("done", "ended"):
                break
```

The server sends a `: ping` comment every 25 seconds. If the connection drops, reconnect with
`after=<last seq>`.

### 3. Webhook

Give `webhook` when you create the order. The server POSTs JSON to it in the same shape as a pull page,
with up to 500 rows each, plus `"final": true` on the last call once the order has ended. Calls start
within seconds of rows settling.

- **Success:** answer with any 2xx within 10 seconds.
- **Failures:** anything else is retried after 10 s, then with a doubling delay up to an hour, about
  60 tries (roughly two days). Rows wait meanwhile and are never skipped, and the results stay pullable.
- **Status:** `GET /api/orders/:id` shows `webhook.delivered_seq`, `failures` and the last `error`.
- **Where it can point:** only https URLs that resolve to public addresses. Redirects aren't followed.

Every call is signed. The `X-Flyai-Signature` header is `t=<unix ms>,v1=<hex>`, where
`hex = HMAC-SHA256(webhook_secret, "<t>.<raw body>")`. Check it against the raw body, and reject old
timestamps. A row can arrive twice if your server handled a call but didn't answer in time, so de-duplicate by `seq`.

```js
// Node (express)
import crypto from "node:crypto";
import express from "express";

const app = express();
app.post("/flyai", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("x-flyai-signature") ?? "";
  const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header) ?? [];
  const want = crypto.createHmac("sha256", process.env.FLYAI_WEBHOOK_SECRET).update(`${t}.${req.body}`).digest();
  if (!t || Math.abs(Date.now() - Number(t)) > 5 * 60_000 || !crypto.timingSafeEqual(want, Buffer.from(v1, "hex"))) {
    return res.sendStatus(401);
  }
  const page = JSON.parse(req.body);
  for (const row of page.rows) handle(row, page.outputs); // de-duplicate by row.seq
  if (page.final) console.log("order finished:", page.status);
  res.sendStatus(204);
});
app.listen(3000);
```

```python
# Python (Flask)
import hashlib, hmac, json, os, re, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["FLYAI_WEBHOOK_SECRET"].encode()

@app.post("/flyai")
def flyai():
    m = re.fullmatch(r"t=(\d+),v1=([0-9a-f]{64})", request.headers.get("X-Flyai-Signature", ""))
    body = request.get_data()
    if not m or abs(time.time() * 1000 - int(m[1])) > 300_000:
        abort(401)
    want = hmac.new(SECRET, m[1].encode() + b"." + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want, m[2]):
        abort(401)
    page = json.loads(body)
    for row in page["rows"]:
        handle(row, page["outputs"])  # de-duplicate by row["seq"]
    return "", 204
```

## Embeddings: text in, vectors out

Send texts and get back one vector per text, for search, clustering, deduplication or RAG. Miners run the model
on their GPUs with WebGPU, or on the CPU when they have no GPU. You pay per batch, only for batches that settle.

| model | vectors | about |
|---|---|---|
| `minilm-l6` | 384 | all-MiniLM-L6-v2: fast general-purpose English sentence embeddings (reads 256 tokens) |
| `bge-small-en` | 384 | bge-small-en-v1.5: stronger English retrieval embeddings (reads 512 tokens) |

Every miner loads the same weights: each model is pinned to one Hugging Face revision and runs in fp32. The
vectors are normalized to length 1, so a dot product is the cosine similarity. `GET /api/orders/config` lists the models
under `embed`.

```sh
# one job = one upload: a JSON array of 1 to 256 texts (each up to 8,000 characters)
H1=$(curl -s -X POST $API/api/blobs --data-binary '["the fly smells vinegar", "a shadow looms overhead"]' | jq -r .hash)
H2=$(curl -s -X POST $API/api/blobs --data-binary '["wind on the antennae"]' | jq -r .hash)

curl -s -X POST $API/api/orders/quote -H 'content-type: application/json' \
  -d "{\"spec\":{\"kind\":\"embed\",\"model\":\"minilm-l6\",\"inputs\":[\"$H1\",\"$H2\"]}}"
# create it the same way (wallet, spec, bid, budget), then pay budget_wei as with any order
```

| field | | |
|---|---|---|
| `kind` | `"embed"` | |
| `model` | one of the models above | |
| `inputs` | uploads, each a JSON array of 1 to 256 texts | checked when you order: a batch that isn't valid is refused up front |
| `redundancy` | 1 to 5, default 2 | how many different wallets must return matching vectors |
| `compare` | default `{"cosine": 0.9999}`, from 0.9 to 1 | two answers match when every text's two vectors are at least this cosine-similar |
| `timeout_s` | 5 to 600, default 60 | prices the job like any program: `min_bid` for each started 30 seconds |
| `keep_open` | default false | add batches later with `POST /api/orders/:id/jobs {inputs}` |

**Results:** each settled row's `output` is the batch's vectors in the order of its texts: float32 little-endian,
`texts × 384` numbers. In Python: `numpy.frombuffer(data, "<f4").reshape(-1, 384)`.

**Why 0.9999:** measured on an RTX 4060, the lowest cosine between the GPU (WebGPU) and the CPU (WASM) vectors for
the same text was 0.9999995. Honest machines clear the bar easily, and a vector that wasn't computed from the text
doesn't. There's no error answer: a miner that can't run the model gives the job back for someone else.

**Anyone who takes a job can read its texts**, so don't send secrets.

## Text completion: prompts in, text out

Batch text generation with small open models, for synthetic data, labels and evals. Nobody waits on these, so it
fits a fleet of browsers. Miners run the model with MLC WebLLM on WebGPU, greedily (temperature 0). Only miners
with a GPU take these jobs.

| model | about |
|---|---|
| `qwen2.5-0.5b` | Qwen2.5 0.5B Instruct: small and fast, labels and short answers |
| `qwen2.5-1.5b` | Qwen2.5 1.5B Instruct: better writing, still laptop-sized |
| `llama3.2-1b` | Llama 3.2 1B Instruct: general short completions |

```sh
# one job = one upload: a JSON array of 1 to 32 prompts, each a string or {"system": "...", "prompt": "..."}
H=$(curl -s -X POST $API/api/blobs --data-binary '["Name three flies.", {"system": "One word.", "prompt": "Sky colour?"}]' | jq -r .hash)
curl -s -X POST $API/api/orders/quote -H 'content-type: application/json' \
  -d "{\"spec\":{\"kind\":\"complete\",\"model\":\"qwen2.5-0.5b\",\"inputs\":[\"$H\"],\"max_tokens\":128}}"
```

| field | | |
|---|---|---|
| `kind` | `"complete"` | |
| `model` | one of the models above | |
| `inputs` | uploads, each a JSON array of 1 to 32 prompts (8,000 characters each) | checked when you order |
| `max_tokens` | 1 to 1024, default 256 | per prompt |
| `compare` | default `{"prefix": 0.9, "share": 0.75}` | see below |
| `redundancy` | 1 to 5, default 2 | |
| `timeout_s` | 10 to 600, default 180 | the first job on a miner also loads the model (~1 GB, cached after) |

**Results:** each settled row's `output` is JSON, `{"texts": [...]}`, one text per prompt in order.

**How answers are checked, and how far to trust it:** the same GPU writes the same text every time. Different GPUs
round floats differently, and a text can take another word late on. We measured Qwen2.5 0.5B on 8 prompts: an RTX 4060
gave 8 of 8 identical texts twice, and the 4060 against a Radeon 890M gave 6 of 8. The other two split at 78% and 71%
of the way through. So two answers agree when at least `share` of their texts match on their first `prefix` of characters.
That's weaker than exact agreement: a dishonest miner could change a quarter of a batch's texts and still match.
Raise `share` to 1 (and `redundancy` to 3) if every text must be checked. Speed varies a lot, from about 37 tokens a
second on the 4060 to about 2 on a laptop's integrated GPU.

## Training runs: evolve and train

A **run** trains something over many steps. Each step (a *generation* or a *round*) is a batch of ordinary jobs that
two miners must agree on. Between steps the server reads the answers, takes the step and stores the new parameters
as an upload. The run's order is like any other: you pay per settled job, miners are paid from the charges, and
whatever's unspent comes back. A run ends after its last step, or when its order runs out of budget or time, or when
you stop it. `POST /api/orders/quote` prices the whole run.

There are two kinds:

- **`evolve`: evolution strategies** (OpenAI ES with mirrored pairs, centered ranks and Adam). You give a fitness
  and the number of parameters. Each job scores a few perturbed copies of the parameters, `θ ± σε`, and returns only
  the scores, 16 bytes a pair. The server rebuilds every `ε` from its seed. Every generation also scores `θ` itself
  (the *center*), which is the curve you watch. It works with any fitness you can compute and needs no gradients.
- **`train`: small neural nets on your data**, DiLoCo style. Each job takes `local_steps` Adam steps from the
  round's weights on one data shard and returns the change in the weights. The server averages the changes (the
  outer step, with Nesterov momentum) and starts the next round. It uses the built-in MLP, or your own model as a
  WebAssembly train step.

### Evolve spec

```json
{"kind": "evolve", "dim": 5, "generations": 100, "pairs": 64, "pairs_per_job": 8, "sigma": 0.1, "lr": 0.05,
 "episodes": 1, "fitness": {"wasm": "<sha256 of your module>"}}
```

| field | | |
|---|---|---|
| `dim` | 1 to 100,000 | parameters; `dim × pairs` is at most 20,000,000 |
| `fitness` | `{"wasm": hash}`, `{"builtin": "sphere" \| "rastrigin", "target"?}`, `{"builtin": "brain", ...}`, `{"builtin": "replay", ...}` | what a parameter vector scores; higher is better |
| `generations` | 1 to 10,000, default 100 | |
| `pairs` | 2 to 2,000, default 64 | mirrored pairs per generation |
| `pairs_per_job` | 1 to 64, default 8 | one job = this many pairs (plus job 0, the center) |
| `sigma`, `lr` | defaults 0.1 and 0.05 | the noise scale, and Adam's step size |
| `episodes` | 1 to 16, default 1 | fitness seeds per score, shared by the whole generation |
| `theta0` | an upload of `dim` float64 values | the start; zeros by default |
| `weight_decay` | 0 to 1 | |
| `timeout_s`, `redundancy` | as for programs | |

**A WebAssembly fitness** gets `u32 episode seed | u32 dim | f64 params[dim]` (little-endian) as its input, through
the `flyai` imports or stdin. It outputs one `f64`, the score. It must be deterministic: the same input must give the same 8
bytes. WebAssembly float math is the same on every engine, but `sin`, `exp` and friends must come from your own code
(Rust's libm, or a series), not from the host. The template is
[`es-cartpole`](https://github.com/alextitonis/fly.ai/tree/main/mine/examples/es-cartpole): a cart-pole policy
that learns to balance in a few dozen generations.

**The fly brain** as the fitness: `{"builtin": "brain", "inputs": [{"types": ["LC4"]}, ...], "targets": [{"types":
["DNp01"], "weight": 1}], "steps": 150, "cost": 0.5}`. There is one parameter per input group: its drive in volts per step,
clamped to −2..2. The score adds `weight × spikes` of each target's cells (descending or wing motor neurons), less
`cost × Σ|drive|`. It runs on the integer connectome, so every miner returns the same scores. These jobs go to
miners' CPU threads, which hold the connectome.

**A trading rule** as the fitness: `{"builtin": "replay", "data": "<replay data upload>", "setting": {"rule": {...}},
"keys": [{"path": "hold_bars", "lo": 4, "hi": 96, "int": true}, ...], "block": 96}`. Each parameter is squashed into its
key's range. The score is the log growth of the book on reshuffled price paths, one path per episode.

### Train spec

```json
{"kind": "train", "model": {"mlp": {"layers": [784, 128, 10]}}, "shards": ["<sha256>", "..."],
 "eval_shard": "<sha256>", "rounds": 50, "shards_per_round": 16, "local_steps": 50, "batch": 32, "lr": 0.001}
```

| field | | |
|---|---|---|
| `model` | `{"mlp": {"layers": [in, ..., out], "activation"?: "relu" \| "tanh", "loss"?: "xent" \| "mse"}}` or `{"wasm": hash, "params": n}` | up to 1,000,000 parameters |
| `shards` | 1 to 10,000 uploads | each a data shard (format below); round r takes the next `shards_per_round` of them, wrapping |
| `eval_shard` | an upload | built-in MLP only: the server scores the new weights on it every round |
| `rounds` | 1 to 5,000, default 50 | |
| `shards_per_round` | 1 to 256, default 16 | jobs per round |
| `local_steps`, `batch`, `lr`, `weight_decay` | defaults 50, 32, 0.001, 0 | each job's local AdamW |
| `outer_lr`, `outer_momentum` | defaults 0.7, 0.9 | the server's Nesterov step on the mean change |
| `theta0` | an upload of float32 weights | needed for a wasm model; the MLP starts from a seeded He init |
| `cosine` | 0.9 to 1, default 0.999 | two miners' weight changes agree at this cosine (and within 0.1% in length) |

**A data shard:** `"FLYDATA1" | u32 rows | u32 x_dim | u32 y_kind | u32 y_dim | f32 x[rows × x_dim] | y`, all
little-endian. `y_kind` 0 is class labels (`y` is `u32[rows]`, `y_dim` is the number of classes), and 1 is float
targets (`y` is `f32[rows × y_dim]`). The Python client writes these from numpy arrays.

**A WebAssembly train step** gets `u32 header length | header JSON {"steps", "batch", "lr", "weight_decay", "seed",
"params"} | zero padding to 4 bytes | f32 theta[params] | the shard`. It outputs `f32 delta[params]` (new − old),
then optionally `f32 mean loss` and `f32 accuracy`. The template is
[`train-logreg`](https://github.com/alextitonis/fly.ai/tree/main/mine/examples/train-logreg), softmax regression
written the way any model would be.

### Following a run

| | |
|---|---|
| `GET /api/runs/:id?points=500` | status, step, the last points, `theta` (the current parameters' upload), `best`, the order's money |
| `GET /api/runs/:id/points?after=step` | the whole curve, 5,000 steps at a time |
| `GET /api/runs` | the project's own runs (public research) |
| `GET /api/blobs/:hash` | parameters: raw float64 (evolve) or float32 (train), little-endian |

An evolve point has `center` (the score of the current θ), `mean`, `max` and `min` over the pairs, `grad_norm`, and how many
pairs were `missing` (a disputed or failed job just drops out). A train point has `train_loss`, `train_acc` (the
miners' own numbers), `eval_loss` and `eval_acc` (the server's, on `eval_shard`), and `delta_norm`. A run's order
links back to it as `run` in `GET /api/orders/:id`. You can't add jobs to a run's order by hand.

**From Python:** `pip install "git+https://github.com/alextitonis/fly.ai#subdirectory=mine/python"`, then
`Fleet().evolve(...)`, `.train(...)` or `.complete(...)`. See `mine/python/README.md`. **Try it free first:**
`node scripts/local-fleet.ts` in `mine/` starts a local server with practice miners. Point the client at it with
`FLYAI_SERVER=http://localhost:8790 FLYAI_ADMIN_TOKEN=local`.

**What fits:** small models only. Each miner downloads the round's weights (4 MB per million parameters), and a tab
has one thread. The fleet won't pretrain or fine-tune LLMs. **Miners can see your data and your fitness**, so don't
send anything private.

## Your own programs: run anything

The brain experiments above are one kind of job. You can also send the network your own code:

- **WebAssembly (`kind: "wasm"`):** CPU work. Compile it from Rust, C, C++, Zig, Go (TinyGo) or AssemblyScript.
- **A WGSL compute shader (`kind: "wgsl"`):** GPU work.

Miners run it in their browsers and send back the output. You choose how many miners must return the same
output before a job counts. Everything else about orders works as above: bids, budgets, time limits,
stopping, webhooks, streams and pulls.

### What fits, and what doesn't

A job runs inside a browser tab:
- **CPU:** one thread, up to 256 MiB of memory, and your time limit (at most 10 minutes).
- **GPU:** the miner's GPU through WebGPU.
- **Sizes:** inputs up to 8 MiB each, outputs up to 4 MiB.
- **No access:** no network, files, clock or threads.

That's a good fit for work that splits into many independent pieces:

| fits well | doesn't fit |
|---|---|
| Monte Carlo runs, one seed per job | anything that needs the internet or a database |
| parameter sweeps, grid searches, hyperparameter search for small models | Docker images, native Python or CUDA |
| rendering: fractal tiles, ray-traced frames split into tiles | models bigger than about 8 MiB of weights per job |
| data-parallel training rounds for small models: one data shard per job | low latency: jobs take seconds to minutes to come back |
| simulations: physics, cellular automata, agent-based models, many seeds | one huge job that can't be split |
| search: SAT or puzzle solvers with random restarts, route optimization, genetic algorithms | secrets: anyone who takes a job can read the program and its input |
| batch processing: image filters, sequence alignment chunks, compression benchmarks | |
| analysis: a chess engine compiled to WASM scoring positions | |
| math: searching number ranges, checking conjectures on intervals | |
| GPU batches: matrix math, small neural-network inference, image kernels | |

### Quick start: 1,000 Monte Carlo jobs from code

```sh
API=https://flyai-mine.fly.dev
PROGRAM=$(curl -s -X POST $API/api/blobs --data-binary @pi.wasm | jq -r .hash)

# price it: 1,000 jobs, each given its job number (0..999) as its input
curl -s -X POST $API/api/orders/quote -H 'content-type: application/json' \
  -d "{\"spec\":{\"kind\":\"wasm\",\"program\":\"$PROGRAM\",\"count\":1000,\"timeout_s\":30,\"redundancy\":2}}"

# create it (then pay exactly budget_wei, as with any order)
curl -s -X POST $API/api/orders -H 'content-type: application/json' \
  -d "{\"wallet\":\"0xYourWallet\",\"bid\":\"20\",\"budget\":\"20000\",\"spec\":{\"kind\":\"wasm\",\"program\":\"$PROGRAM\",\"count\":1000,\"timeout_s\":30}}"
# → {"id": "…", "budget_wei": "…", "order_key": "…", ...}   keep order_key: it adds jobs and stops the order from code
```

### The program spec

| field | | |
|---|---|---|
| `kind` | `"wasm"` or `"wgsl"` | |
| `program` | the sha256 of your uploaded module or shader | `POST /api/blobs` with the raw bytes returns `{hash, size, url}` |
| `inputs` | a list of uploaded sha256s, one job each | or use `count` |
| `count` | N jobs, each given its job number as its input: 4 bytes, u32 little-endian | no uploads needed |
| `timeout_s` | 1–600, default 60 | a job that runs longer counts as the answer `"timeout"` |
| `redundancy` | 1–5, default 2 | how many different wallets must return the same output; 1 trusts the first miner |
| `keep_open` | default false | the order waits for more jobs instead of finishing when it's caught up |
| `dispatch` | `[x, y, z]` workgroups (WGSL only) | at most 1,048,576 in all |
| `output_bytes` | the output buffer's size (WGSL only) | up to 4 MiB |
| `compare` | `"exact"`, or `{"f32_tolerance": 0.0001}` (WGSL only) | how shader outputs from different GPUs are compared |

**Price:** the lowest bid is `min_bid` for every started 30 seconds of `timeout_s`. That's 20 $FLYAI up to
30 s, and 40 $FLYAI up to 60 s.

**Pay:** 80% of each charge goes straight to the wallets whose outputs settled the job, split equally, and
is added to their monthly claim. Program jobs don't earn mining points.

### Writing a WebAssembly job

A module talks to the miner in one of two ways.

**1. The `flyai` imports**, for the smallest modules:

| import | |
|---|---|
| `flyai.input_len() -> i32` | the input's size in bytes |
| `flyai.input_read(ptr: i32)` | copy the whole input into memory at `ptr` |
| `flyai.output(ptr: i32, len: i32)` | append `len` bytes to the output (call it as often as you like) |

The module exports `memory` and a function `run()`.

**2. WASI (`wasm32-wasip1`)**, for ordinary programs:
- **stdin and stdout:** stdin is the job's input and stdout is its output; stderr is dropped. The entry
  point is `_start`, so `main()` just works.
- **Nothing else from the outside:** there are no arguments, environment or files, and the clock always
  reads 0.
- **Randomness:** `random_get` gives the same bytes to every miner of a job and different bytes per job,
  so random programs still agree.
- **Other calls** (sockets, filesystem) return `ENOSYS`.
- **Exit codes:** a nonzero exit becomes the answer `"exited with code N"`.

A trap (panic, out-of-bounds access) is an answer too: `"trap"`. Miners hitting the same trap agree on it.

#### Rust, flyai imports: Monte Carlo pi

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]

[profile.release]
opt-level = "s"
lto = true
strip = true
panic = "abort"
```

```rust
// src/lib.rs: input is 12 bytes (u64 seed, u32 samples), output is 8 bytes (u64 hits)
#[link(wasm_import_module = "flyai")]
extern "C" {
    fn input_len() -> i32;
    fn input_read(ptr: *mut u8);
    fn output(ptr: *const u8, len: i32);
}

#[no_mangle]
pub extern "C" fn run() {
    let mut input = vec![0u8; unsafe { input_len() } as usize];
    unsafe { input_read(input.as_mut_ptr()) };
    let mut state = u64::from_le_bytes(input[0..8].try_into().unwrap()) | 1;
    let samples = u32::from_le_bytes(input[8..12].try_into().unwrap());
    let mut next = || {
        state ^= state >> 12; state ^= state << 25; state ^= state >> 27;
        state.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 33
    };
    let r2 = (1u64 << 31) * (1u64 << 31);
    let hits = (0..samples).filter(|_| { let (x, y) = (next(), next()); x * x + y * y < r2 }).count() as u64;
    unsafe { output(hits.to_le_bytes().as_ptr(), 8) };
}
```

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown   # → target/wasm32-unknown-unknown/release/pi.wasm (8 KB)
```

With `count` instead of uploaded inputs, read the 4-byte job number and use it as the seed.

#### Rust, WASI: an ordinary program

```rust
// src/main.rs: word count. stdin in, stdout out.
use std::collections::HashMap;
use std::io::{self, Read, Write};

fn main() {
    let mut text = String::new();
    io::stdin().read_to_string(&mut text).unwrap();
    let mut counts: HashMap<String, u64> = HashMap::new();
    for w in text.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()) {
        *counts.entry(w.to_lowercase()).or_default() += 1;
    }
    let mut rows: Vec<_> = counts.into_iter().collect();
    rows.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0))); // sort: HashMap order differs per run
    let mut out = io::stdout().lock();
    for (w, n) in rows { writeln!(out, "{n} {w}").unwrap(); }
}
```

```sh
rustup target add wasm32-wasip1
cargo build --release --target wasm32-wasip1
```

Both are in [`mine/examples/`](https://github.com/alextitonis/fly.ai/tree/main/mine/examples), with more: a hash
search (proof of work), Mandelbrot tiles, a TSP search and a GPU matrix multiply. That folder also has
`run-local.ts` (run a module as a miner would, twice) and `order.ts` (create, pay, watch results).

#### C, Zig, Go, AssemblyScript

```sh
# C / C++ with wasi-sdk: stdin/stdout programs
$WASI_SDK/bin/clang -O2 -o job.wasm job.c

# C with the flyai imports and no libc
clang --target=wasm32 -O2 -nostdlib -Wl,--no-entry -Wl,--export=run -Wl,--allow-undefined -o job.wasm job.c
#   declare: __attribute__((import_module("flyai"), import_name("output"))) void output(const char*, int);

# Zig
zig build-exe job.zig -target wasm32-wasi -O ReleaseSmall

# Go (TinyGo; standard Go's wasip1 port needs more of WASI than the miners offer)
tinygo build -target=wasip1 -opt=2 -o job.wasm .

# AssemblyScript: declare the flyai functions with @external("flyai", "output")
asc job.ts -O3 --runtime stub -o job.wasm
```

#### Making outputs agree

Two miners agree only if their outputs are identical, byte for byte:

- **Unordered collections:** sort before printing. Hash maps iterate in a different order every run.
- **The clock:** don't rely on time. It always reads 0 here.
- **Randomness:** use `random_get` or your input as the seed. It's the same for every miner of a job.
- **Integer math:** always agrees.
- **Floats:** WebAssembly floats agree on every machine for normal values. Avoid relaxed SIMD and
  depending on NaN bit patterns.
- **Checking:** run the module locally twice on the same input and compare.

If miners still disagree, the job comes back `disputed` with every distinct output, and you decide.

### Writing a GPU job (WGSL)

The shader's entry point is `main`, and it can declare these bindings (it doesn't have to use all of them):

```wgsl
@group(0) @binding(0) var<storage, read> input: array<f32>;        // your input bytes, zero-padded to 4
@group(0) @binding(1) var<storage, read_write> output: array<f32>; // output_bytes, zeroed
struct Job { index: u32, input_bytes: u32, output_bytes: u32, pad: u32 }
@group(0) @binding(2) var<uniform> job: Job;                        // the job number and sizes

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let n = job.input_bytes / 4u;
  if (id.x >= n) { return; }
  output[id.x] = sqrt(input[id.x]) * f32(job.index + 1u);
}
```

The element type is up to you: `f32`, `u32`, `i32` or structs over the same bytes.

Order it with `dispatch: [ceil(n / 64), 1, 1]` and `output_bytes: 4 * n`. Float results can differ slightly
between NVIDIA, AMD and Intel, so give `compare: {"f32_tolerance": 1e-4}`, or use integer math and compare
exactly. A shader that doesn't compile comes back as the answer `"shader doesn't compile: …"`.

### Adding jobs, and a training loop

Create the order with `keep_open: true`. Then add work whenever you like, using the `order_key` from
creation:

```sh
curl -X POST $API/api/orders/ORDER_ID/jobs -H "authorization: Bearer $ORDER_KEY" -H 'content-type: application/json' \
  -d '{"inputs": ["<sha256>", "<sha256>"]}'      # or {"count": 500}: more job numbers
curl -X POST $API/api/orders/ORDER_ID/stop -H "authorization: Bearer $ORDER_KEY"   # stop from code
```

Data-parallel training of a small model, one round at a time. The program reads `weights ++ shard_id`
and outputs its gradient for that shard:

```python
import numpy as np, requests, struct, time

API, ORDER, KEY = "https://flyai-mine.fly.dev", "...", "..."
H = {"authorization": f"Bearer {KEY}"}
weights = np.zeros(10_000, dtype=np.float32)
after = 0

for step in range(100):
    # one job per shard: the current weights plus which shard to use
    inputs = []
    for shard in range(32):
        blob = weights.tobytes() + struct.pack("<I", shard)
        inputs.append(requests.post(f"{API}/api/blobs", data=blob).json()["hash"])
    requests.post(f"{API}/api/orders/{ORDER}/jobs", json={"inputs": inputs}, headers=H).raise_for_status()

    grads = []
    while len(grads) < 32:
        page = requests.get(f"{API}/api/orders/{ORDER}/results", params={"after": after}).json()
        for row in page["rows"]:
            if row["output"]:
                grads.append(np.frombuffer(requests.get(API + row["output"]["url"]).content, dtype=np.float32))
        after = page["next"]
        time.sleep(2)
    weights -= 0.01 * np.mean(grads, axis=0)
```

Use a webhook or the stream instead of polling when you have a server.

### Program results

A result row for a program:

```json
{
  "seq": 88, "index": 17, "input": "<sha256 or null for count jobs>",
  "checked_by": "agreement",
  "output": { "hash": "<sha256>", "size": 8, "url": "/api/blobs/<sha256>" },
  "error": null
}
```

- **`checked_by`:**
  - `single`: redundancy 1, the first miner's output.
  - `agreement`: enough wallets returned the same output.
  - `disputed`: nobody agreed after `redundancy + 2` answers. `output` is null, and `answers` lists every
    distinct output (or error) with how many miners gave it.
- **`error`:** the answer when the program failed the same way for everyone: `trap`, `timeout`,
  `exited with code N`, or a refusal.
- **Downloading:** fetch `output.url` from the API.
- **Retention:** outputs and uploads nobody has used for 14 days are deleted, so download what you need.
- **CSV:** `?format=csv` lists `seq, index, input, checked_by, output, size, error`.

### Security

**For miners.**
- **Sandbox:** every program job runs in a fresh Web Worker with nothing but the imports above. There's no
  network, no DOM, no files and no other JavaScript.
- **Time limit:** the worker is terminated at the time limit, so an endless loop dies with it.
- **Memory:** before anything runs, the miner checks the module itself. It refuses imports from anywhere
  else, imported memory or globals, shared or 64-bit memory, and oversized tables. It caps memory at
  256 MiB, so a memory bomb just sees `memory.grow` fail. Output is capped too.
- **Downloads:** the program and input are checked against their sha256 before running, so a server or
  network that swapped them is caught.
- **Opt-in:** miners turn program jobs off with one switch on the Mine page. The browser extension doesn't
  take them yet.
- **GPU jobs:** they are bounded in workgroups and buffer size. A heavy shader can still make the miner's
  screen stutter while it runs.

**For the server.**
- **It never runs your program.** It only reads the module's structure to check it and cap its limits.
  That inspector is a single pass that only ever returns or refuses. It's fuzzed with 20,000 corrupted,
  truncated and random modules, and refuses an 8 MiB module of junk in about a millisecond.
- **Uploads:**
  - **Size:** 8 MiB each.
  - **Rate:** per address, 600 uploads and 2 GB an hour.
  - **Storage:** capped, and unused uploads are deleted.
  - **Serving:** as sandboxed downloads, never as pages.
- **Bad input:** oversized bodies, unknown kinds and malformed specs get a 4xx. The test suite sends 24 junk
  6 MiB modules at once and checks the server keeps answering.
- **No strikes over programs:** miners aren't penalised over your code. Outputs that don't match just earn
  nothing.

**For you.**
- **Nothing is secret:** anyone who takes a job can read your program and its input. Don't send keys,
  personal data or anything you wouldn't publish.
- **Redundancy protects results:** a single miner (redundancy 1) can return anything. With 2 or more, a
  wrong output has to be matched by an independent wallet.
- **Hedge important jobs:** use redundancy 3, and check disputed rows yourself.

### Program endpoints

| | |
|---|---|
| `POST /api/blobs` (raw body, up to 8 MiB) | → `{hash, size, url}` |
| `GET /api/blobs/:hash` | the bytes, as a download |
| `POST /api/orders {..., spec: {kind: "wasm" \| "wgsl", ...}}` | as any order, plus `order_key` once |
| `POST /api/orders/:id/jobs {inputs} \| {count}` (Bearer order_key) | more jobs for an order that hasn't ended |
| `POST /api/orders/:id/stop` (Bearer order_key) | stop from code, no signature |

## Order status

`GET /api/orders/:id` returns:

- **`status`:** `unpaid`, `expired`, `live`, `done` or `ended`.
- **`end_reason`:** `sweep`, `budget`, `time` or `stopped`.
- **Progress:** `jobs`, `taken_on`, `out` (runs held by miners now), `settled` and `dropped`.
- **Money:** `bid`, `budget`, `spent` and `returned`.
- **Results:** `last_seq`, and `webhook` (delivery state).

## Endpoints

| | |
|---|---|
| `GET /api/orders/config` | prices, limits, pay-to, token, live market, channels, outputs |
| `POST /api/orders/quote {spec, bid?}` | runs, how many are already done, what the whole experiment costs at the bid |
| `POST /api/orders {wallet, spec, bid, budget, hours?, max_parallel?, webhook?}` | a new unpaid order (with `webhook_secret` once) |
| `POST /api/orders/:id/pay {tx, chain?}` | match the transfer and start the order (`chain: "base"` for USDC) |
| `POST /api/orders/:id/usdc` | the budget in USDC at the live price, held until `expires_at` |
| `POST /api/orders/:id/usdc/authorize {from, value, valid_after, valid_before, nonce, signature}` | gasless USDC: the server sends your signed transfer |
| `POST /api/orders {guest: true, spec, bid, budget, ...}` | an order paid by card with no wallet; `order_key` (shown once) stops it |
| `POST /api/orders/:id/card` | a single-use Coinbase card checkout for the order's price (at least $2) → `{url, usdc}` |
| `GET /api/orders/:id/card` | the order, after checking its card payment with Coinbase; it starts once paid |
| `GET /api/price` | $FLYAI in USD (the lower of GeckoTerminal and DexScreener) |
| `POST /api/orders/:id/intent {action}` | the message to sign for `fund` or `stop` |
| `POST /api/orders/:id/fund {nonce, signature}` | pay from the wallet's balance |
| `POST /api/orders/:id/stop {nonce, signature}` | stop; what's unspent returns to the balance |
| `GET /api/orders/:id` | status and progress |
| `GET /api/orders/:id/results?after&limit` | settled rows after a seq (`format=csv` for all of them) |
| `GET /api/orders/:id/stream?after` | server-sent events: `result`, `status` |
| `GET /api/orders?wallet=` | a wallet's orders and balance |
| `GET /api/balance?wallet=` | balance and history |

Errors come back as `{"error": "…"}` with a 4xx or 5xx status. Anyone who knows an order's id can read
its results, so treat the id as private if the results are.
