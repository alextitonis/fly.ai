"""Benchmark the fly connectome as a reservoir against controls built from it.

    pip install flybrain scikit-learn          # CPU; the first FlyBrain() downloads ~260 MB once
    python scripts/bench_reservoir.py [--seeds 5] [--digits 600]

Question (issue #52): is the real wiring a better reservoir than random networks of the same
size?  For each task the same brain runs four wirings:

  connectome       the MaleCNS wiring as loaded (it has self-loops);
  weight-shuffle   the same neuron pairs, the weight values permuted among them (keeps the
                   connection count, the weight distribution, and the connectome's self-loops);
  rewired          degree-preserving rewiring: every presynaptic neuron keeps its weights and
                   every neuron keeps its in-degree (postsynaptic targets are permuted across
                   all edges, as in notebooks/reservoir.ipynb). Duplicate pairs and self-loops
                   are removed by swapping targets, which preserves in-degree, so this graph
                   has no self-loops;
  Erdos-Renyi      the same number of connections between uniformly random pairs, carrying the
                   connectome's weight values in random order. No self-loops, no duplicate pairs.

All three controls are edge-matched: each has exactly the connectome's number of connections
and no duplicate pairs. Only the rewired graph and Erdos-Renyi are loop-free. Weight-shuffle
keeps the connectome's pairs, self-loops included. Erdos-Renyi draws postsynaptic targets only
among the rows the connectome itself delivers input to -- with sensory_input=False the loaded
matrix has no synapse onto sensory rows, so a control edge landing there would be scaled to 0
and vanish. The script prints nnz and the self-loop count per network on every seed. Every
control's incoming weights are rescaled so each neuron's total input strength matches the
connectome's. Only *who connects to whom* (or with what weight) differs.

Tasks (readouts from flybrain.reservoir; identical input neurons, readout population, trace
settings and seeds for every network):

  digits           the repository's own digit encoding (notebooks/reservoir.ipynb): 53 ORN types
                    each carry one pixel of the sklearn 8x8 digits, 5 steps on / 3 off; the same
                    2,000-neuron sample is read out; ridge one-hot accuracy on a held-out split.
  eye-position     flybrain.eyes: a dark blob at azimuth -0.7 / 0 / +0.7 for 8 of 12 steps; the
                    visual_projection population is read out (the photoreceptors are the input;
                    the Kenyon cells are saturated at rest and carry no signal -- see
                    notebooks/reservoir.ipynb); 3-class accuracy. The three candidate read steps
                    are the ones already probed for this slot: the last on-step (step 7), two
                    steps after the blob turns off (step 10), and the last step of the slot
                    (step 11). Which of those three is reported is decided on seeds 5, 6 and 7,
                    not on the reported seeds, by the largest range of the four networks' mean
                    accuracies (an exact tie takes the earlier step). That step is then frozen
                    for the reported seeds, which are 0 .. --seeds-1 and must not overlap
                    5, 6, 7. Each reported readout is also scored with its training labels
                    permuted (a shuffled-label baseline).

A Jaeger memory-capacity task was tried and dropped. The numbers below are from the controls
used then, which were not edge-matched: rewired targets were a raw permutation, so duplicate
pairs collapsed, and Erdos-Renyi drew pairs freely, including self-loops, duplicates and rows
the connectome does not drive. With 200 test samples and delays 1..15 the chance level for the
summed squared test correlation is about 0.079, and those controls scored 0.069-0.106 -- at or
barely above chance -- and no wiring difference held across seeds (Erdos-Renyi best on only
3/5 seeds; seed 0: connectome 0.165). Those are not scores of the edge-matched controls above.

The digit readout sample excludes the photoreceptors and ten fixed ORN types; the eye task
reads the visual_projection population, which contains no photoreceptors, so no eye readout
reads its own input channel. Sensory_input=False throughout, as in the repository's olfactory
work. Swapping the weight matrix uses FlyBrain's internal arrays (as notebooks/reservoir.ipynb
does); it is a script trick, not a public API.

Prints, over --seeds reported seeds: mean +/- sd per task and network, per-seed values, the
winner by mean, nnz and self-loops, the eye-step selection, the shuffled-label baseline, and
paired tests of the per-seed accuracies. Whatever the result is, it is the result.
"""
from __future__ import annotations

import argparse
import platform
import sys
import time

import numpy as np
from scipy import sparse
from scipy.stats import ttest_rel

import flybrain
from flybrain import Blob, Eyes, FlyBrain, Readout, Trace, run

SEEDS_DEFAULT = 5
TRACE_TAU = 0.1
NETWORKS = ("connectome", "weight-shuffle", "rewired", "erdos-renyi")
LOOP_FREE = ("rewired", "erdos-renyi")

# Eye-slot read candidates: the three steps already probed for this slot (last on-step,
# two steps after offset, last step of the slot). Seeds 5..7 choose among them.
EYE_SLOT = 12
EYE_ON_STEPS = 8
EYE_CANDIDATE_STEPS = (EYE_ON_STEPS - 1, EYE_ON_STEPS + 2, EYE_SLOT - 1)
EYE_SELECT_SEEDS = (5, 6, 7)


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


def self_loop_count(W):
    """Stored diagonal entries (postsynaptic == presynaptic), including a zero weight."""
    coo = W.tocoo()
    return int(np.count_nonzero(coo.row == coo.col))


def redraw_collisions(post, col, n, rng, reject_self_loops=False):
    """Swap postsynaptic targets until every (target, presynaptic) pair is unique.

    With reject_self_loops, also until no target equals its presynaptic neuron. Each
    applied swap exchanges the targets of two distinct entries, so the multiset of
    targets -- and with it every neuron's in-degree -- is preserved exactly.
    """
    post = np.asarray(post).copy()
    col = np.asarray(col)
    for _attempt in range(10_000):
        key = post.astype(np.int64) * n + col
        _, first, inv, counts = np.unique(key, return_index=True, return_inverse=True,
                                          return_counts=True)
        is_first = np.zeros(len(key), bool)
        is_first[first] = True
        bad = (counts[inv] > 1) & ~is_first
        if reject_self_loops:
            bad = bad | (post == col)
        orphans = np.flatnonzero(bad)
        if not orphans.size:
            return post
        print(f"redraw pass {_attempt + 1}: {orphans.size} entries to swap",
              file=sys.stderr, flush=True)
        partners = rng.integers(0, len(post), orphans.size)
        _, pfirst = np.unique(partners, return_index=True)
        p_is_first = np.zeros(len(partners), bool)
        p_is_first[pfirst] = True
        clean = p_is_first & ~np.isin(partners, orphans)
        o, p = orphans[clean], partners[clean]
        swapped = post[p].copy()
        post[p] = post[o]
        post[o] = swapped
    raise RuntimeError("redraw_collisions: no loop-free simple graph after 10000 passes")


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

    Every control has exactly the connectome's nnz and no duplicate pairs. Rewired and
    Erdos-Renyi have no self-loops; weight-shuffle keeps the connectome's. Erdos-Renyi is
    drawn from the generator state left by the duplicate-only redraw, so rejecting
    self-loops in the rewired graph does not resample Erdos-Renyi.
    """
    n, m = original.shape[0], original.nnz
    row_strength = np.asarray(abs(original).sum(1)).ravel()
    receivers = np.flatnonzero(row_strength > 0)   # rows the connectome delivers input to
    coo = original.tocoo()

    data = np.random.default_rng(seed).permutation(coo.data)
    weight_shuffle = match_input_strength(
        row_strength, sparse.coo_matrix((data, (coo.row, coo.col)), shape=original.shape))

    rng_rewire = np.random.default_rng(seed + 10_000)
    post = redraw_collisions(rng_rewire.permutation(coo.row), coo.col, n, rng_rewire,
                             reject_self_loops=True)
    rewired = match_input_strength(
        row_strength, sparse.coo_matrix((coo.data, (post, coo.col)), shape=original.shape))

    rng_er = np.random.default_rng(seed + 10_000)
    redraw_collisions(rng_er.permutation(coo.row), coo.col, n, rng_er, reject_self_loops=False)
    post, pre = random_pairs(rng_er, m, n, receivers)
    erdos = match_input_strength(
        row_strength, sparse.coo_matrix((rng_er.permutation(original.data), (post, pre)),
                                        shape=original.shape))
    return {"connectome": original, "weight-shuffle": weight_shuffle,
            "rewired": rewired, "erdos-renyi": erdos}


def use_weights(brain, W):
    """Point the brain at weight matrix W (rows = postsynaptic). FlyBrain internals."""
    W = W.tocsr().astype(np.float32)
    W.sort_indices()
    csc = W.tocsc()
    brain.indptr, brain.indices, brain.weights = csc.indptr, csc.indices, csc.data


def check_wiring(wirings):
    """nnz matches, the two loop-free controls have no diagonal, weight-shuffle keeps it."""
    nnz = wirings["connectome"].nnz
    loops = {net: self_loop_count(wirings[net]) for net in NETWORKS}
    for net in NETWORKS:
        if wirings[net].nnz != nnz:
            raise RuntimeError(f"{net} nnz {wirings[net].nnz} != connectome {nnz}")
    if loops["weight-shuffle"] != loops["connectome"]:
        raise RuntimeError("weight-shuffle self-loops differ from the connectome")
    for net in LOOP_FREE:
        if loops[net] != 0:
            raise RuntimeError(f"{net} has {loops[net]} self-loops")
    return loops


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


def eye_rollout(brain, W, seed, azimuth, readout_idx, read_steps, n_slots=180,
                slot=EYE_SLOT, on_steps=EYE_ON_STEPS, half_width=0.15):
    """One eye-position simulation. Returns spike-indicator features at each read step, and labels.

    The blob is on for steps 0 .. on_steps-1 of each slot. Recording does not affect the
    dynamics, so scoring several steps from one rollout matches scoring each step alone.
    """
    use_weights(brain, W)
    read_steps = tuple(read_steps)
    centers = [-0.7, 0.0, 0.7]
    seq = np.random.default_rng(seed + 2_000).permutation(np.repeat(np.arange(3), n_slots // 3))
    eyes = Eyes(azimuth)
    slot_of = np.full(brain.n, -1, np.int64)
    slot_of[readout_idx] = np.arange(len(readout_idx))
    brain.reset(seed)
    features = {step: np.zeros((len(seq), len(readout_idx)), np.float32) for step in read_steps}
    want = set(read_steps)
    for t in range(len(seq) * slot):
        rel = t % slot
        on = rel < on_steps
        center = centers[seq[t // slot]]
        drive = eyes.drive([Blob(center=center, half_width=half_width, darkness=1.0)] if on else [])
        fired = brain.step(eye_drive=drive)
        if rel in want:
            h = slot_of[fired]
            features[rel][t // slot, h[h >= 0]] = 1.0
    return features, seq


def eye_accuracy(X, y, seed, shuffle_labels=False, frac=0.75):
    """3-class ridge accuracy. The train/test split depends only on `seed`.

    shuffle_labels permutes the training labels with a separate generator and scores
    the true test labels. It does not change the split.
    """
    rng = np.random.default_rng(seed + 7_000)
    train = np.concatenate([rng.permutation(np.flatnonzero(y == c))[: int(frac * (y == c).sum())]
                            for c in range(3)])
    test = np.setdiff1d(np.arange(len(y)), train)
    y_train = y[train]
    if shuffle_labels:
        y_train = np.random.default_rng(seed + 9_000).permutation(y_train)
    r = Readout.fit(X[train], np.eye(3)[y_train], kind="ridge",
                    components=(20, 60), lambdas=(1e-3, 1e-2, 1e-1, 1.0))
    acc = float((np.atleast_2d(r.predict(X[test])).argmax(1) == y[test]).mean())
    return acc, int(test.size)


def choose_eye_read_step(brain, original, azimuth, readout_idx):
    """Pick the eye read step on seeds 5, 6 and 7. Reported seeds are not scored.

    The candidates are the three steps already probed for this slot. Take the one with
    the largest (max - min) of the four networks' mean accuracies. An exact tie takes
    the earlier step. The rule favours the step where the networks disagree most.
    """
    scores = {step: {net: [] for net in NETWORKS} for step in EYE_CANDIDATE_STEPS}
    for seed in EYE_SELECT_SEEDS:
        t0 = time.time()
        wirings = control_wirings(original, seed)
        loops = check_wiring(wirings)
        print(f"select seed {seed} nnz: "
              + ", ".join(f"{net} {wirings[net].nnz:,}" for net in NETWORKS)
              + " | self-loops: "
              + ", ".join(f"{net} {loops[net]}" for net in NETWORKS)
              + f"  (controls {time.time() - t0:.0f} s)", file=sys.stderr, flush=True)
        for net in NETWORKS:
            t1 = time.time()
            features, y = eye_rollout(brain, wirings[net], seed, azimuth, readout_idx,
                                      EYE_CANDIDATE_STEPS)
            for step in EYE_CANDIDATE_STEPS:
                acc, _n_test = eye_accuracy(features[step], y, seed)
                scores[step][net].append(acc)
                print(f"  select step {step:2d} {net:14s} seed {seed}: "
                      f"{acc:.3f} ({time.time() - t1:.0f} s)", file=sys.stderr, flush=True)
                t1 = time.time()
        del wirings

    print("\neye-position read-step selection (seeds 5, 6, 7; reported seeds not used)")
    print("candidates are the three steps already probed for this slot, and the choice "
          "among them uses seeds 5, 6, 7 only: step 7 (last on-step), step 10 (two steps "
          "after offset), step 11 (last step of the slot)")
    print("rule: maximize (max - min) of the four network means; an exact tie takes the earlier step")
    best_step, best_sep = None, None
    for step in EYE_CANDIDATE_STEPS:
        means = []
        for net in NETWORKS:
            vals = scores[step][net]
            mu = float(np.mean(vals))
            means.append(mu)
            print(f"  step {step} {net:14s} " + " ".join(f"{v:.3f}" for v in vals)
                  + f"  mean {mu:.3f}")
        sep = max(means) - min(means)
        print(f"  step {step} separation {sep:.4f}")
        if best_sep is None or sep > best_sep + 1e-12:
            best_step, best_sep = step, sep
    print(f"chosen eye-position read step: {best_step} (separation {best_sep:.4f})")
    return best_step


def report_paired(task, left_name, right_name, left, right):
    """Paired per-seed difference left - right, with a two-sided paired t test."""
    a = np.asarray(left, float)
    b = np.asarray(right, float)
    d = a - b
    res = ttest_rel(a, b)
    higher = int(np.sum(d > 0))
    lower = int(np.sum(d < 0))
    tied = int(np.sum(d == 0))
    diffs = " ".join(f"{x:+.3f}" for x in d)
    print(f"{task}: {left_name} - {right_name} per seed: {diffs}")
    print(f"  {left_name} higher on {higher}/{d.size} seeds, lower on {lower}/{d.size}, "
          f"tied on {tied}/{d.size}; paired t={res.statistic:.2f}, two-sided p={res.pvalue:.3f}")


# ---- driver -----------------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seeds", type=int, default=SEEDS_DEFAULT, help="reported seeds 0..N-1 per network")
    ap.add_argument("--digits", type=int, default=600, help="digit images (of 1797) per run")
    ap.add_argument("--tasks", default="all", help="comma list of: digits,eye-position")
    args = ap.parse_args()
    seeds = list(range(args.seeds))
    wanted = None if args.tasks == "all" else {t.strip() for t in args.tasks.split(",")}
    run_eye = wanted is None or "eye-position" in wanted
    if run_eye and set(seeds) & set(EYE_SELECT_SEEDS):
        ap.error("eye-position reported seeds overlap the read-step selection seeds "
                 + ", ".join(str(s) for s in EYE_SELECT_SEEDS))

    brain = FlyBrain(device="cpu", sensory_input=False)
    ct = brain.cell_type.astype(str)
    n = brain.n
    print(f"flybrain {flybrain.__version__}, {n:,} neurons, {platform.system()} "
          f"({platform.machine()}), python {platform.python_version()}", file=sys.stderr, flush=True)

    # shared plumbing: the connectome matrix, the fixed input neurons, the fixed readout sample
    original = sparse.csc_matrix((brain.weights, brain.indices, brain.indptr), shape=(n, n)).tocsr()
    orn_types = sorted(np.unique(ct[np.char.startswith(ct, "ORN_")]))
    kept_out = brain.cells(orn_types[:10])        # ten ORN types stay out of the readout sample
    excluded = np.zeros(n, bool)
    excluded[brain.visual] = True                            # photoreceptors: the eyes task's input
    excluded[kept_out] = True
    sample = np.sort(np.random.default_rng(0).permutation(np.flatnonzero(~excluded))[:2000])
    print(f"readout sample: {len(sample)} neurons (fixed, excludes photoreceptors and "
          f"{len(kept_out)} neurons of {len(orn_types[:10])} ORN types)", file=sys.stderr, flush=True)

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
          file=sys.stderr, flush=True)

    vp = brain.cells(["visual_projection"])                  # readout for the eyes task
    print(f"eye-position readout: {len(vp)} visual_projection neurons", file=sys.stderr, flush=True)

    eye_step = None
    if run_eye:
        eye_step = choose_eye_read_step(brain, original, brain.azimuth, vp)

    tasks = {}
    if wanted is None or "digits" in wanted:
        tasks["digits"] = lambda W, seed: digit_task(brain, W, seed, images, labels, pixels,
                                                     inject_cells, sample)

    results = {task: {net: [] for net in NETWORKS} for task in tasks}
    if run_eye:
        results["eye-position"] = {net: [] for net in NETWORKS}
    eye_shuffle = {net: [] for net in NETWORKS}
    eye_n_test = None
    loop_counts = None
    for seed in seeds:                                     # controls are built once per seed
        wirings = control_wirings(original, seed)
        loops = check_wiring(wirings)
        if loop_counts is None:
            loop_counts = loops
        elif loops != loop_counts:
            raise RuntimeError(f"self-loop counts changed at seed {seed}: {loops} vs {loop_counts}")
        print(f"seed {seed} nnz: " + ", ".join(f"{net} {wirings[net].nnz:,}" for net in NETWORKS)
              + " | self-loops: " + ", ".join(f"{net} {loops[net]}" for net in NETWORKS),
              file=sys.stderr, flush=True)
        if "digits" in tasks:
            for net in NETWORKS:
                t0 = time.time()
                results["digits"][net].append(tasks["digits"](wirings[net], seed))
                print(f"  digits           {net:14s} seed {seed}: "
                      f"{results['digits'][net][-1]:.3f} ({time.time() - t0:.0f} s)",
                      file=sys.stderr, flush=True)
        if run_eye:
            for net in NETWORKS:
                t0 = time.time()
                features, y = eye_rollout(brain, wirings[net], seed, brain.azimuth, vp, (eye_step,))
                acc, n_test = eye_accuracy(features[eye_step], y, seed)
                shuf, n_test_s = eye_accuracy(features[eye_step], y, seed, shuffle_labels=True)
                if n_test != n_test_s:
                    raise RuntimeError("shuffled-label split changed the test count")
                if eye_n_test is None:
                    eye_n_test = n_test
                elif n_test != eye_n_test:
                    raise RuntimeError("eye test count changed across seeds")
                results["eye-position"][net].append(acc)
                eye_shuffle[net].append(shuf)
                print(f"  eye-position     {net:14s} seed {seed}: "
                      f"{acc:.3f} shuffled-label {shuf:.3f} ({time.time() - t0:.0f} s)",
                      file=sys.stderr, flush=True)
        del wirings
    use_weights(brain, original)                           # leave the brain as we found it

    print("\nflybrain reservoir benchmark: mean +/- sd over "
          f"{len(seeds)} seeds (seeds 0..{seeds[-1]})\n")
    if loop_counts is not None:
        print("self-loops per network (same on every reported seed): "
              + ", ".join(f"{net} {loop_counts[net]}" for net in NETWORKS))
        print()
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
    print()
    for task, nets in results.items():
        report_paired(task, "connectome", "weight-shuffle", nets["connectome"], nets["weight-shuffle"])
        report_paired(task, "connectome", "rewired", nets["connectome"], nets["rewired"])
        report_paired(task, "erdos-renyi", "connectome", nets["erdos-renyi"], nets["connectome"])
    if run_eye:
        print()
        print("eye-position shuffled-label baseline "
              "(one permutation of the training labels per seed; scored on the true test labels):")
        for net in NETWORKS:
            a = np.array(eye_shuffle[net])
            print(f"  {net:14s} " + " ".join(f"{v:.3f}" for v in a)
                  + f"   mean {a.mean():.3f} ± {a.std(ddof=1):.3f}")
        chance = 1.0 / 3.0
        se = float(np.sqrt(chance * (1.0 - chance) / eye_n_test))
        print(f"analytic 3-class chance on {eye_n_test} test samples: {chance:.3f}, se {se:.3f}")


if __name__ == "__main__":
    main()
