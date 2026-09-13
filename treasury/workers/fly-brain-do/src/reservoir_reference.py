"""Reservoir computing on the fly connectome, for SSH Fighter specifically.

This is a worked example of `flyreservoir.py` (the generic module, one level up):
the brain stays fixed, only linear readouts are trained, from the ~1,300
descending neurons (the brain's output cables to the body):
  * punch / kick: P(this press connects)
  * movement: predicted HP swing (damage dealt - damage taken, next second)
    for moving away (= block), standing, or moving toward the opponent.

Labels come from the fly's own experience: while recording it presses punch/kick
at random and holds random moves half the time. The readout first compresses
descending-neuron activity to its top principal components (activity driven by
what the fly sees shows up there; independent noise mostly doesn't), then fits a
regularised linear model. Everything is scored leave-one-match-out.

Everything game-specific lives here (what a "sample" is, leave-one-*match*-out,
the F-beta press threshold); the shared PCA/ridge/logistic machinery underneath
it is `flyreservoir.bases_for/project/fit_logistic/auc`, and the spike-trace
feature (`Featurizer`) is `flyreservoir.Trace` over the descending neurons.

    python fly_fighter.py --user FLYBRAIN --identity KEY --opponents bots --matches 20 --record recordings
    python reservoir.py train recordings          # held-out report + readout.npz
    python fly_fighter.py --user FLYBRAIN --identity KEY --opponents bots --matches 6 --readout readout.npz
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np
from scipy.special import expit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # the fly.ai core lives one level up
from flyreservoir import Trace, auc, bases_for, fit_logistic, fit_ridge, project  # noqa: E402

TRACE_TAU = 0.1       # s; each descending neuron's spike trace decays with this time constant
HORIZON = 15          # frames (0.5 s) after a press to see whether the attack connected
ACTIONS = ("punch", "kick")
EXPLORE_P = {"punch": 0.07, "kick": 0.035}   # per actionable frame while recording
MOVES = (-1, 0, 1)    # relative to the opponent: away (= block), stand, toward
MOVE_HOLD = 10        # frames each movement decision is held
MOVE_EXPLORE = 0.5    # fraction of holds that are random while recording
MOVE_HORIZON = 30     # frames (1 s) over which a move is scored: damage dealt - damage taken
COMPONENTS = (5, 20, 60)             # principal components of descending-neuron activity
LAMBDAS = (1e-2, 1e-1, 1.0, 10.0)    # L2 strength
# Melee range in world units: SSH Fighter src/game/engine.ts ATTACKS.punch/kick
# `range` (same values as alextitonis/ai-model worldsim/streetfighter_features.py
# MELEE_RANGE). Used only as a comparison baseline: "press when in reach".
MELEE_RANGE = {"punch": 30.0, "kick": 42.0}
COLS = ["frame", "you_x", "opp_x", "you_hp", "opp_hp", "actionable", "connected",
        "punch", "kick", "fight", "facing", "opp_hitbox", "round", "move_rel", "move_start", "opp_attacking"]
C = {c: i for i, c in enumerate(COLS)}


class Featurizer(Trace):
    """Exponentially decaying spike trace of every descending neuron, averaged
    across the (possibly several, voting) flies. A thin, task-specific alias of
    `flyreservoir.Trace`."""

    def __init__(self, brain):
        if brain.superclass is None:
            raise SystemExit("brain.npz has no superclass; rerun build_brain.py")
        super().__init__(brain, types=["descending_neuron"], tau=TRACE_TAU, aggregate="mean")


class Recorder:
    """Brain features + game outcome for every frame of one match. The full game
    state of every frame also goes to <mid>.states.jsonl.gz, so matches can be
    replayed through the brain later with different encoders."""

    def __init__(self, folder: str | Path, mid: str):
        self.path = Path(folder) / f"{mid}.npz"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.X, self.rows, self.attack = [], [], []
        self.states = gzip.open(self.path.with_suffix(".states.jsonl.gz"), "wt", encoding="utf-8")

    def add(self, state: dict, cmd: dict, features: np.ndarray, move_rel: int = 0, move_start: bool = False,
            jump_random: bool = False) -> None:
        self.states.write(json.dumps({"state": state, "cmd": {k: v for k, v in cmd.items() if k != "t"},
                                      "jump_random": jump_random}) + "\n")
        you, opp = state.get("you") or {}, state.get("opp") or {}
        self.X.append(features.astype(np.float16))
        self.rows.append([state.get("frame", 0), you.get("x", 0), opp.get("x", 0), you.get("hp", 0), opp.get("hp", 0),
                          bool(you.get("actionable")), bool(you.get("attackConnected")),
                          bool(cmd.get("punch")), bool(cmd.get("kick")), state.get("phase") == "fight",
                          you.get("facing", 1), bool(opp.get("hitboxActive")), state.get("round", 0),
                          move_rel, bool(move_start),
                          bool(opp.get("hitboxActive") or opp.get("movePhase") in ("startup", "active"))])
        self.attack.append(str(you.get("attack", "none")))

    def save(self) -> None:
        self.states.close()
        if not self.X:
            return
        np.savez_compressed(self.path, X=np.stack(self.X), rows=np.asarray(self.rows, np.float32),
                            attack=np.asarray(self.attack))
        print(f"\nrecorded {len(self.X)} frames -> {self.path}")


class Readout:
    """Trained linear readouts from descending-neuron traces."""

    def __init__(self, path: str | Path):
        d = np.load(path)
        self.models = {a: ((d[f"{a}_mu"], d[f"{a}_P"], d[f"{a}_sd"]), d[f"{a}_w"], float(d[f"{a}_b"]),
                           float(d[f"{a}_thr"]))
                       for a in ACTIONS if f"{a}_w" in d.files}
        self.move = ((d["move_mu"], d["move_P"], d["move_sd"]), d["move_w"], d["move_b"]) if "move_w" in d.files else None

    def probabilities(self, x: np.ndarray) -> dict[str, float]:
        return {a: float(expit(project(basis, x[None])[0] @ w + b)) for a, (basis, w, b, _) in self.models.items()}

    def choose(self, x: np.ndarray) -> str | None:
        p = self.probabilities(x)
        best = max(p, key=p.get, default=None)
        return best if best and p[best] >= self.models[best][3] else None

    @property
    def has_move(self) -> bool:
        return self.move is not None

    def choose_move(self, x: np.ndarray) -> int:
        """-1 away, 0 still, +1 toward: the move with the highest predicted HP swing."""
        basis, W, b = self.move
        return MOVES[int(np.argmax(W @ project(basis, x[None])[0] + b))]


# ---- training: attacks ------------------------------------------------------------------

def press_samples(path: Path, action: str):
    """Each actionable press of `action` -> (brain features, distance, connected?)."""
    d = np.load(path)
    X, R, attack = d["X"].astype(np.float32), d["rows"], d["attack"]
    any_press = (R[:, C["punch"]] > 0) | (R[:, C["kick"]] > 0)
    ok = (R[:, C[action]] > 0) & (R[:, C["actionable"]] > 0) & (R[:, C["fight"]] > 0)
    xs, dist, ys = [], [], []
    for t in np.flatnonzero(ok):
        end = min(len(R), t + 1 + HORIZON)
        later = np.flatnonzero(any_press[t + 1:end])
        if len(later):
            end = t + 1 + later[0]                  # stop at the next press
        window = slice(t + 1, end)
        if not (attack[window] != "none").any():   # the game ignored this press
            continue
        xs.append(X[t])
        dist.append(abs(R[t, C["opp_x"]] - R[t, C["you_x"]]))
        ys.append(float((R[window, C["connected"]] > 0).any()))
    return np.asarray(xs, np.float32).reshape(-1, X.shape[1]), np.asarray(dist, np.float32), np.asarray(ys)


def distance_features(dist):
    return np.column_stack((dist, dist ** 2 / 100, 10 / (dist + 5)))


def folds(per_match):
    """Leave-one-match-out splits. Index 2 of every sample tuple is the label/reward."""
    for k in range(len(per_match)):
        train = [m for j, m in enumerate(per_match) if j != k and len(m[2])]
        if len(per_match[k][2]) and train:
            yield train, per_match[k]


def cv_attack(per_match, featurize, grid):
    """{(k, lam): (AUC averaged over held-out matches, pooled scores, pooled labels)}.
    AUC is computed within each held-out match: pooling scores across folds mixes each
    fold's intercept with that match's hit rate and can push a weak signal below chance."""
    acc = {g: ([], [], [], []) for g in grid}
    for train, test in folds(per_match):
        Xtr = np.concatenate([featurize(m) for m in train])
        ytr = np.concatenate([m[2] for m in train])
        if ytr.min() == ytr.max():
            continue
        Xte = featurize(test)
        bases = bases_for(Xtr, {k for k, _ in grid})
        for k, lam in grid:
            w, b = fit_logistic(project(bases[k], Xtr), ytr, lam)
            s = expit(project(bases[k], Xte) @ w + b)
            scores, labels, aucs, weights = acc[(k, lam)]
            scores.append(s)
            labels.append(test[2])
            a = auc(test[2], s)
            if not np.isnan(a):
                aucs.append(a)
                weights.append(len(s))
    out = {}
    for g, (scores, labels, aucs, weights) in acc.items():
        mean = float(np.average(aucs, weights=weights)) if aucs else float("nan")
        out[g] = (mean, np.concatenate(scores) if scores else np.array([]),
                  np.concatenate(labels) if labels else np.array([]))
    return out


def best_threshold(y, s, beta: float = 0.5):
    """Threshold on P(hit) maximising F-beta with beta=0.5 (precision counts double) on
    held-out predictions. A whiffed attack leaves the fly open, so pressing less often
    but more accurately beats pressing on every chance (which F1 and Youden's J favour
    when hits are rare)."""
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


def pick(results):
    return max(results, key=lambda g: np.nan_to_num(results[g][0], nan=-1e9))


def train_attacks(files, dn_types, saved: dict) -> None:
    brain_grid = [(k, lam) for k in COMPONENTS for lam in LAMBDAS]
    game_grid = [(None, lam) for lam in LAMBDAS]
    for action in ACTIONS:
        per_match = [press_samples(f, action) for f in files]
        y_all = np.concatenate([m[2] for m in per_match])
        if len(y_all) < 30 or y_all.sum() < 5:
            print(f"\n{action}: only {len(y_all)} presses / {int(y_all.sum())} hits, not enough to train")
            continue
        print(f"\n{action}: {len(y_all)} presses, {int(y_all.sum())} connected ({y_all.mean():.0%} base rate)")
        brain = cv_attack(per_match, lambda m: m[0], brain_grid)
        g = pick(brain)
        brain_auc, s, y = brain[g]
        game = cv_attack(per_match, lambda m: distance_features(m[1]), game_grid)
        print(f"  held-out AUC   brain readout:          {brain_auc:.3f}   ({g[0]} components, lambda {g[1]:g})")
        print(f"                 distance-only baseline: {game[pick(game)][0]:.3f}")
        print(f"                 chance:                 0.500")
        thr = best_threshold(y, s)
        pressed = s >= thr
        lift = y[pressed].mean() / max(y.mean(), 1e-9) if pressed.any() else 0.0
        if pressed.any():
            print(f"  readout at P>={thr:.2f}: presses on {pressed.mean():.0%} of these moments; "
                  f"{y[pressed].mean():.0%} of those connect (vs {y.mean():.0%} at random)")
        d_all = np.concatenate([m[1] for m in per_match])
        in_reach = d_all <= MELEE_RANGE[action]
        if in_reach.any():
            print(f"  reach rule (dist <= {MELEE_RANGE[action]:.0f}): presses on {in_reach.mean():.0%}; "
                  f"{y_all[in_reach].mean():.0%} of those connect")
        X_all = np.concatenate([m[0] for m in per_match])
        basis = bases_for(X_all, [g[0]])[g[0]]
        w, b = fit_logistic(project(basis, X_all), y_all, g[1])
        per_dn = basis[1] @ (w / basis[2])                 # weight of each descending neuron
        top = np.argsort(-np.abs(per_dn))[:6]
        print("  most influential neurons: " + ", ".join(f"{dn_types[i]} {per_dn[i]:+.3f}" for i in top))
        if lift < 1.2:
            print(f"  -> not used in play: presses chosen by this readout connect no more often than random ones")
            continue
        saved.update({f"{action}_mu": basis[0], f"{action}_P": basis[1], f"{action}_sd": basis[2],
                      f"{action}_w": w, f"{action}_b": b, f"{action}_thr": thr, f"{action}_auc": brain_auc})


# ---- training: movement -----------------------------------------------------------------

def move_samples(path: Path):
    """Each random movement hold -> (brain features, move, HP swing over 1 s, game-state features)."""
    d = np.load(path)
    X, R = d["X"].astype(np.float32), d["rows"]
    xs, acts, rewards, game = [], [], [], []
    for t in np.flatnonzero((R[:, C["move_start"]] > 0) & (R[:, C["fight"]] > 0)):
        e = t + MOVE_HORIZON
        if e >= len(R):
            continue
        seg = slice(t, e + 1)
        if (R[seg, C["round"]] != R[t, C["round"]]).any() or (R[seg, C["fight"]] == 0).any():
            continue
        rewards.append((R[t, C["opp_hp"]] - R[e, C["opp_hp"]]) - (R[t, C["you_hp"]] - R[e, C["you_hp"]]))
        xs.append(X[t])
        acts.append(int(R[t, C["move_rel"]]))
        dist = abs(R[t, C["opp_x"]] - R[t, C["you_x"]])
        game.append([dist, dist ** 2 / 100, 10 / (dist + 5), R[t, C["opp_attacking"]]])
    return (np.asarray(xs, np.float32).reshape(-1, X.shape[1]), np.asarray(acts),
            np.asarray(rewards, np.float32), np.asarray(game, np.float32).reshape(-1, 4))


def fit_moves(Z, acts, r, lam):
    """Ridge regression per move: predicted HP swing from projected features."""
    W, b = np.zeros((len(MOVES), Z.shape[1])), np.zeros(len(MOVES))
    for i, move in enumerate(MOVES):
        sel = acts == move
        if sel.sum() < 5:
            b[i] = r.mean()
            continue
        W[i], b[i] = fit_ridge(Z[sel], r[sel], lam)
    return W, b


def cv_moves(per_match, featurize, grid):
    """{(k, lam): (value, rewards)} for the greedy policy, leave-one-match-out.
    Exploration moves were uniformly random, so the mean reward of held-out holds where
    the random move equals the policy's choice is an unbiased estimate of its value."""
    chosen = {g: [] for g in grid}
    for train, test in folds(per_match):
        Xtr = np.concatenate([featurize(m) for m in train])
        atr = np.concatenate([m[1] for m in train])
        rtr = np.concatenate([m[2] for m in train])
        Xte = featurize(test)
        bases = bases_for(Xtr, {k for k, _ in grid})
        for k, lam in grid:
            W, b = fit_moves(project(bases[k], Xtr), atr, rtr, lam)
            greedy = np.asarray(MOVES)[np.argmax(project(bases[k], Xte) @ W.T + b, axis=1)]
            chosen[(k, lam)].append(test[2][test[1] == greedy])
    out = {}
    for g, parts in chosen.items():
        v = np.concatenate(parts) if parts else np.array([])
        out[g] = (float(v.mean()) if len(v) else float("nan"), v)
    return out


def fmt(values) -> str:
    if not len(values):
        return "   n/a"
    return f"{values.mean():+6.2f} +/- {values.std(ddof=1) / np.sqrt(len(values)):.2f}  (n={len(values)})"


def train_moves(files, saved: dict) -> None:
    per_match = [move_samples(f) for f in files]
    acts = np.concatenate([m[1] for m in per_match])
    r = np.concatenate([m[2] for m in per_match])
    if len(r) < 60:
        print(f"\nmovement: only {len(r)} random holds, not enough to train")
        return
    print(f"\nmovement: {len(r)} random 1 s holds; value = damage dealt - damage taken in the next second")
    for move, name in zip(MOVES, ("always away (block)", "always stand still", "always toward")):
        print(f"  {name:28s} {fmt(r[acts == move])}")
    print(f"  {'random':28s} {fmt(r)}")
    brain = cv_moves(per_match, lambda m: m[0], [(k, lam) for k in COMPONENTS for lam in LAMBDAS])
    g = pick(brain)
    game = cv_moves(per_match, lambda m: m[3], [(None, lam) for lam in LAMBDAS])
    print(f"  {'brain readout (held-out)':28s} {fmt(brain[g][1])}   {g[0]} components, lambda {g[1]:g}")
    print(f"  {'game-state rule (held-out)':28s} {fmt(game[pick(game)][1])}   distance + opponent attacking")
    X_all = np.concatenate([m[0] for m in per_match])
    basis = bases_for(X_all, [g[0]])[g[0]]
    W, b = fit_moves(project(basis, X_all), acts, r, g[1])
    saved.update({"move_mu": basis[0], "move_P": basis[1], "move_sd": basis[2], "move_w": W, "move_b": b,
                  "move_value": brain[g][0]})


def train(folder: str, out: str = "readout.npz") -> None:
    files = [f for f in sorted(Path(folder).glob("*.npz")) if "rows" in np.load(f).files]  # skip e.g. readout.npz
    if len(files) < 3:
        sys.exit(f"need at least 3 recorded matches in {folder}, found {len(files)}")
    if np.load(files[0])["rows"].shape[1] != len(COLS):
        sys.exit(f"{files[0].name} was recorded with an older format; record a new set")
    from fly_brain import DATA
    meta = np.load(DATA / "brain.npz")
    dn_types = meta["cell_type"][meta["superclass"] == "descending_neuron"]
    width = np.load(files[0])["X"].shape[1]
    if width != len(dn_types):
        sys.exit(f"recordings have {width} features but the network has {len(dn_types)} descending neurons; "
                 "they were recorded with a different build")
    print(f"{len(files)} matches, readout over {width:,} descending neurons")
    saved = {}
    train_attacks(files, dn_types, saved)
    train_moves(files, saved)
    if saved:
        np.savez(out, **saved)
        print(f"\nsaved {out}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "train":
        train(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "readout.npz")
    else:
        print(__doc__)
