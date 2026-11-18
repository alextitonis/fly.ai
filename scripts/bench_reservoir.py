"""Benchmark the fly connectome as a reservoir against controls built from it.

    pip install flybrain scikit-learn          # CPU; the first FlyBrain() downloads ~260 MB once
    python scripts/bench_reservoir.py [--seeds 5] [--digits 600]

Question (issue #52): is the real wiring a better reservoir than random networks of the same
size?  For each task the same brain runs four wirings:

  connectome       the MaleCNS wiring as loaded;
  weight-shuffle   the same neuron pairs, the weight values permuted among them (keeps the
                   connection count and the weight distribution);
  rewired          degree-preserving rewiring: every neuron keeps its in- and out-degree and
                   every presynaptic neuron keeps its weights, but the postsynaptic partners are
                   permuted across all edges (as in notebooks/reservoir.ipynb);
  Erdos-Renyi      the same number of neurons and connections between uniformly random pairs,
                   carrying the connectome's weight values in random order.

Every control's incoming weights are rescaled so each neuron's total input strength matches the
connectome's. Only *who connects to whom* (or with what weight) differs.

Tasks (readouts from flybrain.reservoir; identical input neurons, readout population, trace
settings and seeds for every network):

  memory-capacity  drive 10 fixed ORN types with one i.i.d. scalar per step; a ridge readout
                   over a fixed 2,000-neuron random sample of the whole brain predicts the input
                   1..15 steps back; MC is the sum of squared test correlations (Jaeger 2001).
  digits           the repository's own digit encoding (notebooks/reservoir.ipynb): 53 ORN types
                   each carry one pixel of the sklearn 8x8 digits, 5 steps on / 3 off; the same
                   2,000-neuron sample is read out; ridge one-hot accuracy on a held-out split.
  eye-position     flybrain.eyes: a dark blob at azimuth -0.7 / 0 / +0.7 for 8 of 12 steps; the
                   visual_projection population is read out (the photoreceptors are the input;
                   the Kenyon cells are saturated at rest and carry no signal -- see
                   notebooks/reservoir.ipynb and notebooks/smell.ipynb); 3-class accuracy.

The readout sample excludes the photoreceptors and the task's input ORNs, so no readout reads
its own input channel. Sensory_input=False throughout, as in the repository's olfactory work.
Swapping the weight matrix uses FlyBrain's internal arrays (as notebooks/reservoir.ipynb does);
it is a script trick, not a public API.

Prints one row per task and network: mean +/- sd over --seeds seeds, per-seed values, and the
winner by mean. Whatever the result is, it is the result.
"""
from __future__ import annotations

import argparse
import platform
import sys
import time

import numpy as np
from scipy import sparse

import flybrain
from flybrain import Blob, Eyes, FlyBrain, Readout, Trace, run
from flybrain.reservoir import fit_ridge

SEEDS_DEFAULT = 5
TRACE_TAU = 0.1
NETWORKS = ("connectome", "weight-shuffle", "rewired", "erdos-renyi")


# ---- controls built from the loaded connectome ------------------------------------------------

def match_input_strength(reference_row_strength, W):
    """Rescale every neuron's incoming weights so their |sum| matches the connectome's."""
    W = W.tocsr()
    W.sum_duplicates()
    s = np.asarray(abs(W).sum(1)).ravel()
    scale = np.divide(reference_row_strength, s, out=np.zeros_like(s), where=s > 0)
    W = sparse.diags(scale.astype(np.float32)) @ W
    W.eliminate_zeros()
    return W.tocsr()


def control_wirings(original, seed):
    """The three controls, plus the connectome itself, as CSR matrices for one seed."""
    row_strength = np.asarray(abs(original).sum(1)).ravel()
    coo = original.tocoo()

    data = np.random.default_rng(seed).permutation(coo.data)
    weight_shuffle = match_input_strength(
        row_strength, sparse.coo_matrix((data, (coo.row, coo.col)), shape=original.shape))

    rng = np.random.default_rng(seed + 10_000)
    post = rng.permutation(coo.row)
    rewired = match_input_strength(
        row_strength, sparse.coo_matrix((coo.data, (post, coo.col)), shape=original.shape))

    m = original.nnz
    pre, post = rng.integers(0, original.shape[0], m), rng.integers(0, original.shape[0], m)
    erdos = match_input_strength(
        row_strength, sparse.coo_matrix((rng.permutation(original.data), (post, pre)),
                                        shape=original.shape))
    return {"connectome": original, "weight-shuffle": weight_shuffle,
            "rewired": rewired, "erdos-renyi": erdos}


def use_weights(brain, W):
    """Point the brain at weight matrix W (rows = postsynaptic). FlyBrain internals."""
    W = W.tocsr().astype(np.float32)
    W.sort_indices()
    csc = W.tocsc()
    brain.indptr, brain.indices, brain.weights = csc.indptr, csc.indices, csc.data


# ---- tasks ------------------------------------------------------------------------------------

def memory_capacity(brain, W, seed, inject_idx, readout_idx, amount=0.5,
                    washout=100, train=400, test=200, delays=range(1, 16)):
    """MC: sum over d of squared test correlation between the readout's prediction of the
    input d steps ago and the actual input (Jaeger 2001)."""
    use_weights(brain, W)
    rng = np.random.default_rng(seed)
    u = rng.random(washout + train + test)
    brain.reset(seed)
    trace = Trace(brain, idx=readout_idx, tau=TRACE_TAU)
    X = np.empty((len(u), len(readout_idx)), np.float32)
    for t in range(len(u)):
        X[t] = trace.observe(brain.step(inject=[(inject_idx, amount * u[t])]))
    Xw = X[washout:]
    mc = 0.0
    for d in delays:
        y = u[washout + d: washout + d + train + test - d]
        Xd = Xw[: train + test - d]
        w, b = fit_ridge(Xd[:train], y[:train], lam=1.0)
        pred = Xd[train:] @ w + b
        mc += float(np.corrcoef(pred, y[train:])[0, 1]) ** 2
    return mc


def digit_task(brain, W, seed, images, labels, pixels, inject_cells, readout_idx,
               on_steps=5, off_steps=3, amount=0.5, frac=0.75):
    """The repository's digit encoding (notebooks/reservoir.ipynb), read out over the whole-brain
    sample instead of the saturated Kenyon cells. Held-out one-hot ridge accuracy."""
    use_weights(brain, W)
    slot = on_steps + off_steps
    n = len(labels)

    def encode(t):
        i, within = divmod(t, slot)
        if within >= on_steps:
            return ()
        x = images[i, pixels]
        return [(inject_cells[k], amount * x[k]) for k in np.flatnonzero(x > 0)]

    brain.reset(seed)
    for _ in range(50):                                  # 1 s to settle from silence
        brain.step()
    trace = Trace(brain, idx=readout_idx, tau=TRACE_TAU)
    act = run(brain, n * slot, encode=encode, trace=trace)
    X = act[np.arange(n) * slot + slot - 1]              # read at the end of each digit's slot

    rng = np.random.default_rng(seed + 5_000)
    train = np.concatenate([rng.permutation(np.flatnonzero(labels == c))[: int(frac * (labels == c).sum())]
                            for c in range(10)])
    test = np.setdiff1d(np.arange(n), train)
    r = Readout.fit(X[train], np.eye(10)[labels[train]], kind="ridge",
                    components=(20, 60, 200), lambdas=(1e-3, 1e-2, 1e-1, 1.0))
    return float((np.atleast_2d(r.predict(X[test])).argmax(1) == labels[test]).mean())


def eye_position_task(brain, W, seed, azimuth, readout_idx, n_slots=180,
                      slot=12, on_steps=8, half_width=0.15, frac=0.75):
    """flybrain.eyes route: a dark blob at azimuth -0.7 (L), 0.0 (C) or +0.7 (R), on for 8 of
    12 steps; 3-class accuracy from a ridge readout over `readout_idx`. Features are raw
    spike indicators at each slot's end: the readouts (Readout, fit_ridge) are
    flybrain.reservoir's, but a decaying Trace over this population saturates on the
    connectome and hides the signal, so the slot's own spikes are used instead."""
    use_weights(brain, W)
    centers = [-0.7, 0.0, 0.7]
    seq = np.random.default_rng(seed + 2_000).permutation(np.repeat(np.arange(3), n_slots // 3))
    eyes = Eyes(azimuth)
    slot_of = np.full(brain.n, -1, np.int64)
    slot_of[readout_idx] = np.arange(len(readout_idx))
    brain.reset(seed)
    X = np.zeros((len(seq), len(readout_idx)), np.float32)
    for t in range(len(seq) * slot):
        on = (t % slot) < on_steps
        center = centers[seq[t // slot]]
        drive = eyes.drive([Blob(center=center, half_width=half_width, darkness=1.0)] if on else [])
        fired = brain.step(eye_drive=drive)
        if t % slot == slot - 2:                            # read at the end of each slot
            h = slot_of[fired]
            X[t // slot, h[h >= 0]] = 1.0
    y = seq
    rng = np.random.default_rng(seed + 7_000)
    train = np.concatenate([rng.permutation(np.flatnonzero(y == c))[: int(frac * (y == c).sum())]
                            for c in range(3)])
    test = np.setdiff1d(np.arange(len(y)), train)
    r = Readout.fit(X[train], np.eye(3)[y[train]], kind="ridge",
                    components=(20, 60), lambdas=(1e-3, 1e-2, 1e-1, 1.0))
    return float((np.atleast_2d(r.predict(X[test])).argmax(1) == y[test]).mean())


# ---- driver -----------------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seeds", type=int, default=SEEDS_DEFAULT, help="seeds 0..N-1 per network")
    ap.add_argument("--digits", type=int, default=600, help="digit images (of 1797) per run")
    ap.add_argument("--tasks", default="all", help="comma list of: memory-capacity,digits,eye-position")
    args = ap.parse_args()
    seeds = list(range(args.seeds))
    wanted = None if args.tasks == "all" else {t.strip() for t in args.tasks.split(",")}

    brain = FlyBrain(device="cpu", sensory_input=False)
    ct = brain.cell_type.astype(str)
    n = brain.n
    print(f"flybrain {flybrain.__version__}, {n:,} neurons, {platform.system()} "
          f"({platform.machine()}), python {platform.python_version()}", file=sys.stderr)

    # shared plumbing: the connectome matrix, the fixed input neurons, the fixed readout sample
    original = sparse.csc_matrix((brain.weights, brain.indices, brain.indptr), shape=(n, n)).tocsr()
    orn_types = sorted(np.unique(ct[np.char.startswith(ct, "ORN_")]))
    mc_orn = brain.cells(orn_types[:10])                     # input for memory-capacity
    excluded = np.zeros(n, bool)
    excluded[brain.visual] = True                            # photoreceptors: the eyes task's input
    excluded[mc_orn] = True
    sample = np.sort(np.random.default_rng(0).permutation(np.flatnonzero(~excluded))[:2000])
    print(f"readout sample: {len(sample)} neurons (fixed, excludes photoreceptors and the MC input ORNs)",
          file=sys.stderr)

    # digits: the repository's own encoding, fixed once (not per seed)
    from sklearn.datasets import load_digits
    digits = load_digits()
    order = np.random.default_rng(1234).permutation(len(digits.target))
    images, labels = digits.data[order][: args.digits] / 16.0, digits.target[order][: args.digits]
    train0 = np.concatenate([np.random.default_rng(0).permutation(np.flatnonzero(labels == c))
                             [: int(0.75 * (labels == c).sum())] for c in range(10)])
    pixels = np.sort(np.argsort(-images[train0].var(0))[: len(orn_types)])
    inject_cells = [brain.cells([t]) for t in np.random.default_rng(0).permutation(orn_types)]
    print(f"digits: {len(labels)} images, {len(pixels)} of 64 pixels -> {len(orn_types)} ORN types",
          file=sys.stderr)

    vp = brain.cells(["visual_projection"])                  # readout for the eyes task
    print(f"eye-position readout: {len(vp)} visual_projection neurons", file=sys.stderr)

    tasks = {
        "memory-capacity": lambda W, seed: memory_capacity(brain, W, seed, mc_orn, sample),
        "digits": lambda W, seed: digit_task(brain, W, seed, images, labels, pixels,
                                             inject_cells, sample),
        "eye-position": lambda W, seed: eye_position_task(brain, W, seed, brain.azimuth, vp),
    }

    results = {task: {net: [] for net in NETWORKS} for task in tasks if wanted is None or task in wanted}
    for seed in seeds:                                     # controls are built once per seed
        wirings = control_wirings(original, seed)
        for task, run_task in tasks.items():
            if wanted is not None and task not in wanted:
                continue
            for net in NETWORKS:
                t0 = time.time()
                results[task][net].append(run_task(wirings[net], seed))
                print(f"  {task:16s} {net:14s} seed {seed}: "
                      f"{results[task][net][-1]:.3f} ({time.time() - t0:.0f} s)", file=sys.stderr)
        del wirings
    use_weights(brain, original)                           # leave the brain as we found it

    print("\nflybrain reservoir benchmark: mean +/- sd over "
          f"{len(seeds)} seeds (seeds 0..{seeds[-1]})\n")
    header = f"| task | {' | '.join(NETWORKS)} | winner |"
    print(header)
    print("|" + "---|" * (header.count("|") - 1))
    for task, nets in results.items():
        cells = []
        for net in NETWORKS:
            a = np.array(nets[net])
            cells.append(f"{a.mean():.3f} ± {a.std(ddof=1):.3f}")
        means = {net: float(np.mean(nets[net])) for net in NETWORKS}
        winner = max(means, key=means.get)
        print(f"| {task} | " + " | ".join(cells) + f" | {winner} |")
    print()
    for task, nets in results.items():
        print(f"{task}:")
        for net in NETWORKS:
            print(f"  {net:14s} " + " ".join(f"{v:.3f}" for v in nets[net]))


if __name__ == "__main__":
    main()
