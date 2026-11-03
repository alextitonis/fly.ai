"""Is that smoke? The patrol's fire step from the air: our own camera step, with nothing of the connectome in it.

    python drone/smoke.py train                     # learns from runs/clips/smoke_dev and runs/clips/forest, saves runs/smoke/model.joblib
    python drone/smoke.py clips --folder smoke_test # the test, once

flame.py can't do this: from the air flames are too small or hidden (1 of 15 aerial clips even has flame colours), so what shows is smoke. MobileNet V3 small with its ImageNet weights,
untouched, then a logistic regression on top, trained on aerial footage. Small enough for a drone's onboard computer. The top third of the picture is left out, since a camera tilted down doesn't see it.
A clip is called fire when the mean score over LOOKS frames, evenly spaced across it, reaches CUTOFF.

Tried first on development clips, leave one shoot out, and dropped: how much of the view is pale and soft scored 0.92 on the first clips and 0.73 once fog, snow and cloud were added, and motion against the ground added nothing (0.39-0.46).
This model on the same clips: 0.95, 27 of 31 fires and 2 of 39 not-fire at CUTOFF. C and CUTOFF were set there. Misses were a night fire and a tiny plume far off.

Rules fixed before running, once, on runs/clips/smoke_test/. Clips were picked by title alone, downloaded before any of this was built, not looked at, whole shoots kept to one side, nothing removed afterwards:
    CATCH     at least 12 of the 16 fire clips called
    FALSE     at most 3 of the 28 not-fire clips called. Many are fog, mist, cloud or snow on purpose
    BEATS     area under the curve at least 0.10 over the pale-and-soft measure on the same clips
Reported, no rule: the area under the curve, the same model on the drone's 128 x 96 pictures, and the time per frame on this CPU.

Result 2026-11-02, 2 of 3 once a leak is removed. As run: 13 of 16, 2 of 28, +0.48, which looks like 3 of 3 but isn't clean: the split kept whole shoots apart only among the new clips, and 14 of the 16 test fires sit next to a shoot in runs/clips/forest/aerial_fire, which is in training.
Retrained with the same settings without the 18 training clips close to a test shoot (id prefix within 1), then scored on the same test clips: CATCH 10 of 16, MISS. FALSE 0 of 28, pass. BEATS 0.911 against 0.451, pass. This is the result to quote (runs/smoke/smoke_test_clean.json).
Prefix-matching is a guess at what a shoot is, so some overlap may remain. model.joblib is still the version with all 70 clips. smoke_test is used up: any retuning needs new clips and a new rule.
It doesn't read the simulator's smoke: 0 of 24 views from patrol height with a fire scored above the cutoff, 0.00 on average, with the forest's plain trees and small dark smoke.

Second test, `python drone/smoke.py heldout`, rules fixed before downloading its clips. New clips in runs/clips/smoke_more/, picked by title, at most 6 from a shoot, not looked at: fire titles leaving out aftermath, regrowth, fireworks, cities and vehicles; not-fire from the same kinds of searches as before.
A shoot is every clip whose id prefix is within 1 of another, across every folder. Each shoot is held out in turn and the model trains on all the others, old test clips included. Only the new clips are scored. C, LOOKS and CUTOFF stay as they are:
    CATCH     at least 75% of the new fire clips called
    FALSE     at most 10% of the new not-fire clips called
Reported, no rule: the area under the curve, the catch rate counting each shoot once, 95% bootstrap over shoots, and other cutoffs.
Result 2026-11-02, both passed: 82% of 60 fire clips (61 to 94%), 6% of 80 not-fire clips (1 to 12%), area 0.96. Counting each of the 16 fire shoots once, 67%. smoke_more is used up. model.joblib is still the 70-clip version, not trained on these.
Limits: stock footage, mostly daylight, shot by few people, so different videographers may share a look across the two sets, and it has only ever seen well-framed fires. A real patrol would want a heat camera as well. Nothing here is the connectome's.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import cv2
import joblib
import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

HERE = Path(__file__).resolve().parent
CLIPS = HERE / "runs" / "clips"
OUT = HERE / "runs" / "smoke"
LOOKS = 6
C = 0.01
CUTOFF = 0.5
SIZE = 224
TRAIN_SETS = ((CLIPS / "smoke_dev" / "fire", 1), (CLIPS / "forest" / "aerial_fire", 1), (CLIPS / "smoke_dev" / "not_fire", 0), (CLIPS / "forest" / "no_fire", 0))
MEAN, STD = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)


def below_horizon(rgb: np.ndarray) -> np.ndarray:
    return rgb[rgb.shape[0] // 3:]


class Features:
    def __init__(self, threads: int = 2):
        torch.set_num_threads(threads)
        self.net = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).eval()
        self.net.classifier = torch.nn.Identity()

    def __call__(self, pictures: list[np.ndarray]) -> np.ndarray:
        """RGB uint8 pictures of any size -> (pictures, features)."""
        x = np.stack([cv2.resize(below_horizon(p), (SIZE, SIZE), interpolation=cv2.INTER_AREA) for p in pictures]).astype(np.float32) / 255
        with torch.no_grad():
            return self.net(torch.from_numpy(((x - MEAN) / STD).transpose(0, 3, 1, 2))).numpy()


class SmokeEye:
    """For flight: score(pictures) is the chance each RGB picture shows a fire's smoke. Ours, not the connectome's."""

    def __init__(self, path: Path = OUT / "model.joblib", threads: int = 2):
        self.features, self.top = Features(threads), joblib.load(path)

    def score(self, pictures: list[np.ndarray]) -> np.ndarray:
        return self.top.predict_proba(self.features(pictures))[:, 1]


def frames_of(path: Path, size: tuple[int, int] | None = None) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    out = []
    for at in np.linspace(total * 0.05, max(total * 0.95 - 1, 0), LOOKS).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(at))
        ok, f = cap.read()
        if ok:
            if size:
                f = cv2.resize(f, size, interpolation=cv2.INTER_AREA)
            out.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    cap.release()
    return out


def pale_share(rgb: np.ndarray) -> float:
    """The measure this replaced: how much of the view below the horizon is pale and soft."""
    f = below_horizon(cv2.resize(rgb, (128, 96), interpolation=cv2.INTER_AREA)).astype(np.float32) / 255
    top, low = f.max(2), f.min(2)
    grey = f.mean(2)
    edge = cv2.blur(np.abs(cv2.Laplacian(cv2.GaussianBlur(grey, (3, 3), 0), cv2.CV_32F)), (9, 9))
    return float(((edge < 0.035) & ((top - low) / np.maximum(top, 1e-3) < 0.35) & (grey > 0.25)).mean())


def auc(score: np.ndarray, y: np.ndarray) -> float:
    p, n = score[y == 1], score[y == 0]
    return float(((p[:, None] > n[None]).sum() + 0.5 * (p[:, None] == n[None]).sum()) / (len(p) * len(n)))


def train() -> None:
    features = Features()
    X, Y, n = [], [], 0
    for folder, label in TRAIN_SETS:
        for f in sorted(folder.glob("*.mp4")):
            fr = frames_of(f)
            if fr:
                X.append(features(fr))
                Y += [label] * len(fr)
                n += 1
    top = make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=2000, class_weight="balanced")).fit(np.concatenate(X), np.array(Y))
    OUT.mkdir(parents=True, exist_ok=True)
    joblib.dump(top, OUT / "model.joblib")
    print(f"trained on {n} clips, {len(Y)} frames")


def clips(folder: str) -> None:
    eye = SmokeEye()
    root = CLIPS / folder
    rows = []
    for label_dir, label in ((root / "fire", 1), (root / "not_fire", 0)):
        for f in sorted(label_dir.glob("*.mp4")):
            fr = frames_of(f)
            if not fr:
                print("unreadable, counted as not called:", f.stem, flush=True)
                rows.append({"name": f.stem, "fire": label, "score": 0.0, "small": 0.0, "pale": 0.0})
                continue
            small = frames_of(f, (128, 96))
            rows.append({"name": f.stem, "fire": label, "score": round(float(eye.score(fr).mean()), 3), "small": round(float(eye.score(small).mean()), 3), "pale": round(float(np.mean([pale_share(p) for p in fr])), 3)})
            print(json.dumps(rows[-1]), flush=True)
    y = np.array([r["fire"] for r in rows])
    s, small, pale = (np.array([r[k] for r in rows]) for k in ("score", "small", "pale"))
    t0 = time.perf_counter()
    for _ in range(20):
        eye.score(fr[:1])
    res = {"folder": folder, "fire_clips": int(y.sum()), "not_fire_clips": int((y == 0).sum()), "called_fire": int((s[y == 1] >= CUTOFF).sum()), "called_not_fire": int((s[y == 0] >= CUTOFF).sum()),
           "auc": round(auc(s, y), 3), "auc_pale": round(auc(pale, y), 3), "small_called_fire": int((small[y == 1] >= CUTOFF).sum()), "small_called_not_fire": int((small[y == 0] >= CUTOFF).sum()),
           "auc_small": round(auc(small, y), 3), "ms_per_frame": round((time.perf_counter() - t0) / 20 * 1000, 1), "clips": rows}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{folder}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: v for k, v in res.items() if k != "clips"}, indent=1))
    if folder == "smoke_test":
        print(f"CATCH  {res['called_fire']} of {res['fire_clips']}: {'PASS' if res['called_fire'] >= 12 else 'MISS'}")
        print(f"FALSE  {res['called_not_fire']} of {res['not_fire_clips']}: {'PASS' if res['called_not_fire'] <= 3 else 'MISS'}")
        print(f"BEATS  {res['auc'] - res['auc_pale']:+.3f} over pale and soft: {'PASS' if res['auc'] - res['auc_pale'] >= 0.1 else 'MISS'}")


def shoots(names: list[str]) -> list[str]:
    """Which clips must stay together: runs of id prefixes within 1 are one shoot. A clip with no Pexels id is its own."""
    prefix = [int(m.group(1)[:5]) if (m := re.search(r"pexels(\d+)$", n)) else None for n in names]
    groups: dict[int, int] = {}
    for g, p in enumerate(sorted({p for p in prefix if p is not None})):
        groups[p] = groups[p - 1] if p - 1 in groups else g
    return [f"p{groups[p]}" if p is not None else n for n, p in zip(names, prefix)]


def heldout() -> None:
    features = Features()
    folders = ((CLIPS / "smoke_more" / "fire", 1, True), (CLIPS / "smoke_more" / "not_fire", 0, True), (CLIPS / "smoke_test" / "fire", 1, False), (CLIPS / "smoke_test" / "not_fire", 0, False)) + tuple((d, y, False) for d, y in TRAIN_SETS)
    rows = []
    for folder, y, new in folders:
        for f in sorted(folder.glob("*.mp4")):
            fr = frames_of(f)
            if fr:
                rows.append({"name": f.stem, "y": y, "new": new, "x": features(fr)})
        print(folder.name, len(rows), flush=True)
    who = np.array(shoots([r["name"] for r in rows]))
    score = np.full(len(rows), np.nan)
    for s in np.unique(who[[r["new"] for r in rows]]):
        test = who == s
        X = np.concatenate([rows[i]["x"] for i in np.flatnonzero(~test)])
        Y = np.concatenate([[rows[i]["y"]] * len(rows[i]["x"]) for i in np.flatnonzero(~test)])
        top = make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=2000, class_weight="balanced")).fit(X, Y)
        for i in np.flatnonzero(test):
            if rows[i]["new"]:
                score[i] = top.predict_proba(rows[i]["x"])[:, 1].mean()
    keep = np.flatnonzero(~np.isnan(score))
    y, s, g = np.array([rows[i]["y"] for i in keep]), score[keep], who[keep]
    fire_shoots = np.unique(g[y == 1])
    per_shoot = float(np.mean([(s[(g == k) & (y == 1)] >= CUTOFF).mean() for k in fire_shoots]))
    rng = np.random.default_rng(0)
    names = np.unique(g)
    boot = []
    for _ in range(5000):
        i = np.concatenate([np.flatnonzero(g == k) for k in rng.choice(names, len(names))])
        if y[i].any() and not y[i].all():
            boot.append(((s[i][y[i] == 1] >= CUTOFF).mean(), (s[i][y[i] == 0] >= CUTOFF).mean(), auc(s[i], y[i])))
    low, high = np.percentile(boot, (2.5, 97.5), axis=0)
    res = {"fire_clips": int(y.sum()), "not_fire_clips": int((y == 0).sum()), "shoots": len(names), "fire_shoots": len(fire_shoots), "catch": round(float((s[y == 1] >= CUTOFF).mean()), 3), "false": round(float((s[y == 0] >= CUTOFF).mean()), 3),
           "auc": round(auc(s, y), 3), "catch_each_shoot_once": round(per_shoot, 3), "interval_catch": [round(low[0], 3), round(high[0], 3)], "interval_false": [round(low[1], 3), round(high[1], 3)], "interval_auc": [round(low[2], 3), round(high[2], 3)],
           "by_cutoff": {str(c): [round(float((s[y == 1] >= c).mean()), 3), round(float((s[y == 0] >= c).mean()), 3)] for c in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7)},
           "clips": [{"name": rows[i]["name"], "fire": rows[i]["y"], "shoot": str(who[i]), "score": round(float(score[i]), 3)} for i in keep]}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "heldout.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: v for k, v in res.items() if k != "clips"}, indent=1))
    print(f"CATCH  {res['catch']:.0%}: {'PASS' if res['catch'] >= 0.75 else 'MISS'}")
    print(f"FALSE  {res['false']:.0%}: {'PASS' if res['false'] <= 0.1 else 'MISS'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    sub.add_parser("train")
    sub.add_parser("heldout")
    c = sub.add_parser("clips")
    c.add_argument("--folder", default="smoke_test")
    a = ap.parse_args()
    if a.what == "train":
        train()
    elif a.what == "heldout":
        heldout()
    else:
        clips(a.folder)


if __name__ == "__main__":
    main()
