"""flybrain.sleep on the connectome: a fly learns which smells mean food while the seasons change, without forgetting.

The fly's brain is the frozen MaleCNS connectome (flybrain.FlyBrain). Each trial it smells a blend of two odors: two
olfactory receptor neuron types (ORN_*) are driven at a random strength for 15 steps (300 ms), and a Trace of its
antennal-lobe projection neurons (the cells that carry smell to the mushroom body and lateral horn) is the fly's
"impression" of the smell. A readout learns how much food that smell promises.

What is good to eat changes with the season: every odor has a summer value and an unrelated winter value. Days go
summer x4, winter x4, summer x2. Each day the fly smells 80 blends, and each night it learns. Four ways to learn:

    today only   refit on the day's trials alone - learns fast, forgets the other season entirely
    keep all     refit on every trial ever seen - remembers, but must store everything forever
    sleep        flybrain.sleep.Sleeper: a new readout head a night on top of the old ones, a small rehearsal memory,
                 and the gate that refuses a night that would forget
    sleep+expert the same with one expert per season (the fly knows which season it is)

Printed after each night: R^2 on held-out smells of BOTH seasons. The odor responses are the real connectome's; to
keep it to ~2-4 minutes, every blend is simulated once per strength level (66 pairs x 3) and trials reuse those
traces with a little trial noise.

    python sleep_example.py            (CPU; the brain files download on first use, ~260 MB)
"""
from __future__ import annotations

import itertools
import time

import numpy as np

from flybrain import FlyBrain
from flybrain.reservoir import Trace, fit_ridge, run
from flybrain.sleep import RidgeHeads, Sleeper, r2

ODORS = ["ORN_DA1", "ORN_VA1d", "ORN_VA1v", "ORN_DL3", "ORN_VL2a", "ORN_VM5d",
         "ORN_VA2", "ORN_DL1", "ORN_VL1", "ORN_VM4", "ORN_DM1", "ORN_VA6"]
LEVELS = [0.4, 0.7, 1.0]
STEPS = 15
SEASONS = ["summer"] * 4 + ["winter"] * 4 + ["summer"] * 2
TRIALS = 80
LAM = 1e-2


def smell_bank(brain) -> tuple[dict, np.ndarray]:
    """{(odor_a, odor_b, level): projection-neuron trace averaged over the trial} from the connectome."""
    ct = np.asarray(brain.cell_type).astype(str)
    pn = np.flatnonzero((np.char.find(ct, "PN") >= 0) & ~np.char.startswith(ct, "WEDPN"))   # WEDPN = hearing
    trace = Trace(brain, idx=pn, tau=0.1)
    bank, t0 = {}, time.time()
    pairs = list(itertools.combinations(range(len(ODORS)), 2))
    for n, (a, b) in enumerate(pairs):
        ia, ib = brain.cells([ODORS[a]]), brain.cells([ODORS[b]])
        for lv in LEVELS:
            brain.reset()
            trace.reset()
            F = run(brain, STEPS, encode=lambda t, ia=ia, ib=ib, lv=lv: [(ia, lv), (ib, lv)], trace=trace)
            bank[(a, b, lv)] = F.mean(axis=0)
        if n % 11 == 10:
            print(f"  smelled {n + 1}/{len(pairs)} blends ({time.time() - t0:.0f}s)", flush=True)
    return bank, pn


def main() -> None:
    rng = np.random.default_rng(0)
    print("building the fly (MaleCNS connectome)...", flush=True)
    brain = FlyBrain(device="cpu", seed=1)
    bank, pn = smell_bank(brain)
    keys = list(bank)
    F = np.stack([bank[k] for k in keys])
    mu, sd = F.mean(0), F.std(0) + 1e-6
    keep = F.std(0) > 1e-6                       # neurons that respond to anything
    print(f"{len(pn)} projection neurons, {int(keep.sum())} respond to these smells", flush=True)

    value = {s: rng.normal(0, 1, len(ODORS)) for s in ("summer", "winter")}   # how much food each odor promises

    def trials(season, n):
        idx = rng.integers(0, len(keys), n)
        X = (F[idx] - mu) / sd
        X = X[:, keep] + rng.normal(0, 0.1, (n, int(keep.sum())))         # trial-to-trial noise
        y = np.array([keys[i][2] * (value[season][keys[i][0]] + value[season][keys[i][1]]) for i in idx])
        return X, y + rng.normal(0, 0.1, n)

    test = {s: trials(s, 400) for s in ("summer", "winter")}
    shared = Sleeper(RidgeHeads(LAM), memory_cap=400, prune_every=5)
    expert = Sleeper(RidgeHeads(LAM), experts=True, memory_cap=400, prune_every=5)
    seen_X, seen_y = [], []
    print(f"\n{'day':>3} {'season':>7} | {'today only':>15} | {'keep all':>15} | {'sleep':>15} | {'sleep+expert':>15}")
    print(f"{'':>11} | {'summer winter':>15} | {'summer winter':>15} | {'summer winter':>15} | {'summer winter':>15}")
    for d, season in enumerate(SEASONS, 1):
        X, y = trials(season, TRIALS)
        seen_X.append(X)
        seen_y.append(y)
        today = fit_ridge(X, y, LAM)
        allw = fit_ridge(np.concatenate(seen_X), np.concatenate(seen_y), LAM)
        for s in (shared, expert):
            s.wake(X, y, season)
            s.sleep()

        def row(pred):
            return " ".join(f"{r2(yt, pred(Xt, s)):>+6.2f}" for s, (Xt, yt) in test.items())
        print(f"{d:>3} {season:>7} | {row(lambda Xt, s: Xt @ today[0] + today[1]):>15} | "
              f"{row(lambda Xt, s: Xt @ allw[0] + allw[1]):>15} | {row(lambda Xt, s: shared.predict(Xt)):>15} | "
              f"{row(lambda Xt, s: expert.predict(Xt, s)):>15}", flush=True)
    kept = sum(len(v[0]) for v in expert.memory.train.values()) + sum(len(v[0]) for v in expert.memory.held.values())
    print(f"\nkeep all stored {sum(map(len, seen_y))} trials; sleep's memory holds {kept}. "
          f"The shared model can't be right in both seasons (a smell is food in one and not the other): its gate "
          f"refuses every night that would cost summer what winter gains, so it stays a summer fly. The experts "
          f"don't have to choose.")


if __name__ == "__main__":
    main()
