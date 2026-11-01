"""Fire on real footage: does anything beyond colour tell fire from things that only look like it?

    python drone/fire.py clips --dry                 # list the clips and their splits, no brain
    python drone/fire.py clips --seed 9201           # the test, then 9202 to repeat

The route is gestures.py's: grey camera -> motion model -> T4/T5 -> connectome -> descending neurons. The picture is grey and the motion model scales each
moment to its own contrast, so no colour step is involved. A ridge readout on the descending neurons, ours, says fire or not. Flies see little red, so
colour would test our colour step more than the connectome; flame flicker and rolling smoke are what this route could pick up.

Footage: runs/clips/forest/. Fire = fire/, smoke/, aerial_fire/. Not fire = no_fire/, tricky/ (red leaves, sunset smoke, fireworks, a volcano). Four windows
of 1.2 s from each clip, scored per clip. Clips from one shoot stay on one side of every split (leave one shoot out). Nothing is tuned on this footage: the motion
model's constants are gestures.py's, and the readout's are fixed below.

Rules fixed before running, seed 9201, a pass only counts if it repeats on 9202 (area under the curve, 95% bootstrap over shoots):
    DETECT     at least 0.80, interval above 0.5
    WIRING     at least 0.10 over scrambled wiring, interval above 0
    COLOUR     at least 0.05 over the share of fire-coloured pixels
    MOVEMENT   at least 0.05 over how much the picture changes: drone footage moves more than a tripod, so a readout could score well on camera movement alone
    TRICKY     at most 3 of the 8 tricky clips called fire, at a cutoff set on the other shoots to catch 80% of their fire

Reported, not ruled: the same readout straight on the motion model with no neurons in between. It will probably do as well or better, as with gestures.
Limits: about 50 clips, and the fire and no-fire footage comes from different cameras and places, so a pass may partly be about the footage. The clips were sorted by
what they show, not checked frame by frame, and each has its site's licence.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
import gestures as g  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
from flytalk import rewire  # noqa: E402

CLIPS = HERE / "runs" / "clips" / "forest"
OUT = HERE / "runs" / "fire"
FIRE, NOT_FIRE = ("fire", "smoke", "aerial_fire"), ("no_fire", "tricky")
WINDOWS = 4
RIDGE = 1000.0
CATCH = 0.8
BATCH = 24


def shoot(path: Path) -> str:
    """Which clips must stay together: see PLAN.md 5b."""
    name = path.stem
    number = re.search(r"(\d+)$", name)
    n = number.group(1) if number else name
    if path.parent.name == "smoke" or name.startswith("fire_consuming_nature"):
        return "firefighters"
    if n[:5] in ("29702", "29703", "29704"):
        return "aerial_autumn_fire"
    if n[:5] in ("31361", "33660"):
        return "pexels" + n[:5]
    if name.startswith("aerial_mist"):
        return "aerial_mist"
    return n


def catalogue() -> list[dict]:
    out = []
    for folder in FIRE + NOT_FIRE:
        for f in sorted((CLIPS / folder).glob("*.mp4")):
            out.append({"path": f, "name": f.stem, "folder": folder, "fire": folder in FIRE, "shoot": shoot(f)})
    return out


def windows(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Evenly spaced windows of the clip: grey (WINDOWS, FRAMES, H, W), share of fire-coloured pixels and how much the picture changes, per window."""
    cap = cv2.VideoCapture(str(path))
    step = max(1, round((cap.get(cv2.CAP_PROP_FPS) or g.FPS) / g.FPS))
    grey, hot, i = [], [], 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        i += 1
        if i % step:
            continue
        s = cv2.resize(f, (g.W, g.H), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(s, cv2.COLOR_BGR2HSV)
        hot.append(float((((hsv[..., 0] < 25) | (hsv[..., 0] > 170)) & (hsv[..., 1] > 100) & (hsv[..., 2] > 120)).mean()))     # red to orange, OpenCV hue 0-180
        grey.append(cv2.cvtColor(s, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255)
    cap.release()
    grey, hot = np.array(grey), np.array(hot)
    if len(grey) < g.FRAMES:
        grey = np.concatenate([grey, np.repeat(grey[-1:], g.FRAMES - len(grey), 0)])
        hot = np.r_[hot, np.repeat(hot[-1:], g.FRAMES - len(hot))]
    starts = np.linspace(0, len(grey) - g.FRAMES, WINDOWS).astype(int)
    parts = np.stack([grey[s:s + g.FRAMES] for s in starts])
    return parts, np.array([hot[s:s + g.FRAMES].mean() for s in starts]), np.abs(np.diff(parts, axis=1)).mean((1, 2, 3))


def auc(score: np.ndarray, y: np.ndarray) -> float:
    pos, neg = score[y], score[~y]
    return float(((pos[:, None] > neg[None]).sum() + 0.5 * (pos[:, None] == neg[None]).sum()) / (len(pos) * len(neg)))


def held_out(X: np.ndarray, cat: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Leave one shoot out. X: (clips, WINDOWS, features). Each clip's score, and whether it's called fire at a cutoff from the other shoots."""
    y = np.array([c["fire"] for c in cat])
    shoots = np.array([c["shoot"] for c in cat])
    score, called = np.zeros(len(cat)), np.zeros(len(cat), bool)
    for s in np.unique(shoots):
        test = shoots == s
        score[test] = fit_score(X[~test], y[~test], X[test])
        inner = np.zeros(int((~test).sum()))           # the cutoff comes from held-out scores too: scores on its own training data would run high
        rest = shoots[~test]
        for r in np.unique(rest):
            part = rest == r
            inner[part] = fit_score(X[~test][~part], y[~test][~part], X[~test][part])
        called[test] = score[test] >= np.quantile(inner[y[~test]], 1 - CATCH)
    return score, called


def fit_score(train: np.ndarray, y: np.ndarray, test: np.ndarray) -> np.ndarray:
    """Ridge on windows, each test clip's score the mean over its windows. Inputs (clips, WINDOWS, features)."""
    A, B = train.reshape(-1, train.shape[-1]), test.reshape(-1, test.shape[-1])
    mu, sd = A.mean(0), A.std(0) + 1e-2
    A, B = (A - mu) / sd, (B - mu) / sd
    target = np.repeat(np.where(y, 1.0, -1.0), WINDOWS)
    coef = np.linalg.solve(A @ A.T + RIDGE * np.eye(len(A)), target - target.mean())
    return (B @ (A.T @ coef)).reshape(-1, WINDOWS).mean(1)


def boot(scores: list[np.ndarray], y: np.ndarray, shoots: np.ndarray, reps: int = 5000) -> tuple[float, float]:
    """95% interval over shoots of the area under the curve, or of the first minus the second when given two scores."""
    rng = np.random.default_rng(0)
    names = np.unique(shoots)
    members = {s: np.flatnonzero(shoots == s) for s in names}
    vals = []
    for _ in range(reps):
        i = np.concatenate([members[s] for s in rng.choice(names, len(names))])
        if y[i].all() or not y[i].any():
            continue
        a = auc(scores[0][i], y[i])
        vals.append(a - auc(scores[1][i], y[i]) if len(scores) > 1 else a)
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def run(cat: list[dict], parts: np.ndarray, brain: FlyBrain, retina: g.Retina, seed: int) -> np.ndarray:
    flat = parts.reshape(-1, *parts.shape[2:])
    return g.dn_features(g.brain_counts(flat, brain, retina, seed)).reshape(len(cat), WINDOWS, -1)


def clips(a) -> None:
    cat = catalogue()
    y = np.array([c["fire"] for c in cat])
    shoots = np.array([c["shoot"] for c in cat])
    if a.dry:
        for c in cat:
            print(f"{c['folder']:12} {c['shoot']:20} {c['name']}")
        print(f"{len(cat)} clips, {y.sum()} fire, {len(np.unique(shoots))} shoots")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    got = [windows(c["path"]) for c in cat]
    parts = np.stack([x[0] for x in got])
    hot, change = np.array([x[1].mean() for x in got]), np.array([x[2].mean() for x in got])
    print(f"{len(cat)} clips read", flush=True)
    brain = FlyBrain(batch=BATCH, seed=a.seed, sensory_input=False)
    retina = g.Retina(brain)
    real = run(cat, parts, brain, retina, a.seed * 100)
    rewire(brain, seed=a.seed + 3)
    scr = run(cat, parts, brain, retina, a.seed * 100 + 50000)
    plain = g.no_brain_features(parts.reshape(-1, *parts.shape[2:])).reshape(len(cat), WINDOWS, -1)
    np.savez_compressed(OUT / f"clips{a.seed}.npz", real=real.astype(np.float32), scrambled=scr.astype(np.float32), plain=plain, hot=hot, change=change)

    s_real, called = held_out(real, cat)
    s_scr, _ = held_out(scr, cat)
    s_plain, _ = held_out(plain, cat)
    res = {"seed": a.seed, "clips": len(cat), "shoots": len(np.unique(shoots)), "auc": {k: round(auc(v, y), 3) for k, v in
                                                                                        (("brain", s_real), ("scrambled", s_scr), ("no_brain", s_plain), ("colour", hot), ("change", change))}}
    res["interval"] = [round(v, 3) for v in boot([s_real], y, shoots)]
    res["over_scrambled"] = [round(res["auc"]["brain"] - res["auc"]["scrambled"], 3)] + [round(v, 3) for v in boot([s_real, s_scr], y, shoots)]
    res["called_fire"] = {f: f"{int(called[[c['folder'] == f for c in cat]].sum())} of {sum(c['folder'] == f for c in cat)}" for f in FIRE + NOT_FIRE}
    tricky = int(called[[c["folder"] == "tricky" for c in cat]].sum())
    res["rules"] = {"DETECT": res["auc"]["brain"] >= 0.8 and res["interval"][0] > 0.5,
                    "WIRING": res["over_scrambled"][0] >= 0.1 and res["over_scrambled"][1] > 0,
                    "COLOUR": res["auc"]["brain"] - res["auc"]["colour"] >= 0.05,
                    "MOVEMENT": res["auc"]["brain"] - res["auc"]["change"] >= 0.05,
                    "TRICKY": tricky <= 3}
    res["per_clip"] = [{"name": c["name"], "folder": c["folder"], "score": round(float(s), 3), "called": bool(k)} for c, s, k in zip(cat, s_real, called)]
    (OUT / f"clips{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: v for k, v in res.items() if k != "per_clip"}, indent=1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    c = sub.add_parser("clips")
    c.add_argument("--seed", type=int, default=9201)
    c.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    clips(a)


if __name__ == "__main__":
    main()
