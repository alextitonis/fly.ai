"""Pure-numpy port of flycoinrh/flyreservoir.py (MIT, alextitonis).

Reservoir computing on the fly connectome:
    input -> encoder -> fly brain (frozen) -> trace -> trained readout -> output

Ports the Readout class, Trace class, run() function, and best_threshold()
from upstream. scipy.optimize.minimize is replaced with gradient descent;
scipy.special.expit with a numpy sigmoid.

Original: https://github.com/alextitonis/fly.ai  License: MIT
"""
from __future__ import annotations

import numpy as np


# ─── Trace (from upstream flyreservoir.py) ────────────────────────────────────

class Trace:
    """Exponentially decaying spike trace of a neuron population.

    Pick the population by `types` (cell type names via brain.cells), `group`
    (a name from brain.groups), or your own `idx` array. `side` restricts
    `types` to "L" or "R".

    Matches upstream flyreservoir.Trace API.
    """

    def __init__(self, brain, types: list[str] | None = None, group: str | None = None,
                 idx: np.ndarray | None = None, side: str | None = None, tau: float = 0.1,
                 aggregate: str = "mean"):
        if sum(x is not None for x in (types, group, idx)) != 1:
            raise ValueError("pass exactly one of types, group, idx")
        if idx is None:
            idx = brain.groups[group] if group is not None else brain.cells(types, side=side)
        if aggregate not in ("mean", "batch"):
            raise ValueError('aggregate must be "mean" or "batch"')
        self.idx = np.asarray(idx)
        self.slot = np.full(brain.n, -1, np.int64)
        self.slot[self.idx] = np.arange(len(self.idx))
        self.aggregate = aggregate
        self.batch = getattr(brain, 'batch', 1)
        width = len(self.idx)
        self.trace = np.zeros(width if aggregate == "mean" else (width, self.batch), np.float32)
        self.decay = np.float32(np.exp(-brain.dt / tau))

    def observe(self, fired: np.ndarray) -> np.ndarray:
        """Update trace with neurons that fired this step. Returns current features."""
        self.trace *= self.decay
        hit = np.zeros(len(self.slot), dtype=bool)
        hit[fired] = True
        active = hit[self.idx]
        if self.aggregate == "mean":
            self.trace[active] += 1.0
            return self.trace.copy()
        else:
            # batch mode: fired is per-fly, but our brain doesn't batch
            self.trace[active, 0] += 1.0
            return self.trace.copy()

    def features(self) -> np.ndarray:
        """Return the current trace vector."""
        return self.trace.copy()

    def reset(self) -> None:
        """Reset the trace to zero."""
        self.trace[:] = 0.0


def run(brain, steps: int, encode=None, trace: Trace | None = None,
        eye_drive=None) -> np.ndarray:
    """Step the brain `steps` times and collect activity.

    Matches upstream flyreservoir.run() API.
    `encode(t)` returns the `inject` list for step `t`.
    `eye_drive` can be an array or callable.
    Returns activity stacked over time: (steps, n_features).
    """
    if trace is None:
        trace = Trace(brain, idx=np.arange(brain.n))
    out = []
    for t in range(steps):
        inject = encode(t) if encode is not None else ()
        drive = eye_drive(t) if callable(eye_drive) else eye_drive
        fired = brain.step(eye_drive=drive, inject=inject)
        out.append(trace.observe(fired))
    return np.stack(out)


# ─── best_threshold (from sshfighter/reservoir.py) ──────────────────────────

def best_threshold(y: np.ndarray, s: np.ndarray, beta: float = 0.5) -> float:
    """Threshold on P(profit) maximizing F-beta (precision counts double).

    From sshfighter/reservoir.py: a whiffed attack leaves the fly open, so
    pressing less often but more accurately beats pressing on every chance.
    For trading: false buys lose money, so precision matters more than recall.
    """
    if not (y == 1).any():
        return 0.5
    best, best_f = 0.5, -1.0
    for thr in np.unique(np.round(s, 3)):
        pred = s >= thr
        tp = (pred & (y == 1)).sum()
        if tp == 0:
            continue
        precision, recall = tp / pred.sum(), tp / (y == 1).sum()
        f = (1 + beta ** 2) * precision * recall / (beta ** 2 * precision + recall)
        if f > best_f:
            best, best_f = float(thr), f
    return best


def expit(x: np.ndarray) -> np.ndarray:
    """Sigmoid function (replaces scipy.special.expit)."""
    return 1.0 / (1.0 + np.exp(-np.clip(x, -500, 500)))


def bases_for(X: np.ndarray, ks) -> dict:
    """PCA basis for each k in ks. k=None = no PCA (just standardize)."""
    mu = X.mean(0)
    out, vt = {}, None
    for k in ks:
        if k is None:
            P = np.eye(X.shape[1], dtype=np.float32)
        else:
            if vt is None:
                vt = np.linalg.svd(X - mu, full_matrices=False)[2]
            P = vt[:min(k, len(vt))].T.astype(np.float32)
        sd = ((X - mu) @ P).std(0) + 1e-6
        out[k] = (mu, P, sd)
    return out


def project(basis, X: np.ndarray) -> np.ndarray:
    mu, P, sd = basis
    return ((X - mu) @ P) / sd


def fit_logistic(Z: np.ndarray, y: np.ndarray, lam: float, n_iter: int = 200):
    """L2 logistic regression via gradient descent (replaces scipy.optimize.minimize)."""
    n, d = Z.shape
    w = np.zeros(d + 1, dtype=np.float64)
    lr = 0.1
    for _ in range(n_iter):
        z = Z @ w[:d] + w[d]
        p = expit(z)
        grad_w = Z.T @ (p - y) / n + lam * w[:d]
        grad_b = np.mean(p - y)
        w[:d] -= lr * grad_w
        w[d] -= lr * grad_b
    return w[:d], w[d]


def fit_ridge(Z: np.ndarray, y: np.ndarray, lam: float):
    """Ridge regression (pure numpy)."""
    single = y.ndim == 1
    y2 = y[:, None] if single else y
    zm, ym = Z.mean(0), y2.mean(0)
    Zc = Z - zm
    W = np.linalg.solve(Zc.T @ Zc + lam * len(y2) * np.eye(Z.shape[1]), Zc.T @ (y2 - ym))
    b = ym - zm @ W
    return (W[:, 0], float(b[0])) if single else (W.T, b)


def auc(y: np.ndarray, s: np.ndarray) -> float:
    """Area under the ROC curve."""
    pos, neg = y == 1, y == 0
    if pos.sum() == 0 or neg.sum() == 0:
        return float("nan")
    ranks = np.empty(len(s))
    ranks[np.argsort(s, kind="stable")] = np.arange(1, len(s) + 1)
    return (ranks[pos].sum() - pos.sum() * (pos.sum() + 1) / 2) / (pos.sum() * neg.sum())


def folds(n: int, groups=None, k: int = 5):
    """Cross-validation splits."""
    if groups is not None:
        groups = np.asarray(groups)
        for g in np.unique(groups):
            test = np.flatnonzero(groups == g)
            train = np.flatnonzero(groups != g)
            if len(train):
                yield train, test
    else:
        idx = np.arange(n)
        for part in np.array_split(idx, min(k, n)):
            if len(part) == 0 or len(part) == n:
                continue
            yield np.setdiff1d(idx, part, assume_unique=True), part


class Readout:
    """PCA + linear readout with cross-validated model selection.

    kind="logistic" for binary classification (AUC), "ridge" for regression (MSE).
    """

    def __init__(self, kind: str, basis, w, b, cv_score: float, components, lam):
        self.kind, self.basis, self.w, self.b = kind, basis, w, b
        self.cv_score, self.components, self.lam = cv_score, components, lam

    @classmethod
    def fit(cls, X: np.ndarray, y: np.ndarray, kind: str = "ridge", groups=None,
            components=(5, 20, 60), lambdas=(1e-2, 1e-1, 1.0, 10.0)):
        fit_fn = fit_logistic if kind == "logistic" else fit_ridge
        grid = [(k, lam) for k in components for lam in lambdas]
        scores = {g: [] for g in grid}
        for train, test in folds(len(X), groups):
            Xtr, ytr, Xte, yte = X[train], y[train], X[test], y[test]
            if kind == "logistic" and (ytr.min() == ytr.max() or yte.min() == yte.max()):
                continue
            bases = bases_for(Xtr, components)
            for k, lam in grid:
                w, b = fit_fn(project(bases[k], Xtr), ytr, lam)
                pred = project(bases[k], Xte) @ w + b
                score = auc(yte, expit(pred)) if kind == "logistic" else -np.mean((pred - yte) ** 2)
                if not np.isnan(score):
                    scores[(k, lam)].append(score)
        avg = {g: (float(np.mean(s)) if s else float("-inf")) for g, s in scores.items()}
        if all(v == float("-inf") for v in avg.values()):
            # No valid CV folds — fit on all data with default params
            k, lam = components[0], lambdas[0]
            basis = bases_for(X, [k])[k]
            w, b = fit_fn(project(basis, X), y, lam)
            return cls(kind, basis, w, b, 0.0, k, lam)
        k, lam = max(avg, key=avg.get)
        basis = bases_for(X, [k])[k]
        w, b = fit_fn(project(basis, X), y, lam)
        return cls(kind, basis, w, b, avg[(k, lam)], k, lam)

    def predict(self, x: np.ndarray):
        single = x.ndim == 1
        z = project(self.basis, x[None] if single else x)
        raw = z @ self.w + self.b
        out = expit(raw) if self.kind == "logistic" else raw
        return out[0] if single else out

    def save(self, path: str) -> None:
        np.savez(path, kind=np.array(self.kind), mu=self.basis[0], P=self.basis[1],
                 sd=self.basis[2], w=self.w, b=np.asarray(self.b), cv_score=self.cv_score,
                 components=self.components if self.components is not None else -1, lam=self.lam)

    @classmethod
    def load(cls, path: str) -> "Readout":
        d = np.load(path, allow_pickle=False)
        basis = (d["mu"], d["P"], d["sd"])
        b = d["b"]
        b = float(b) if b.ndim == 0 else b
        components = int(d["components"])
        return cls(str(d["kind"]), basis, d["w"], b, float(d["cv_score"]),
                   None if components < 0 else components, float(d["lam"]))
