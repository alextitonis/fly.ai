"""A swipe turns the fly with nothing trained: fixed left and right descending neurons, read directly.

    python drone/reflex.py                             # the fixed test, rendered hands
    python drone/reflex.py --clip hand.mp4             # real hand on a green screen, truth from its own movement

The route is gestures.py's (camera -> motion model -> T4/T5 -> connectome), but there is no readout to train: the signal is
DNg41 + DNb03 on the right minus on the left, in Hz. These types were picked from a screen of full-field motion (they
answer rightward motion on the right and leftward on the left). Signal above +DEAD says right, below -DEAD says left.

Rules fixed before running (fresh seeds): left and right swipes turn the right way at least 75% of the time; at least 20
points better than scrambled wiring; a still hand turns at most 25% of the time.
"""
from __future__ import annotations

import argparse
import json
import sys

import cv2
import numpy as np

import gestures as g
from flybrain import FlyBrain

TYPES = ["DNg41", "DNb03"]
OFFSET = -1.78       # Hz: this brain's lean at rest, from the still clips of the gesture run (development data)
DEAD = 3.0           # Hz: inside this it goes straight


class Reflex:
    def __init__(self, brain: FlyBrain):
        self.brain = brain
        sc, ct, side = brain.superclass.astype(str), brain.cell_type.astype(str), brain.side.astype(str)
        dn = np.flatnonzero(np.isin(sc, ["descending_neuron", "descending_neuron_tbc"]))
        m = np.isin(ct[dn], TYPES)
        self.r, self.l = np.flatnonzero(m & (side[dn] == "R")), np.flatnonzero(m & (side[dn] == "L"))

    def signal(self, counts: np.ndarray) -> np.ndarray:
        """counts: (clips, frames, DNs) -> Hz, right minus left, less the lean at rest."""
        hz = counts.sum(1) / (counts.shape[1] * g.STEPS_PER_FRAME * self.brain.dt)
        return hz[:, self.r].sum(1) - hz[:, self.l].sum(1) - OFFSET


def says(sig: np.ndarray) -> list[str]:
    return ["right" if s > DEAD else "left" if s < -DEAD else "straight" for s in sig]


def score(sig: np.ndarray, y: np.ndarray) -> dict:
    words = np.array(says(sig))
    out = {}
    for name in g.GESTURES:
        i = g.GESTURES.index(name)
        out[name] = {"right": round(float((words[y == i] == "right").mean()), 2), "left": round(float((words[y == i] == "left").mean()), 2),
                     "signal": round(float(sig[y == i].mean()), 1)}
    swipes = np.r_[words[y == g.GESTURES.index("swipe left")] == "left", words[y == g.GESTURES.index("swipe right")] == "right"]
    still = y == g.GESTURES.index("still")
    return {"turns_right_way": round(float(swipes.mean()), 3), "still_turns": round(float((words[still] != "straight").mean()), 3), "by_gesture": out}


def measure(args) -> None:
    from flytalk import rewire
    sets = {"new clips": g.dataset(20, args.seed, False), "hands never seen": g.dataset(20, args.seed + 1, True)}
    brain = FlyBrain(batch=24, sensory_input=False)
    retina, reflex = g.Retina(brain), Reflex(brain)
    res = {"real": {}, "scrambled": {}}
    for j, (k, (x, y)) in enumerate(sets.items()):
        res["real"][k] = score(reflex.signal(g.brain_counts(x, brain, retina, 110000 + j * 7000)), y)
        print(k, "real", json.dumps(res["real"][k]), flush=True)
    rewire(brain, seed=args.seed + 3)
    for j, (k, (x, y)) in enumerate(sets.items()):
        res["scrambled"][k] = score(reflex.signal(g.brain_counts(x, brain, retina, 120000 + j * 7000)), y)
        print(k, "scrambled", json.dumps(res["scrambled"][k]), flush=True)
    new = "new clips"
    res["rules"] = {"right way 75%": all(res["real"][k]["turns_right_way"] >= 0.75 for k in sets),
                    "20 pts over scrambled": all(res["real"][k]["turns_right_way"] - res["scrambled"][k]["turns_right_way"] >= 0.2 for k in sets),
                    "still at most 25%": res["real"][new]["still_turns"] <= 0.25}
    (g.OUT / "reflex.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res["rules"]))


def clip_test(args) -> None:
    """A real hand on a green screen: where the hand really went comes from the green key, nothing labelled by hand."""
    brain = FlyBrain(batch=1, sensory_input=False)
    retina, reflex = g.Retina(brain), Reflex(brain)
    cap = cv2.VideoCapture(args.clip)
    step = max(1, round((cap.get(cv2.CAP_PROP_FPS) or 25) / g.FPS))
    grey, cent, i = [], [], 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        i += 1
        if i % step:
            continue
        if args.mirror:
            f = f[:, ::-1].copy()
        s = cv2.resize(f, (g.W, g.H), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(s, cv2.COLOR_BGR2HSV)
        ys, xs = np.nonzero(~((hsv[..., 0] > 30) & (hsv[..., 0] < 80) & (hsv[..., 1] > 80)))
        cent.append(xs.mean() if len(xs) > 3 else np.nan)
        grey.append(cv2.cvtColor(s, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255)
    grey, cent = np.array(grey), np.array(cent)
    rows = []
    for start in range(0, len(grey) - g.FRAMES, g.FRAMES // 2):
        c = cent[start:start + g.FRAMES]
        c = c[~np.isnan(c)]
        moved = (c[-1] - c[0]) / g.W if len(c) >= 5 else 0.0
        truth = "right" if moved > 0.2 else "left" if moved < -0.2 else "none"
        sig = float(reflex.signal(g.run_clips(brain, retina, grey[start:start + g.FRAMES][None], 7000 + start))[0])
        rows.append((start, truth, says(np.array([sig]))[0], round(sig, 1)))
        print(rows[-1], flush=True)
    moved_rows = [r for r in rows if r[1] != "none"]
    print(json.dumps({"windows": len(rows), "moved sideways": len(moved_rows), "right way": sum(r[1] == r[2] for r in moved_rows),
                      "wrong way": sum(r[2] not in ("straight", r[1]) for r in moved_rows), "went straight": sum(r[2] == "straight" for r in moved_rows),
                      "no sideways move but turned": sum(r[2] != "straight" for r in rows if r[1] == "none"), "no sideways move": len(rows) - len(moved_rows)}))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--clip")
    ap.add_argument("--mirror", action="store_true")
    ap.add_argument("--seed", type=int, default=3031)
    a = ap.parse_args()
    (clip_test if a.clip else measure)(a)


if __name__ == "__main__":
    main()
