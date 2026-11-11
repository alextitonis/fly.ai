# flyai-compute

Train small models and run batch jobs on the [fly.ai compute network](https://www.flyaiworld.com/compute/runs):
thousands of browsers that run jobs for $FLYAI. Two miners must agree on every job, and you pay only for the ones
that settle.

```sh
pip install "git+https://github.com/alextitonis/fly.ai#subdirectory=mine/python"
```

There are no dependencies. numpy is used when it's installed.

## Evolve: evolution strategies over any fitness

```python
from flyai_compute import Fleet, wasm

fleet = Fleet()
run = fleet.evolve(fitness=wasm("es_cartpole.wasm"), dim=5, generations=60, pairs=32, sigma=0.5, lr=0.2,
                   episodes=2, wallet="0xYOUR_WALLET")
print(run.pay_link)            # open it and pay with that wallet; the run starts by itself
for p in run.watch():          # one point per generation
    print(p["step"], p["center"], p["max"])
theta = run.theta(best=True)   # float64 parameters
```

Fitness options: `wasm(path)` (your module: `u32 episode, u32 dim, f64 params` in, one `f64` out),
`sphere()` / `rastrigin()` (smoke tests), `brain(inputs, targets)` (the fly connectome), and `replay(...)` (a
trading rule on recorded prices). The template is `mine/examples/es-cartpole`.

## Train: a neural net on your data

```python
from flyai_compute import Fleet, mlp

run = Fleet().train(mlp([784, 128, 10]), x_train, y_train, classes=10, eval=(x_test, y_test),
                    shards=64, rounds=50, local_steps=50, lr=1e-3, wallet="0xYOUR_WALLET")
for p in run.watch():
    print(p["step"], p["eval_acc"])
(W1, b1), (W2, b2) = run.layers()
```

Each round, miners take `local_steps` Adam steps on one shard each. The server averages their weight changes and
scores the result on your held-out data. Bring your own model with `wasm_model(path, params)` and `theta0=...`. The
template is `mine/examples/train-logreg`.

## Complete: batch text generation

```python
order = Fleet().complete(["Label the sentiment: 'the bot lost my money'", ...], model="qwen2.5-0.5b",
                         max_tokens=64, wallet="0xYOUR_WALLET")
print(order.pay_link)
order.wait()
texts = order.texts()
```

Different GPUs can choose another word late in a text, so two answers count as agreeing when 3 in 4 of their texts
match on their first 90% (`share`, `prefix`).

## Try it free on your own machine

```sh
cd mine && node scripts/local-fleet.ts          # a local server and practice miners
FLYAI_SERVER=http://localhost:8790 FLYAI_ADMIN_TOKEN=local python your_run.py
```

With the admin token, runs start at once and cost nothing. `tests/test_local.py` runs all three kinds against it.

## Good to know

- Small models only: up to 100,000 evolved parameters, nets up to 1,000,000 weights, and 0.5B–1.5B text models.
- Miners can see your data and your fitness. Don't send anything private.
- Money only moves when you pay with your own wallet through `pay_link`. Nothing here asks for a key.
- The API guide with every field: https://www.flyaiworld.com/compute/compute-api.md
