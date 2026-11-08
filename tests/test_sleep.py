"""pytest tests/test_sleep.py -q -- flybrain.sleep: no forgetting across contexts, the gate, memory, heads."""
import numpy as np

from flybrain.reservoir import fit_ridge
from flybrain.sleep import Memory, RidgeHeads, Sleeper, dream, r2

D = 20


def _world(seed=0):
    rng = np.random.default_rng(seed)
    W = {"summer": rng.normal(size=D) * (np.arange(D) < 10), "winter": rng.normal(size=D) * (np.arange(D) >= 10)}

    def day(season, n=300):
        X = rng.normal(size=(n, D))
        X[:, :10] *= 1 if season == "summer" else 0.3
        X[:, 10:] *= 1 if season == "winter" else 0.3
        return X, X @ W[season] + rng.normal(0, 0.5, n)
    return day


def test_experts_remember_a_season_that_plain_retraining_forgets():
    day = _world()
    test = {s: day(s, 1000) for s in ("summer", "winter")}
    s = Sleeper(RidgeHeads(1e-2), experts=True)
    for season in ["summer"] * 3 + ["winter"] * 3:
        X, y = day(season)
        s.wake(X, y, season)
        s.sleep()
    w, b = fit_ridge(X, y, 1e-2)                         # plain: only the last day
    assert r2(test["summer"][1], test["summer"][0] @ w + b) < 0.2
    for season, (Xt, yt) in test.items():
        assert r2(yt, s.predict(Xt, season)) > 0.9, season


def test_heads_grow_and_old_heads_stay():
    day = _world()
    X, y = day("summer")
    L = RidgeHeads()
    m = L.fit(X, y)
    m2 = L.fit(*day("winter"), init=m)
    assert L.size(m2) == 2 and m2[0] is m[0]


def test_gate_refuses_a_model_that_forgets():
    day = _world()
    s = Sleeper(RidgeHeads(1e-2), old_tol=0.0)
    for _ in range(3):
        s.wake(*day("summer"), "summer")
        s.sleep()
    X, y = day("winter", 600)
    s.wake(X, y * 5, "winter")                           # a loud new context that would drown the old one
    rep = s.sleep()["chains"]["all"]
    assert rep["accepted"] is False and any("forgets" in w for w in rep["why"])


def test_memory_samples_contexts_evenly_and_dream():
    m = Memory(cap=500, hold_out=0.0)
    m.add(np.zeros((1000, 2)), np.zeros(1000), ["a"] * 1000)
    m.add(np.ones((50, 2)), np.ones(50), ["b"] * 50)
    X, y = m.sample(200)
    assert len(y) == 200 and y.sum() == 50 and m.rows("a") == 500
    assert dream(np.full(10, -1.0))["p_worse"] == 1.0
