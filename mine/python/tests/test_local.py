"""The Python client against a local practice fleet (node scripts/local-fleet.ts, from mine/).

    FLYAI_SERVER=http://localhost:8790 FLYAI_ADMIN_TOKEN=local python -m pytest mine/python/tests -q
    (or just: python mine/python/tests/test_local.py)

Runs house runs only (no payment): an evolve run on a sphere, a train run of the built-in MLP on two spirals,
a cart-pole evolve run with the WebAssembly fitness from mine/examples, and a complete order (the local fleet answers
completions with stand-in texts).
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from flyai_compute import Fleet, decode_shard, encode_shard, mlp, sphere, wasm  # noqa: E402

HERE = os.path.dirname(__file__)
fleet = Fleet(server=os.environ.get("FLYAI_SERVER", "http://localhost:8790"), admin_token=os.environ.get("FLYAI_ADMIN_TOKEN", "local"))


def spirals(n, seed):
    r = random.Random(seed)
    x, y = [], []
    for i in range(n):
        c = i % 2
        t = r.random() * 3 * math.pi
        rad = t / (3 * math.pi) * 2
        x.append([rad * math.cos(t + c * math.pi) + 0.05 * (r.random() - 0.5), rad * math.sin(t + c * math.pi) + 0.05 * (r.random() - 0.5)])
        y.append(c)
    return x, y


def test_shards_round_trip():
    x, y = spirals(10, 1)
    s = decode_shard(encode_shard(x, y, classes=2))
    assert s["rows"] == 10 and s["x_dim"] == 2 and s["y"] == y
    assert all(abs(a - b) < 1e-6 for r, q in zip(s["x"], x) for a, b in zip(r, q))
    reg = decode_shard(encode_shard(x, [0.5 * i for i in range(10)]))
    assert reg["y_kind"] == 1 and reg["y"][3] == [1.5]


def test_evolve_sphere():
    run = fleet.evolve(fitness=sphere(target=[1, -2, 0.5]), dim=3, generations=25, pairs=16, pairs_per_job=8, sigma=0.3, lr=0.2, timeout_s=30)
    points = list(run.watch(every=0.5))
    assert run.status == "done", run.view(0)
    assert len(points) == 25 and points[-1]["center"] > points[0]["center"]
    theta = run.theta()
    assert len(theta) == 3 and abs(theta[0] - 1) < 0.4, list(theta)
    print("evolve sphere:", round(points[0]["center"], 3), "->", round(points[-1]["center"], 3), [round(v, 2) for v in theta])


def test_train_spirals():
    x, y = spirals(1600, 2)
    ex, ey = spirals(400, 9)
    run = fleet.train(mlp([2, 24, 24, 2]), x, y, classes=2, shards=4, eval=(ex, ey), rounds=12, shards_per_round=2, local_steps=25, batch=32, lr=0.01, timeout_s=60)
    points = list(run.watch(every=0.5))
    assert run.status == "done"
    accs = [p["eval_acc"] for p in points]
    assert accs[-1] > 0.85, accs
    layers = run.layers()
    assert len(layers) == 3 and len(layers[0][1]) == 24
    print("train spirals: held-out accuracy", [round(a, 2) for a in accs])


def test_evolve_cartpole_wasm():
    path = os.path.join(HERE, "..", "..", "examples", "es-cartpole", "es_cartpole.wasm")
    run = fleet.evolve(fitness=wasm(path), dim=5, generations=8, pairs=16, pairs_per_job=8, sigma=0.5, lr=0.3, episodes=2, timeout_s=30)
    points = list(run.watch(every=0.5))
    assert run.status == "done" and max(p["max"] for p in points) > points[0]["center"]
    print("cart-pole:", [round(p["center"]) for p in points])


def test_complete():
    order = fleet.complete(["Name a fly.", {"system": "One word.", "prompt": "Sky colour?"}, "Count to three."], batch=2, max_tokens=32)
    order.wait(every=0.5)
    texts = order.texts()
    assert len(texts) >= 3 and all(t for t in texts[:3]), texts
    print("complete:", texts[:3])


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
