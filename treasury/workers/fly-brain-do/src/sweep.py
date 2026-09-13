"""Find settings where vision actually reaches the motor neurons.

For each (tonic, gain, eye_gain) setting, show the fly a blank field and an
object looming on the LEFT or RIGHT, and measure firing rates station by
station along the looming-escape pathway:

    photoreceptors -> lamina L1 -> LC4 / LPLC2 (looming detectors) -> DNp01 (jump)
                                                  ...and DNa02 (steering)

A setting is useful if looming raises the downstream stations above blank,
more on the stimulated side.
"""
from __future__ import annotations

import itertools
import sys

import numpy as np
import pyarrow.feather as feather

from fly_brain import DATA, FlyBrain
from fly_eyes import Eyes, blob_for

SECONDS = 2.0
STATIONS = ["R1-6", "L1", "LC4", "LPLC2", "DNp01", "DNa02", "MDN", "DNg100"]


def sides(brain: FlyBrain) -> np.ndarray:
    ann = feather.read_table(DATA / "raw" / "body-annotations-male-cns-v1.0-minconf-0.5.feather",
                             columns=["bodyId", "somaSide", "rootSide"]).to_pandas()
    ann = ann.drop_duplicates("bodyId").set_index("bodyId").reindex(np.load(DATA / "brain.npz")["ids"])
    return ann["somaSide"].fillna(ann["rootSide"]).fillna("").astype(str).str.upper().to_numpy()


def run(brain, scene, groups, seed=64):
    brain.reset(seed)
    eyes = Eyes(brain.azimuth)
    counts = {k: 0 for k in groups}
    steps = int(SECONDS / brain.dt)
    warm = int(0.5 / brain.dt)
    total = 0
    for s in range(steps):
        fired = brain.step(eyes.drive(scene(s * brain.dt)))
        if s >= warm:
            total += len(fired)
            hit = np.zeros(brain.n, bool)
            hit[fired] = True
            for k, idx in groups.items():
                counts[k] += hit[idx].sum()
    window = (steps - warm) * brain.dt
    rates = {k: counts[k] / max(len(groups[k]), 1) / window for k in groups}
    return rates, total / brain.n / window


def main():
    brain = FlyBrain()
    side = sides(brain)
    groups = {}
    for st in STATIONS:
        for s in "LR":
            groups[f"{st}_{s}"] = np.flatnonzero((brain.cell_type == st) & (side == s))
    print("neurons per station:", {k: len(v) for k, v in groups.items() if k.endswith("_L")})

    scenes = {
        "blank": lambda t: [],
        "loomL": lambda t: [blob_for(-110 + 45 * t, 30, 0.9)],
        "loomR": lambda t: [blob_for(110 - 45 * t, 30, 0.9)],
    }
    grid = [(0.18, 1.5, 0.62)] + list(itertools.product([0.10, 0.05], [1.5, 4.0, 8.0], [0.62, 2.0]))
    if len(sys.argv) > 1:
        grid = grid[: int(sys.argv[1])]
    print(f"{'tonic gain eye':15s} {'Hz/cell':>7s} | " + " ".join(f"{st:>13s}" for st in STATIONS))
    print(f"{'':15s} {'':7s} | " + " ".join(f"{'Lloom - blank':>13s}" for _ in STATIONS))
    for tonic, gain, eye_gain in grid:
        brain.tonic, brain.gain, brain.eye_gain = tonic, gain, eye_gain
        res = {name: run(brain, sc, groups) for name, sc in scenes.items()}
        overall = res["blank"][1]
        cells = []
        for st in STATIONS:
            # Effect of a LEFT loom on the left vs right copy of each station ("L/R").
            dL = res["loomL"][0][f"{st}_L"] - res["blank"][0][f"{st}_L"]
            dR = res["loomL"][0][f"{st}_R"] - res["blank"][0][f"{st}_R"]
            cells.append(f"{dL:+6.1f}/{dR:+6.1f}")
        print(f"{tonic:.2f} {gain:4.1f} {eye_gain:4.2f}  {overall:7.2f} | " + " ".join(f"{c:>13s}" for c in cells), flush=True)
        base = " ".join(f"{res['blank'][0][f'{st}_L']:5.1f}" for st in STATIONS)
        print(f"{'':15s} {'blank L-side rates:':>7s} {base}", flush=True)


if __name__ == "__main__":
    main()
