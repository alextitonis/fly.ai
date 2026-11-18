"""Benchmark the fly connectome as a reservoir against controls built from it.

    pip install flybrain scikit-learn          # CPU; the first FlyBrain() downloads ~260 MB once
    python scripts/bench_reservoir.py [--seeds 5] [--digits 600]

Question (issue #52): is the real wiring a better reservoir than random networks of the same
size?  For each task the same brain runs four wirings:

  connectome       the MaleCNS wiring as loaded;
  weight-shuffle   the same neuron pairs, the weight values permuted among them (keeps the
                   connection count and the weight distribution);
  rewired          degree-preserving rewiring: every presynaptic neuron keeps its weights and
                   every neuron keeps its in-degree (the postsynaptic targets are permuted
                   across all edges, as in notebooks/reservoir.ipynb), with the few target
                   collisions this creates redrawn;
  Erdos-Renyi      the same number of connections between uniformly random pairs, carrying the
                   connectome's weight values in random order.

All three controls are edge-matched: each has exactly the connectome's number of connections,
no self-loops and no duplicate pairs. Erdos-Renyi draws postsynaptic targets only among the rows
the connectome itself delivers input to -- with sensory_input=False the loaded matrix has no
synapse onto sensory rows, so a control edge landing there would be scaled to 0 and vanish; the
script prints nnz per network so the edge counts are checked on every run. Every control's
incoming weights are also rescaled so each neuron's total input strength matches the
connectome's. Only *who connects to whom* (or with what weight) differs.

Tasks (readouts from flybrain.reservoir; identical input neurons, readout population, trace
settings and seeds for every network):

  digits           the repository's own digit encoding (notebooks/reservoir.ipynb): 53 ORN types
                    each carry one pixel of the sklearn 8x8 digits, 5 steps on / 3 off; the same
                    2,000-neuron sample is read out; ridge one-hot accuracy on a held-out split.
  eye-position     flybrain.eyes: a dark blob at azimuth -0.7 / 0 / +0.7 for 8 of 12 steps; the
                    visual_projection population is read out (the photoreceptors are the input;
                    the Kenyon cells are saturated at rest and carry no signal -- see
                    notebooks/reservoir.ipynb); 3-class accuracy.

A Jaeger memory-capacity task was tried and dropped: with 200 test samples and delays 1..15
the chance level for the summed squared test correlation is about 0.079, every wiring scored
0.069-0.106 -- at or barely above chance -- and no wiring difference held across seeds
(Erdos-Renyi best on only 3/5 seeds; seed 0: connectome 0.165). The script ships the two
tasks that do separate the wirings.

The digit readout sample excludes the photoreceptors and ten fixed ORN types; the eye task
reads the visual_projection population, which contains no photoreceptors, so no eye readout
reads its own input channel. Sensory_input=False throughout, as in the repository's olfactory
work. Swapping the weight matrix uses FlyBrain's internal arrays (as notebooks/reservoir.ipynb
does); it is a script trick, not a public API.

Prints one row per task and network: mean +/- sd over --seeds seeds, per-seed values, the
winner by mean, and nnz per network per seed. Whatever the result is, it is the result.
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


def redraw_collisions(post, col, n, rng):
    """Swap postsynaptic targets between entries until every (target, presynaptic) pair is
    unique. Each applied swap exchanges the targets of two distinct entries, so the multiset
    of targets -- and with it every neuron's in-degree -- is preserved exactly."""
    while True:
        key = post.astype(np.int64) * n + col
        _, first, inv, counts = np.unique(key, return_index=True, return_inverse=True,
                                          return_counts=True)
        is_first = np.zeros(len(key), bool)
        is_first[first] = True
        orphans = np.flatnonzero((counts[inv] > 1) & ~is_first)
        if not orphans.size:
            return post
        partners = rng.integers(0, len(post), orphans.size)
        _, pfirst, _, pcounts = np.unique(partners, return_index=True,
                                          return_inverse=True, return_counts=True)
        p_is_first = np.zeros(len(partners), bool)
        p_is_first[pfirst] = True
        clean = p_is_first & ~np.isin(partners, orphans)
        o, p = orphans[clean], partners[clean]
        swapped = post[p]
        post[p] = post[o]
        post[o] = swapped


def random_pairs(rng, m, n, receivers):
    """m unique (postsynaptic, presynaptic) pairs, postsynaptic among `receivers`, no
    self-loops. Draws in batches, rejecting the rare collisions, so the count is exact."""
    keys = np.empty(0, np.int64)
    while True:
        need = m - keys.size
        batch = need + max(64, need // 8)
        post = receivers[rng.integers(0, receivers.size, batch)]
        pre = rng.integers(0, n, batch)
        keep = post != pre
        keys = np.unique(np.concatenate([keys, post[keep].astype(np.int64) * n + pre[keep]]))
        if keys.size >= m:
            if keys.size > m:
                keys = keys[rng.permutation(keys.size)[:m]]
            return keys // n, keys % n


def control_wirings(original, seed):
    """The three controls, plus the connectome itself, as CSR matrices for one seed.
    Every control has exactly the connectome's nnz, with no self-loops or duplicates."""
    n, m = original.shape[0], original.nnz
    row_strength = np.asarray(abs(original).sum(1)).ravel()
    receivers = np.flatnonzero(row_strength > 0)   # rows the connectome delivers input to
    coo = original.tocoo()

    data = np.random.default_rng(seed).permutation(coo.data)
    weight_shuffle = match_input_strength(
        row_strength, sparse.coo_matrix((data, (coo.row, coo.col)), shape=original.shape))

    rng = np.random.default_rng(seed + 10_000)
    post = redraw_collisions(rng.permutation(coo.row), coo.col, n, rng)
    rewired = match_input_strength(
        row_strength, sparse.coo_matrix((coo.data, (post, coo.col)), shape=original.shape))

    post, pre = random_pairs(rng, m, n, receivers)
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
    spike indicators read two steps after the blob turns off (step 10 of 12) -- of the three
    read steps probed (last on-step, two-after-offset, last step of the slot), this one
    separates the wirings most cleanly. The readouts (Readout, fit_ridge) are
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
        if t % slot == slot - 2:      # read 2 steps after the blob turns off (see docstring)
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
    ap.add_argument("--tasks", default="all", help="comma list of: digits,eye-position")
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
    kept_out = brain.cells(orn_types[:10])        # ten ORN types stay out of the readout sample
    excluded = np.zeros(n, bool)
    excluded[brain.visual] = True                            # photoreceptors: the eyes task's input
    excluded[kept_out] = True
    sample = np.sort(np.random.default_rng(0).permutation(np.flatnonzero(~excluded))[:2000])
    print(f"readout sample: {len(sample)} neurons (fixed, excludes photoreceptors and "
          f"{len(kept_out)} neurons of {len(orn_types[:10])} ORN types)", file=sys.stderr)

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
        "digits": lambda W, seed: digit_task(brain, W, seed, images, labels, pixels,
                                            inject_cells, sample),
        "eye-position": lambda W, seed: eye_position_task(brain, W, seed, brain.azimuth, vp),
    }

    results = {task: {net: [] for net in NETWORKS} for task in tasks if wanted is None or task in wanted}
    for seed in seeds:                                     # controls are built once per seed
        wirings = control_wirings(original, seed)
        print(f"seed {seed} nnz: " + ", ".join(f"{net} {wirings[net].nnz:,}" for net in NETWORKS),
              file=sys.stderr)
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
