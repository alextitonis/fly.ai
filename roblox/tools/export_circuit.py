"""Cut a small, game-sized circuit out of the full flybrain connectome for Fly Lab (Roblox).

    python roblox/tools/export_circuit.py              # writes roblox/src/shared/Circuit.json
    python roblox/tools/export_circuit.py --check      # also prints full-brain vs circuit responses

How the cut is made (nothing hand-wired; every synapse and weight is the connectome's):
  1. Run the full brain (MaleCNS, ~167k neurons) at rest and with each game sense stimulated:
     loom left/right (LC4 + LPLC2), moving target left/right (LC10a), touch on the eyes (BM_InOm).
  2. Keep the output neurons the game reads (DNp01 escape, DNa02 steer, DNg100 walk, MDN back up,
     DNg12 groom), the sense neurons (a fixed sample per group), and the neurons whose firing changes
     most when a sense is on: the pathway between them.
  3. Keep the real synapses among the kept neurons. The rest of the brain is replaced by its average
     drive at rest onto each kept neuron (a constant per-neuron bias, measured, not tuned).
  4. Check the cut circuit reacts like the full brain (--check) with the same LIF equations the
     Luau runtime uses.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUT_FILE = HERE.parent / "src" / "shared" / "Circuit.json"

WARM, STIM, AMOUNT, RUNS = 25, 50, 0.8, 3
INPUTS_PER_GROUP = 60       # sense neurons kept per sense group (sampled, fixed seed)
PATHWAY_PER_SENSE = 110     # most-responding neurons kept per sense


def output_groups(b):
    types = np.unique(b.cell_type.astype(str))
    g = b.groups
    return {
        "escape": np.concatenate([g["escape_L"], g["escape_R"]]),
        "steer_L": g["steer_L"], "steer_R": g["steer_R"],
        "walk": np.concatenate([g["forward_L"], g["forward_R"]]),
        "back": np.concatenate([g["backward_L"], g["backward_R"]]),
        "groom": b.cells([t for t in types if t.startswith("DNg12")]),
    }


def sense_groups(b):
    return {
        "loom_L": b.cells(["LC4", "LPLC2"], "L"), "loom_R": b.cells(["LC4", "LPLC2"], "R"),
        "target_L": b.cells(["LC10a"], "L"), "target_R": b.cells(["LC10a"], "R"),
        "touch": b.cells(["BM_InOm"]),
    }


def full_brain_rates(b, senses):
    """Mean spike counts per neuron over the STIM window: at rest and per sense."""
    def run(stim, seed):
        b.reset(seed)
        rate = np.zeros(b.n)
        for s in range(WARM + STIM):
            f = b.step(inject=[(stim, AMOUNT)] if s >= WARM and stim is not None else [])
            if s >= WARM:
                np.add.at(rate, f, 1)
        return rate

    base = sum(run(None, 7 + r) for r in range(RUNS)) / RUNS
    per = {k: sum(run(idx, 7 + r) for r in range(RUNS)) / RUNS for k, idx in senses.items()}
    return base, per


def simulate(c, stim_local, seed, steps=WARM + STIM):
    """The Luau runtime's update, in NumPy: v <- decay v + gain*(W spikes) + tonic + bias + noise."""
    rng = np.random.default_rng(seed)
    n = c["n"]
    v = np.zeros(n, np.float32)
    fired = np.zeros(0, int)
    counts = np.zeros(n)
    start, post, w = np.array(c["start"]), np.array(c["post"]), np.array(c["w"], np.float32)
    bias = np.array(c["bias"], np.float32)
    for s in range(steps):
        cur = np.zeros(n, np.float32)
        for j in fired:
            a, z = start[j], start[j + 1]
            cur[post[a:z]] += w[a:z]
        v = v * c["decay"] + c["gain"] * cur + c["tonic"] + bias
        v += (rng.random(n) < c["noise_p"]) * np.float32(c["noise_amp"])
        if stim_local is not None and s >= WARM:
            v[stim_local] += AMOUNT
        fired = np.flatnonzero(v >= 1.0)
        v[fired] = 0.0
        if s >= WARM:
            counts[fired] += 1
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--out", default=str(OUT_FILE))
    args = ap.parse_args()

    from flybrain import FlyBrain
    b = FlyBrain(batch=1, dt=0.020, sensory_input=False)
    outs, senses = output_groups(b), sense_groups(b)
    print("running the full brain (rest + 5 senses x 3 runs)...", file=sys.stderr)
    base, per = full_brain_rates(b, senses)

    rng = np.random.default_rng(1)
    sampled = {k: np.sort(rng.choice(idx, min(INPUTS_PER_GROUP, len(idx)), replace=False))
               for k, idx in senses.items()}
    all_sense = np.concatenate(list(senses.values()))
    keep = set(np.concatenate(list(outs.values())).tolist())
    for idx in sampled.values():
        keep |= set(idx.tolist())
    for k in senses:
        d = per[k] - base
        d[all_sense] = 0                      # pathway only; sense cells come from the sample
        keep |= set(np.argsort(-np.abs(d))[:PATHWAY_PER_SENSE].tolist())
    keep = np.array(sorted(keep))
    local = {int(g): i for i, g in enumerate(keep)}
    n = len(keep)

    # W is CSC (columns = presynaptic): b.indptr / b.indices / b.weights
    inside = np.zeros(b.n, bool)
    inside[keep] = True
    # each sampled sense cell stands in for the cells of its group that were left out
    scale = np.ones(b.n)
    for k, idx in sampled.items():
        scale[idx] = len(senses[k]) / len(idx)
    start, post, w = [0], [], []
    for gpre in keep:
        a, z = b.indptr[gpre], b.indptr[gpre + 1]
        rows, ws = b.indices[a:z], b.weights[a:z]
        m = inside[rows]
        post += [local[int(r)] for r in rows[m]]
        w += [round(float(x) * scale[gpre], 4) for x in ws[m]]
        start.append(len(post))

    # the rest of the brain -> average drive at rest onto each kept neuron (bias per step)
    rate_out = np.where(inside, 0.0, base / STIM)      # spikes per step of every outside neuron
    from scipy import sparse
    W = sparse.csc_matrix((b.weights, b.indices, b.indptr), shape=(b.n, b.n))
    bias = (W @ rate_out)[keep] * b.gain

    groups_local = {}
    for k, idx in outs.items():
        groups_local[k] = [local[int(i)] for i in idx]
    for k, idx in sampled.items():
        groups_local["in_" + k] = [local[int(i)] for i in idx]

    # real 3D positions -> a front view (x = left/right, y = up/down), 0..1; cells without a
    # position (e.g. in the nerve cord) are placed under the brain on their side
    p = b.positions[keep][:, :2].astype(float)
    ok = ~np.isnan(p).any(1)
    lo, hi = p[ok].min(0), p[ok].max(0)
    p = (p - lo) / np.where(hi > lo, hi - lo, 1)
    for i in np.flatnonzero(~ok):
        p[i] = [0.3 if str(b.side[keep[i]]) == "L" else 0.7, 1.08 + 0.1 * rng.random()]
    if np.mean(p[[j for j, g in enumerate(keep) if str(b.side[g]) == "L" and ok[j]], 0]) > 0.5:
        p[:, 0] = 1 - p[:, 0]                  # fly's left on the panel's left

    c = {
        "about": "Fly Lab circuit cut from the MaleCNS v1.0 connectome via flybrain; see roblox/tools/export_circuit.py",
        "n": n, "synapses": len(post),
        "dt": b.dt, "decay": float(b.decay), "gain": b.gain, "tonic": float(b.tonic),
        "noise_p": b.noise_hz * b.dt, "noise_amp": b.noise_amp, "stim": AMOUNT,
        "start": start, "post": post, "w": w,
        "bias": [round(float(x), 5) for x in bias],
        "cell_type": [str(b.cell_type[g]) for g in keep],
        "side": [str(b.side[g]) for g in keep],
        "groups": groups_local,
        "pos": [[round(float(x), 3), round(float(y), 3)] for x, y in p],
        "truth": {k: {o: round(float((per[k] - base)[ix].sum()), 1) for o, ix in outs.items()} for k in senses},
        "truth_rest": {o: round(float(base[ix].sum()), 1) for o, ix in outs.items()},
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(c, separators=(",", ":")))
    print(f"wrote {args.out}: {n} neurons, {len(post)} synapses, "
          f"{Path(args.out).stat().st_size / 1024:.0f} KB", file=sys.stderr)

    if args.check:
        def table(counts):
            return {k: float(counts[ix].sum()) for k, ix in groups_local.items() if not k.startswith("in_")}
        cb = sum(simulate(c, None, 7 + r) for r in range(RUNS)) / RUNS
        print(f"{'sense':10} {'output':8} {'full brain':>10} {'circuit':>8}   (extra spikes over rest, 1 s)")
        for k in senses:
            full = {o: float((per[k] - base)[ix].sum()) for o, ix in outs.items()}
            cs = sum(simulate(c, groups_local["in_" + k], 7 + r) for r in range(RUNS)) / RUNS
            mine = table(cs - cb)
            for o in outs:
                print(f"{k:10} {o:8} {full[o]:10.1f} {mine[o]:8.1f}")
        print("rest      ", {o: round(float(base[ix].sum()), 1) for o, ix in outs.items()},
              {o: round(v, 1) for o, v in table(cb).items()})


if __name__ == "__main__":
    main()
