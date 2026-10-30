"""Learning at the Kenyon-cell output synapses: which cells fired x dopamine = a change in what they say.

The three factors of the animal: which Kenyon cells were active when the fly looked (eligibility), how that turned out
(dopamine, + reward, - punishment), and the weight change, lr x dopamine x eligibility, with slow forgetting. The value of
a look is the learned weights against which cells fired, normalised so it reads WHICH cells fired, not how many. One
set of weights per fly, kept outside the connectome's own weights.
"""
from __future__ import annotations

import numpy as np

LR = 0.25               # how fast a synapse moves per unit of dopamine (a few dozen trials, not a season)
DECAY = 0.999           # slow forgetting
VALUE_AMOUNT = 0.5      # the largest value a look can have
CLIP = 3.0

STATE: dict[int, dict] = {}     # fly -> {w, elig}


def reset() -> None:
    STATE.clear()


def of(key: int, n_kc: int) -> dict:
    s = STATE.get(key)
    if s is None:
        s = STATE[key] = {"w": np.zeros(n_kc, np.float32), "elig": None}
    return s


def learn(keys: list[int], dopamine: list[float], n_kc: int) -> None:
    """The dopamine that arrived now goes to the cells each fly's last look left active."""
    for key, d in zip(keys, dopamine):
        s = of(key, n_kc)
        if s["elig"] is None or not d:
            continue
        s["w"] *= DECAY
        s["w"] += np.float32(LR * d) * s["elig"]
        np.clip(s["w"], -CLIP, CLIP, out=s["w"])


def value(keys: list[int], kc_counts: np.ndarray, n_kc: int) -> np.ndarray:
    """What each fly has learned about what it is looking at now, one number per fly. Leaves the trace learn() uses."""
    out = np.zeros(len(keys), np.float32)
    for i, key in enumerate(keys):
        s = of(key, n_kc)
        norm = np.linalg.norm(kc_counts[i])
        if norm > 1e-9:
            s["elig"] = (kc_counts[i] / norm).astype(np.float32)
            out[i] = float(np.tanh(s["w"] @ s["elig"]))
    return out * np.float32(VALUE_AMOUNT)
