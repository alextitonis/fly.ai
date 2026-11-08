"""Sleep: keep learning from new data without forgetting the old, for any model.

The pattern comes from Google's SLEEP framework (arXiv 2606.03979), which does it for LLM weights. This module does
it for the small models this repo trains (connectome readouts, LightGBM predictors):

    WAKE    sleeper.wake(X, y, context)   the day's examples go to a short-term buffer; nothing is trained
    SLEEP   sleeper.sleep()               offline, once a "night":
      1. consolidate  ADD parameters instead of overwriting: a new head / new trees fitted on tonight's rows plus a
                      rehearsal sample of older rows, with every context (a season, a regime, a task) kept in the
                      sample even when it has not been seen for a while
      2. prune        every `prune_every` nights (or past `max_size`) one fresh fit on the rehearsal memory instead, so
                      the model doesn't grow forever
      3. dream        a block bootstrap of the candidate's paired score vs the current model: reshuffled blocks test
                      the candidate, they are never trained on
      4. gate         the candidate replaces the model only if it is not worse on tonight's held-out rows (the newest
                      `val_share`, never trained on) AND not worse on ANY context's old held-out slice (no forgetting)
      5. remember     tonight's rows go to long-term memory: a per-context reservoir sample, part of it held out for
                      step 4 forever
    EXPERTS  Sleeper(..., experts=True): one model chain per context, each slept only on its own rows; predict(X,
             context) uses that context's expert (the shared chain when the context has none yet)

    from flybrain.sleep import Sleeper, RidgeHeads
    s = Sleeper(RidgeHeads(lam=1e-2))
    for day in days:
        s.wake(day.X, day.y, context=day.season)
        report = s.sleep()
    y_hat = s.predict(X_new, context="summer")

A Learner is anything with fit(X, y, init=None) -> model (init: the model to EXTEND, old parameters untouched),
predict(model, X) -> array and size(model) -> int. RidgeHeads (numpy) and LightGBMLearner (needs lightgbm) are here.
Worked example: sleep_example.py at the repo root (a connectome fly learning which smells mean food as seasons
change). The Fly Desk's nightly predictor (flytrade/learn/sleep.py) is the same idea on LightGBM.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .reservoir import fit_ridge

__all__ = ["Sleeper", "RidgeHeads", "LightGBMLearner", "Memory", "dream", "r2", "neg_mse"]


# ---- metrics: higher is better ----------------------------------------------------------------

def neg_mse(y: np.ndarray, p: np.ndarray) -> float:
    return -float(np.mean((np.asarray(y, float) - np.asarray(p, float)) ** 2))


def r2(y: np.ndarray, p: np.ndarray) -> float:
    y, p = np.asarray(y, float), np.asarray(p, float)
    v = float(np.var(y))
    return 1.0 - float(np.mean((y - p) ** 2)) / v if v > 0 else float("nan")


# ---- learners ---------------------------------------------------------------------------------

class RidgeHeads:
    """A linear model that grows by heads. fit(init=None) is one ridge fit; fit(init=model) fits a new head on what
    the model still gets wrong (the residual) and returns model + [head]: the old heads are never changed, so a
    night can only add knowledge on top. The new head is shrunk harder (`grow_lam`) so one night can't swamp the
    rest."""

    def __init__(self, lam: float = 1e-2, grow_lam: float | None = None):
        self.lam = lam
        self.grow_lam = lam * 3 if grow_lam is None else grow_lam

    def fit(self, X, y, init=None):
        X, y = np.asarray(X, float), np.asarray(y, float)
        if init is None:
            return [fit_ridge(X, y, self.lam)]
        r = y - self.predict(init, X)
        return list(init) + [fit_ridge(X, r, self.grow_lam)]

    @staticmethod
    def predict(model, X):
        X = np.asarray(X, float)
        return sum(X @ np.asarray(w).T + b for w, b in model)

    @staticmethod
    def size(model) -> int:
        return len(model)


class LightGBMLearner:
    """LightGBM regression; extending a model adds `grow_rounds` trees with init_model (old trees unchanged)."""

    def __init__(self, params: dict | None = None, rounds: int = 150, grow_rounds: int = 30):
        self.params = {"objective": "huber", "learning_rate": 0.05, "num_leaves": 15, "min_data_in_leaf": 50,
                       "lambda_l2": 10.0, "verbose": -1, "num_threads": 2, "seed": 7, **(params or {})}
        self.rounds, self.grow_rounds = rounds, grow_rounds

    def fit(self, X, y, init=None):
        import lightgbm as lgb
        ds = lgb.Dataset(np.asarray(X, float), np.asarray(y, float))
        return lgb.train(self.params, ds, self.rounds if init is None else self.grow_rounds, init_model=init)

    @staticmethod
    def predict(model, X):
        return model.predict(np.asarray(X, float))

    @staticmethod
    def size(model) -> int:
        return int(model.num_trees())


# ---- long-term memory -------------------------------------------------------------------------

class Memory:
    """Per-context reservoir samples of past rows (at most `cap` each, uniform over everything ever seen in that
    context), plus a held-out share per context that is only ever used to check for forgetting."""

    def __init__(self, cap: int = 20_000, hold_out: float = 0.1, seed: int = 0):
        self.cap, self.hold_out = cap, hold_out
        self.rng = np.random.default_rng(seed)
        self.train: dict = {}      # context -> [X, y, seen]
        self.held: dict = {}

    def _add(self, store: dict, ctx, X, y) -> None:
        if ctx not in store:
            store[ctx] = [X[:0].copy(), y[:0].copy(), 0]
        mX, my, seen = store[ctx]
        for i in range(len(X)):                      # reservoir sampling (Algorithm R)
            seen += 1
            if len(mX) < self.cap:
                mX, my = np.concatenate([mX, X[i:i + 1]]), np.concatenate([my, y[i:i + 1]])
            else:
                j = int(self.rng.integers(0, seen))
                if j < self.cap:
                    mX[j], my[j] = X[i], y[i]
        store[ctx] = [mX, my, seen]

    def add(self, X, y, contexts) -> None:
        X, y, contexts = np.asarray(X, float), np.asarray(y, float), np.asarray(contexts, dtype=object)
        held = self.rng.random(len(X)) < self.hold_out
        for ctx in dict.fromkeys(contexts.tolist()):
            m = contexts == ctx
            if (m & held).any():
                self._add(self.held, ctx, X[m & held], y[m & held])
            if (m & ~held).any():
                self._add(self.train, ctx, X[m & ~held], y[m & ~held])

    def sample(self, n: int, only=None) -> tuple[np.ndarray, np.ndarray]:
        """n rows split EVENLY over the contexts (as far as each has rows): a context seen long ago gets the same
        share as yesterday's."""
        ctxs = [c for c in self.train if (only is None or c == only) and len(self.train[c][0])]
        if not ctxs or n <= 0:
            return None, None
        Xs, ys, left, per = [], [], n, {}
        for i, c in enumerate(sorted(ctxs, key=lambda c: len(self.train[c][0]))):
            k = min(len(self.train[c][0]), left // (len(ctxs) - i))
            per[c], left = k, left - k
        for c, k in per.items():
            mX, my, _ = self.train[c]
            idx = self.rng.choice(len(mX), k, replace=False)
            Xs.append(mX[idx])
            ys.append(my[idx])
        return np.concatenate(Xs), np.concatenate(ys)

    def old(self, only=None) -> tuple[np.ndarray, np.ndarray]:
        parts = [v for c, v in self.held.items() if (only is None or c == only) and len(v[0])]
        if not parts:
            return None, None
        return np.concatenate([p[0] for p in parts]), np.concatenate([p[1] for p in parts])

    def rows(self, only=None) -> int:
        return sum(len(v[0]) for c, v in self.train.items() if only is None or c == only)


# ---- dream ------------------------------------------------------------------------------------

def dream(diff, n: int = 2000, seed: int = 0) -> dict:
    """Bootstrap of a per-block paired difference (candidate minus current): P(the candidate is worse) and a 90%
    interval. The reshuffled blocks are the 'dreams': a test, never training data."""
    x = np.asarray(diff, float)
    x = x[np.isfinite(x)]
    if len(x) < 3:
        return {"blocks": int(len(x)), "mean": float(x.mean()) if len(x) else None, "p_worse": None}
    rng = np.random.default_rng(seed)
    means = x[rng.integers(0, len(x), (n, len(x)))].mean(axis=1)
    return {"blocks": int(len(x)), "mean": float(x.mean()), "p_worse": float((means <= 0).mean()),
            "lo": float(np.percentile(means, 5)), "hi": float(np.percentile(means, 95))}


def _blocks(metric, y, a, b, k: int) -> np.ndarray:
    cuts = np.array_split(np.arange(len(y)), max(1, min(k, len(y) // 5)))
    return np.array([metric(y[c], a[c]) - metric(y[c], b[c]) for c in cuts if len(c)])


# ---- the sleeper ------------------------------------------------------------------------------

@dataclass
class Sleeper:
    learner: object
    model: object = None
    metric: object = neg_mse
    experts: bool = False
    prune_every: int = 7
    max_size: int | None = None
    rehearsal_ratio: float = 3.0
    rehearsal_cap: int = 50_000
    val_share: float = 0.25
    old_tol: float = 0.01          # how much worse on the old slice a candidate may be (in metric units)
    p_worse: float = 0.8           # refuse when the dream says P(worse on tonight's rows) >= this
    memory_cap: int = 20_000
    hold_out: float = 0.1
    blocks: int = 10
    seed: int = 0
    nights: int = 0
    chains: dict = field(default_factory=dict)
    history: list = field(default_factory=list)

    def __post_init__(self):
        self.memory = Memory(self.memory_cap, self.hold_out, self.seed)
        self._buf: list = []
        if self.model is not None:
            self.chains["all"] = self.model

    # -- wake
    def wake(self, X, y, context="all") -> None:
        """Keep the day's examples for tonight. context: one label for all rows, or one per row."""
        X, y = np.asarray(X, float), np.asarray(y, float)
        ctx = np.asarray([context] * len(X) if np.ndim(context) == 0 else context, dtype=object)
        self._buf.append((X, y, ctx))

    # -- use
    def predict(self, X, context=None):
        X = np.asarray(X, float)
        if not self.experts or context is None:
            return self.learner.predict(self.chains["all"], X)
        ctx = np.asarray([context] * len(X) if np.ndim(context) == 0 else context, dtype=object)
        out = np.empty(len(X))
        for c in dict.fromkeys(ctx.tolist()):
            m = ctx == c
            out[m] = self.learner.predict(self.chains.get(("expert", c), self.chains["all"]), X[m])
        return out

    # -- sleep
    def sleep(self) -> dict:
        if not self._buf:
            return {"night": self.nights, "skipped": "nothing learned today"}
        X = np.concatenate([b[0] for b in self._buf])
        y = np.concatenate([b[1] for b in self._buf])
        ctx = np.concatenate([b[2] for b in self._buf])
        self.nights += 1
        report = {"night": self.nights, "rows": int(len(X)), "chains": {}}
        report["chains"]["all"] = self._sleep_chain("all", X, y, None)
        if self.experts:
            for c in dict.fromkeys(ctx.tolist()):
                m = ctx == c
                report["chains"][c] = self._sleep_chain(("expert", c), X[m], y[m], c)
        self.memory.add(X, y, ctx)
        self._buf = []
        self.model = self.chains.get("all")
        self.history.append(report)
        return report

    def _sleep_chain(self, key, X, y, only) -> dict:
        rng = np.random.default_rng(self.seed + self.nights)
        cur = self.chains.get(key)
        if cur is None and key != "all":
            cur = self.chains.get("all")                 # a new expert starts from the shared model
        n_val = int(len(X) * self.val_share) if cur is not None else 0
        Xt, yt, Xv, yv = X[:len(X) - n_val], y[:len(y) - n_val], X[len(X) - n_val:], y[len(y) - n_val:]
        prune = cur is not None and ((self.nights % self.prune_every == 0) or
                                     (self.max_size is not None and self.learner.size(cur) >= self.max_size))
        n_reh = (self.rehearsal_cap if prune else min(self.rehearsal_cap, int(len(Xt) * self.rehearsal_ratio)))
        rX, ry = self.memory.sample(n_reh, only)
        if rX is not None:
            Xt, yt = np.concatenate([rX, Xt]), np.concatenate([ry, yt])
        order = rng.permutation(len(Xt))
        Xt, yt = Xt[order], yt[order]
        if cur is None:
            self.chains[key] = self.learner.fit(Xt, yt)
            return {"mode": "first", "accepted": True, "size": self.learner.size(self.chains[key])}
        cand = self.learner.fit(Xt, yt, init=None if prune else cur)
        out = {"mode": "prune" if prune else "consolidate", "rehearsal": int(0 if rX is None else len(rX))}
        why = []
        if n_val:
            d = dream(_blocks(self.metric, yv, self.learner.predict(cand, Xv), self.learner.predict(cur, Xv), self.blocks),
                      seed=self.seed + self.nights)
            out["recent"] = d
            if d["p_worse"] is not None and d["p_worse"] >= self.p_worse:
                why.append(f"worse on tonight's held-out rows (p {d['p_worse']:.2f})")
        # forgetting is checked per context: a gain on one never pays for a loss on another
        out["old"] = {}
        for c in ([only] if only is not None else list(self.memory.held)):
            oX, oy = self.memory.old(c)
            if oX is None:
                continue
            sc, so = self.metric(oy, self.learner.predict(cand, oX)), self.metric(oy, self.learner.predict(cur, oX))
            out["old"][str(c)] = {"candidate": sc, "current": so}
            if sc < so - self.old_tol:
                why.append(f"forgets {c}: old slice {sc:.4f} < {so:.4f} - {self.old_tol}")
        out["accepted"], out["why"] = not why, why
        if not why:
            self.chains[key] = cand
        elif key not in self.chains:                     # a refused first night for an expert: it starts as the shared one
            self.chains[key] = cur
        out["size"] = self.learner.size(self.chains[key])
        return out
