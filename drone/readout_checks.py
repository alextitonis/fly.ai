"""World-Sim's readout ideas, tested on the gesture readout (needs drone/runs/gesture_counts.npz from gestures.py measure).

    python drone/readout_checks.py

Rules fixed before running:
  SAME NEURONS  two readouts trained on separate clips, the 50 neurons whose removal hurts each most: overlap (IoU) at
                least 3x what two random sets of 50 would share (World-Sim value_neuron_iou.py). Otherwise the readout is
                memorising its examples.
  THINK LESS    read the first 0.6 s; go on to the full 1.2 s only when the top two gestures are close. Costs at most 60%
                of the brain time, accuracy within 2 points of always reading it all.
  REFUSE        train without push and pull. At the threshold that refuses 10% of known gestures, it refuses at least 70%
                of push and pull instead of naming them something else.
  NOTICE CHANGE the camera gets mirrored. A small fixed set of known clips (the canary) is re-run at each check: no false
                alarm in 3 checks without the change, caught at the first check after it, the readout really got worse
                (at least 15 points), and a short retrain gets it back to within 10 points. Without the retrain it stays broken.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gestures as g  # noqa: E402

SHORT = g.FRAMES // 2
CANARY_DROP = 0.15


def model():
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.001, max_iter=800))


def x_of(counts: np.ndarray, frames: int | None = None) -> np.ndarray:
    return g.dn_features(counts[:, :frames])


def same_neurons(tr, ty, te, ey, k: int = 50) -> dict:
    half = len(tr) // 2
    a, b = model().fit(x_of(tr[:half]), ty[:half]), model().fit(x_of(tr[half:]), ty[half:])
    probe = x_of(te)

    def rank(m) -> set:
        p = m.predict_log_proba(probe)
        base = -p[np.arange(len(ey)), ey].mean()
        cost = np.zeros(probe.shape[1])
        for i in np.flatnonzero(probe.std(0) > 0):
            x = probe.copy()
            x[:, i] = 0
            cost[i] = -m.predict_log_proba(x)[np.arange(len(ey)), ey].mean() - base
        return set(np.argsort(-cost)[:k])

    ra, rb = rank(a), rank(b)
    iou = len(ra & rb) / len(ra | rb)
    n = probe.shape[1]
    inter = k * k / n
    rand = inter / (2 * k - inter)
    return {"iou": round(iou, 3), "random": round(rand, 3), "times_random": round(iou / rand, 1), "pass": bool(iou >= 3 * rand)}


def think_less(tr, ty, te, ey) -> dict:
    short, full = model().fit(x_of(tr, SHORT), ty), model().fit(x_of(tr), ty)
    half = len(te) // 2
    margin = lambda m, c: np.diff(np.sort(m.predict_proba(x_of(c, SHORT)), 1)[:, -2:], axis=1).ravel()    # noqa: E731
    val_m, val_s, val_f = margin(short, te[:half]), short.predict(x_of(te[:half], SHORT)), full.predict(x_of(te[:half]))
    best = 1.0                                         # smallest threshold keeping validation within 1 point
    for th in np.linspace(0, 1, 41):
        use = np.where(val_m >= th, val_s, val_f)
        if (use == ey[:half]).mean() >= (val_f == ey[:half]).mean() - 0.01:
            best = th
            break
    m, s, f = margin(short, te[half:]), short.predict(x_of(te[half:], SHORT)), full.predict(x_of(te[half:]))
    use = np.where(m >= best, s, f)
    cost = ((m >= best) * SHORT + (m < best) * g.FRAMES).mean() / g.FRAMES
    acc, acc_full = float((use == ey[half:]).mean()), float((f == ey[half:]).mean())
    return {"threshold": round(float(best), 3), "brain_time": round(float(cost), 3), "accuracy": round(acc, 3), "always_full": round(acc_full, 3),
            "short_only": round(float((s == ey[half:]).mean()), 3), "pass": bool(cost <= 0.6 and acc >= acc_full - 0.02)}


def refuse(tr, ty, te, ey) -> dict:
    unseen = {g.GESTURES.index("push"), g.GESTURES.index("pull")}
    known = ~np.isin(ty, list(unseen))
    m = model().fit(x_of(tr[known]), ty[known])
    conf = m.predict_proba(x_of(te)).max(1)
    known_te = ~np.isin(ey, list(unseen))
    idx = np.flatnonzero(known_te)
    val, test = idx[::2], idx[1::2]
    th = np.quantile(conf[val], 0.10)
    pred = m.predict(x_of(te))
    return {"threshold": round(float(th), 3), "refused_known": round(float((conf[test] < th).mean()), 3),
            "refused_unseen": round(float((conf[~known_te] < th).mean()), 3),
            "known_accuracy_not_refused": round(float((pred[test][conf[test] >= th] == ey[test][conf[test] >= th]).mean()), 3),
            "pass": bool((conf[~known_te] < th).mean() >= 0.7)}


def notice_change(tr, ty, batch: int = 24) -> dict:
    from flybrain import FlyBrain
    m = model().fit(x_of(tr), ty)
    brain = FlyBrain(batch=batch, sensory_input=False)
    retina = g.Retina(brain)
    canary, cy = g.dataset(4, 77001, hard=False)
    score = lambda clips, y, seed, mdl=m: float((mdl.predict(x_of(g.brain_counts(clips, brain, retina, seed))) == y).mean())   # noqa: E731
    base = score(canary, cy, 81000)
    checks = [score(canary, cy, 82000 + i * 1000) for i in range(3)]
    alarms = [c <= base - CANARY_DROP for c in checks]
    mirror = lambda c: c[..., ::-1].copy()              # noqa: E731
    seen = score(mirror(canary), cy, 86000)
    caught = seen <= base - CANARY_DROP
    held, hy = g.dataset(20, 77002, hard=False)
    before = score(held, hy, 87000)
    broken = score(mirror(held), hy, 88000)
    burst, by = g.dataset(14, 77003, hard=False)        # a short retrain: 2 s of labelled clips per gesture... 98 clips
    burst_x = x_of(g.brain_counts(mirror(burst), brain, retina, 89000))
    new = model().fit(np.vstack([burst_x]), by)
    after = score(mirror(held), hy, 90000, new)
    return {"canary_base": round(base, 3), "checks_no_change": [round(c, 3) for c in checks], "false_alarms": int(sum(alarms)),
            "canary_after_mirror": round(seen, 3), "caught_first_check": bool(caught), "accuracy_before": round(before, 3),
            "accuracy_mirrored": round(broken, 3), "accuracy_after_retrain": round(after, 3),
            "pass": bool(not any(alarms) and caught and before - broken >= 0.15 and after >= before - 0.10)}


def main() -> None:
    d = np.load(g.OUT / "gesture_counts.npz")
    tr, ty, te, ey = d["train"], d["train_y"], d["x_test"], d["y_test"]
    results = {"same neurons": same_neurons(tr, ty, te, ey)}
    print(json.dumps(results, indent=1), flush=True)
    results["think less"] = think_less(tr, ty, te, ey)
    results["refuse"] = refuse(tr, ty, te, ey)
    print(json.dumps(results, indent=1), flush=True)
    results["notice change"] = notice_change(tr, ty)
    (g.OUT / "readout_checks.json").write_text(json.dumps(results, indent=1))
    print(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
