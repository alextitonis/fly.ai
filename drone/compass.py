"""Step 1 of navigation (PLAN.md section 7): does the fly's own compass know which way it faces?

    python drone/compass.py dev --seed 9800                 # pick the input strength; prints, no rules
    python drone/compass.py bench --seed 9801               # the test, JSON in runs/compass/

The fly keeps its heading in the central complex: a bump of activity in the EPG ring that moves as the fly turns, pinned to what it
sees. Landmarks reach it through the anterior visual pathway: MeTu (medulla) -> TuBu (tubercle) -> ring neurons (ER) -> EPG.

What's ours and what's the connectome's:
  ours    the front end: a bright landmark is put straight onto MeTu cells, each by how close the landmark is to where it looks.
          The photoreceptor route fades at the lamina in a spiking model (flybrain/eyes.py), the same shortcut FeatureDetectors takes
  ours    where each MeTu cell looks: read off the wiring, not set by hand. Photoreceptor azimuths pushed 3 synapses down the
          connectome to each MeTu cell, weighted by synapse strength. Checked against where the cells sit in the head: correlation
          0.69 (left) and -0.66 (right) with soma height, which nothing here uses
  ours    the readout: a cross-validated decoder from EPG spike counts to heading. It only reads, it doesn't steer
  ours    azimuth -1..1 taken as -170..170 degrees, a 20 degree blind spot behind
  brain   everything from MeTu to EPG

Trial: the fly faces one of 12 headings, 30 degrees apart, with one landmark fixed in the world. 0.5 s settle, 1 s with the landmark,
1 s in darkness. Spikes counted 0.5-1 s into each.

Rules, fixed before running, seed 9801, 4 flies x 3 repeats x 12 headings, sensory_input=False, NUMBA_NUM_THREADS=2. Dev seed 9800 only.
    COMPASS   EPG decoder's median heading error at most 45 degrees with the landmark up (chance is 90)
    WIRING    scrambled wiring's EPG median error at least 30 degrees worse
    ACTIVE    EPG fires at least 1 Hz on average with the landmark up, so it isn't a decoder reading noise
Reported, no rule: the same in darkness (does the bump hold?), the decoder on TuBu, ER, PEN, PFL3 and on the MeTu cells we drive
(the ceiling), and each EPG cell's preferred heading.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("NUMBA_NUM_THREADS", "2")
os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from flybrain import FlyBrain  # noqa: E402
from flytalk import rewire  # noqa: E402

OUT = HERE / "runs" / "compass"
HEADINGS = np.arange(0, 360, 30)
FIELD = 170.0           # degrees at azimuth +-1
WIDTH = 20.0            # degrees: landmark's spread over MeTu receptive fields (sigma)
DRIVE = 0.5             # volts per step at the centre of the landmark; set on dev seed 9800
SETTLE, LIT, DARK = 25, 50, 50
COUNT = (25, 50)        # steps into each phase that get counted: 0.5-1 s
GROUPS = {"MeTu": ("MeTu",), "TuBu": ("TuBu",), "ER": ("ER",), "EPG": ("EPG",), "PEN": ("PEN",), "PFL3": ("PFL3",)}


def wrap(d):
    return (np.asarray(d) + 180) % 360 - 180


def fields(brain) -> tuple[np.ndarray, np.ndarray]:
    """MeTu cells and where each looks, in degrees, from the wiring (cached)."""
    OUT.mkdir(parents=True, exist_ok=True)
    cache = OUT / "metu_fields.npz"
    ct = brain.cell_type.astype(str)
    met = np.flatnonzero(np.char.startswith(ct, "MeTu"))
    if cache.exists():
        c = np.load(cache)
        if np.array_equal(c["cells"], met):
            return met, c["deg"]
    from scipy import sparse
    from flybrain.data import ensure_data
    A = abs(sparse.load_npz(ensure_data(None) / "weights.npz").tocsr())   # rows = postsynaptic, the built brain before any scramble
    x = np.zeros(brain.n, np.float32)
    s = np.zeros(brain.n, np.float32)
    x[brain.visual] = 1
    s[brain.visual] = brain.azimuth
    for _ in range(3):
        x, s = A @ x, A @ s
    deg = (s[met] / np.maximum(x[met], 1e-12)) * FIELD
    np.savez(cache, cells=met, deg=deg)
    return met, deg


def landmark(deg: np.ndarray, heading: float) -> np.ndarray:
    """Drive on each MeTu cell when the fly faces `heading` and the landmark sits at world angle 0."""
    rel = wrap(0.0 - heading)
    if abs(rel) > FIELD:
        return np.zeros_like(deg)
    return DRIVE * np.exp(-0.5 * (wrap(deg - rel) / WIDTH) ** 2)


def run(brain, met, deg, seed: int, reps: int, idx: dict) -> dict:
    """Spike counts per group, lit and dark: {phase: {group: (samples, cells)}}, plus headings."""
    out = {ph: {g: [] for g in idx} for ph in ("lit", "dark")}
    heads = []
    for r in range(reps):
        for k, h in enumerate(HEADINGS):
            brain.reset(seed + 1000 * r + k)
            amt = (landmark(deg, h) / brain.decay).astype(np.float32)[:, None]   # added before the step's decay, so it lands as DRIVE
            for _ in range(SETTLE):
                brain.step()
            for ph, n in (("lit", LIT), ("dark", DARK)):
                counts = np.zeros((brain.batch, brain.n), np.int16)
                for t in range(n):
                    if ph == "lit":
                        brain.v[met] += amt
                    fired = brain.step()
                    if COUNT[0] <= t < COUNT[1]:
                        for f, x in enumerate(fired if brain.batch > 1 else [fired]):
                            counts[f, x] += 1
                for g, cells in idx.items():
                    out[ph][g].append(counts[:, cells])
            heads += [h] * brain.batch
        print(f"  repeat {r + 1}/{reps}", flush=True)
    return {ph: {g: np.concatenate(v) for g, v in d.items()} for ph, d in out.items()}, np.array(heads, float)


def decode(x: np.ndarray, heads: np.ndarray) -> float:
    """Median heading error in degrees, 5-fold, ridge onto cos and sin."""
    from sklearn.linear_model import Ridge
    from sklearn.model_selection import KFold
    x = x.astype(np.float32)
    y = np.column_stack([np.cos(np.radians(heads)), np.sin(np.radians(heads))])
    err = []
    for tr, te in KFold(5, shuffle=True, random_state=0).split(x):
        mu, sd = x[tr].mean(0), x[tr].std(0) + 0.1
        p = Ridge(alpha=10.0).fit((x[tr] - mu) / sd, y[tr]).predict((x[te] - mu) / sd)
        err.append(np.abs(wrap(np.degrees(np.arctan2(p[:, 1], p[:, 0])) - heads[te])))
    return round(float(np.median(np.concatenate(err))), 1)


def summary(counts: dict, heads: np.ndarray) -> dict:
    res = {}
    for ph, d in counts.items():
        res[ph] = {g: {"error_deg": decode(x, heads), "hz": round(float(x.mean() / ((COUNT[1] - COUNT[0]) * 0.02)), 2)}
                   for g, x in d.items()}
    epg = counts["lit"]["EPG"].astype(float)
    z = np.exp(1j * np.radians(heads))
    pref = np.angle((epg * z[:, None]).sum(0), deg=True)
    strength = np.abs((epg * z[:, None]).sum(0)) / np.maximum(epg.sum(0), 1)
    res["epg_preferred_deg"] = [round(float(p), 0) for p in pref]
    res["epg_tuning_strength"] = [round(float(s), 2) for s in strength]
    return res


def setup(seed: int, flies: int):
    brain = FlyBrain(batch=flies, seed=seed, sensory_input=False)
    ct = brain.cell_type.astype(str)
    idx = {g: np.flatnonzero(np.char.startswith(ct, p)) for g, p in GROUPS.items()}
    idx["EPG"] = np.flatnonzero(ct == "EPG")
    met, deg = fields(brain)
    return brain, met, deg, idx


def dev(a) -> None:
    global DRIVE
    brain, met, deg, idx = setup(a.seed, a.flies)
    print(f"{len(met)} MeTu cells, looking {deg.min():.0f}..{deg.max():.0f} degrees; EPG {len(idx['EPG'])}", flush=True)
    for d in a.drives:
        DRIVE = d
        counts, heads = run(brain, met, deg, a.seed, a.reps, idx)
        s = summary(counts, heads)
        print(json.dumps({"drive": d, "lit": s["lit"], "dark": s["dark"]}), flush=True)


def bench(a) -> None:
    brain, met, deg, idx = setup(a.seed, a.flies)
    res = {"seed": a.seed, "drive": DRIVE, "threads": os.environ.get("NUMBA_NUM_THREADS")}
    counts, heads = run(brain, met, deg, a.seed, a.reps, idx)
    res["real"] = summary(counts, heads)
    rewire(brain, seed=a.seed + 3)
    counts, heads = run(brain, met, deg, a.seed + 50000, a.reps, idx)
    res["scrambled"] = summary(counts, heads)
    r, s = res["real"]["lit"]["EPG"], res["scrambled"]["lit"]["EPG"]
    res["rules"] = {"COMPASS": r["error_deg"] <= 45, "WIRING": s["error_deg"] - r["error_deg"] >= 30, "ACTIVE": r["hz"] >= 1.0}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"bench{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({"real": res["real"]["lit"], "real_dark": res["real"]["dark"], "scrambled": res["scrambled"]["lit"]}))
    print(json.dumps(res["rules"]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    d = sub.add_parser("dev")
    d.add_argument("--seed", type=int, default=9800)
    d.add_argument("--flies", type=int, default=4)
    d.add_argument("--reps", type=int, default=2)
    d.add_argument("--drives", type=float, nargs="+", default=[0.3, 0.5, 0.8])
    b = sub.add_parser("bench")
    b.add_argument("--seed", type=int, default=9801)
    b.add_argument("--flies", type=int, default=4)
    b.add_argument("--reps", type=int, default=3)
    a = ap.parse_args()
    {"dev": dev, "bench": bench}[a.what](a)


if __name__ == "__main__":
    main()
