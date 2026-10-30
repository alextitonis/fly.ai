"""Can the fly learn who to follow? Dopamine at the Kenyon-cell output synapses, on a leader's colour.

    python drone/imprint.py          # the bench test below

The learning is the project's own rule (flytrade/research/plasticity.py): which Kenyon cells fired x dopamine = a change
at their output synapses. Rewarded patterns get a positive valence, punished ones a negative. The wiring into the
Kenyon cells is the connectome's. Only the visual Kenyon cells (KCg-d, KCab-p) learn here: the rest are smell cells. They
are made sparse with the brain's own APL neuron, or every cell fires always and nothing can be learned. The smell setting
(kc_sparsity.py, offset -0.6) silences these visual cells completely, which is what failed the first run (2026-10-30);
offset -0.2 and drive 2.0 V (over the project's usual 0.8 V cap) gave 5% active, picked on a screen of other seeds.

What goes in: a colour, as the camera reads it, drives the 248 visual projection neurons that feed the Kenyon cells. Each
of those gets a preferred hue (random and fixed, our model: nobody has measured theirs), so near colours share cells.

Rules fixed before running (each of 24 flies has its own synapses; tests on fresh seeds):
  PATTERNS  the same colour twice is at least 0.2 more alike in the Kenyon cells than the two leaders' colours
  LEARNS    after training, at least 90% of flies prefer the rewarded leader
  FLIPS     the same brain with the rewards swapped: at least 90% prefer the other one
  CONTROL   random rewards: 30-70% prefer either
  WIRING    scrambled connectome: LEARNS at least 20 points lower
Reported, no rule: how far a colour must be from the rewarded one before it stops being treated the same (the lookalike limit).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "flytrade" / "research"))
from flybrain import FlyBrain  # noqa: E402
import plasticity  # noqa: E402

BATCH = 24
APL_GAIN, KC_OFFSET = 4.0, -0.2
WARM, STIM = 15, 25            # brain steps
DRIVE = 2.0                    # volts at a cell's preferred hue
TUNING = 1                     # how narrow a cell's colour preference is
ROUNDS = 12                    # training trials per colour
A, B = 150.0, 300.0            # the leaders' hues: green and magenta (sim.world.BEACONS)
LOOKALIKE = (0, 10, 20, 40, 80, 150)


class Colours:
    def __init__(self, brain: FlyBrain):
        self.brain = brain
        ct = brain.cell_type.astype(str)
        self.kc = np.flatnonzero(np.char.startswith(ct, "KC"))
        sc = brain.superclass.astype(str)
        visual_kc = np.isin(ct, ["KCg-d", "KCab-p"])
        pre = brain.indices, brain.indptr
        into = np.zeros(brain.n, bool)
        for j in np.flatnonzero(sc == "visual_projection"):      # CSR over the presynaptic cell
            if visual_kc[pre[0][pre[1][j]:pre[1][j + 1]]].any():
                into[j] = True
        self.cells = np.flatnonzero(into)
        self.pref = np.random.default_rng(7).uniform(0, 360, len(self.cells))
        is_kc = np.zeros(brain.n, bool)
        is_kc[self.kc] = True
        for j in np.flatnonzero(ct == "APL"):                    # kc_sparsity.scale_apl
            lo, hi = brain.indptr[j], brain.indptr[j + 1]
            brain.weights[lo:hi][is_kc[brain.indices[lo:hi]]] *= np.float32(APL_GAIN)
        self.all_kc = self.kc
        self.kc = np.flatnonzero(visual_kc)                      # the cells that learn and are read
        self.where = np.full(brain.n, -1)
        self.where[self.kc] = np.arange(len(self.kc))

    def drive(self, hue: float) -> np.ndarray:
        return DRIVE * np.maximum(0.0, np.cos(np.radians(hue - self.pref))) ** TUNING

    def look(self, hue: float, seed: int) -> np.ndarray:
        """Kenyon-cell spike counts (flies, cells) while this colour is in view."""
        b = self.brain
        b.reset(seed=seed)
        offset = [(self.all_kc, KC_OFFSET)]
        for _ in range(WARM):
            b.step(inject=offset)
        amount = self.drive(hue)
        counts = np.zeros((b.batch, len(self.kc)), np.float32)
        for _ in range(STIM):
            b.v[self.cells] += amount[:, None]
            for f, fired in enumerate(b.step(inject=offset)):
                h = self.where[fired]
                counts[f, h[h >= 0]] += 1
        return counts


def train(c: Colours, rewards: dict[float, float], tag: str, seed: int) -> list[int]:
    """Each fly: ROUNDS trials per colour in random order, dopamine right after. Returns the flies' keys."""
    keys = [hash((tag, i)) & 0xffffff for i in range(BATCH)]
    order = np.random.default_rng(seed).permutation(list(rewards) * ROUNDS)
    for i, hue in enumerate(order):
        counts = c.look(float(hue), seed + i)
        plasticity.valence(keys, counts, len(c.kc))
        reward = rewards[float(hue)]
        d = reward if not callable(reward) else reward()
        plasticity.learn(keys, [d] * BATCH, len(c.kc))
    return keys


def preference(c: Colours, keys: list[int], seed: int) -> tuple[float, float]:
    """Share of flies preferring A over B, on fresh looks that do not teach; and the mean valence gap."""
    saved = [plasticity.of(k, len(c.kc))["elig"] for k in keys]
    gap = np.zeros(BATCH)
    for t in range(4):                                  # a few looks, as a fly gets
        gap += plasticity.valence(keys, c.look(A, seed + t), len(c.kc))
        gap -= plasticity.valence(keys, c.look(B, seed + 100 + t), len(c.kc))
    for k, e in zip(keys, saved):
        plasticity.of(k, len(c.kc))["elig"] = e
    return float((gap > 0).mean()), float(gap.mean() / 4)


def bench(c: Colours, seed: int) -> dict:
    a1, a2, b1 = c.look(A, seed), c.look(A, seed + 1), c.look(B, seed + 2)
    corr = lambda x, y: float(np.corrcoef(x.mean(0), y.mean(0))[0, 1])     # noqa: E731
    out = {"kc_active": round(float((a1 > 0).mean()), 4), "same_colour": round(corr(a1, a2), 3), "two_leaders": round(corr(a1, b1), 3)}
    rng = np.random.default_rng(seed)
    k = train(c, {A: 1.0, B: -1.0}, f"a{seed}", seed + 10)
    out["prefers rewarded"], out["gap"] = preference(c, k, seed + 500)
    out["gap"] = round(out["gap"], 3)
    near = {}
    for dh in LOOKALIKE:
        v = np.mean([plasticity.valence(k, c.look(A + dh, seed + 600 + i), len(c.kc)) for i in range(3)], 0)
        near[dh] = round(float(v.mean()), 3)
    out["valence by hue distance"] = near
    k2 = train(c, {A: -1.0, B: 1.0}, f"b{seed}", seed + 20)
    out["flipped: prefers A"], _ = preference(c, k2, seed + 800)
    k3 = train(c, {A: lambda: float(rng.choice([-1, 1])), B: lambda: float(rng.choice([-1, 1]))}, f"c{seed}", seed + 30)
    out["random rewards: prefers A"], _ = preference(c, k3, seed + 900)
    return out


def main() -> None:
    plasticity.configure(punish=False)
    plasticity.LR = 0.25                                # 24 trials, not a season: picked before the run, on nothing else
    brain = FlyBrain(batch=BATCH, sensory_input=False)
    c = Colours(brain)
    print(f"{len(c.cells)} visual neurons feed the Kenyon cells; {len(c.kc)} visual Kenyon cells", flush=True)
    real = bench(c, 51000)
    print(json.dumps(real, indent=1), flush=True)
    from flytalk import rewire
    rewire(brain, seed=9)
    c2 = Colours.__new__(Colours)
    c2.__dict__.update(c.__dict__)
    fake = bench(c2, 61000)
    print("scrambled wiring:", json.dumps(fake), flush=True)
    res = {"real": real, "scrambled": fake,
           "PATTERNS": real["same_colour"] - real["two_leaders"] >= 0.2,
           "LEARNS": real["prefers rewarded"] >= 0.9,
           "FLIPS": real["flipped: prefers A"] <= 0.1,
           "CONTROL": 0.3 <= real["random rewards: prefers A"] <= 0.7,
           "WIRING": real["prefers rewarded"] - fake["prefers rewarded"] >= 0.2}
    (HERE / "runs" / "imprint.json").write_text(json.dumps(res, indent=1))
    print({k: v for k, v in res.items() if k.isupper()})


if __name__ == "__main__":
    main()
