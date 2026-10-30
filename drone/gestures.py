"""Hand gestures from a camera, read only through the fly's brain.

    python drone/gestures.py measure                 # rendered hands: real brain vs scrambled wiring vs no brain
    python drone/gestures.py record --takes 12       # your webcam: records takes of each gesture to drone/runs/my_hand/
    python drone/gestures.py measure --clips drone/runs/my_hand   # the same test on your own recordings
    python drone/gestures.py live                    # webcam, shows what the fly's brain reads (needs a fit from measure)

The route, with no hand detector and no vision network anywhere:

    camera -> a retina model: motion at each point, by direction, as a fly's motion detectors compute it
              (Hassenstein-Reichardt correlators, ON and OFF edges apart; nothing here is trained)
           -> T4 (ON) and T5 (OFF) neurons, the fly's real motion neurons, at their own place in the eye
           -> the connectome
           -> spikes of its 1,314 descending neurons
           -> one linear readout, trained on examples

Each T4/T5 neuron's place in the eye comes from the wiring: eye column (optic-columns.xlsx, via L1) -> the relay neurons
that take from L1 -> the T4/T5 that take from them. T4/T5 a, b, c, d are the four directions (a front-to-back, b
back-to-front, c up, d down; Maisak et al. 2013).

The camera sees what is in front of the fly: the left of the picture is in the left eye. The picture is mirrored like a
selfie, so a hand going to its owner's right moves right in the picture.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from flybrain import FlyBrain  # noqa: E402

GESTURES = ["still", "swipe left", "swipe right", "swipe up", "swipe down", "push", "pull"]
W, H = 64, 48            # the picture the retina model sees
FPS = 25                 # camera frames a second
CLIP_S = 1.2
FRAMES = int(CLIP_S * FPS)
STEPS_PER_FRAME = 2      # 20 ms brain steps per frame
WARM = 25                # brain steps before a clip
DRIVE_GAIN = 2.2         # volts per unit of normalised motion
POOL = 5.0               # pixels: how far a point's motion spreads to its neighbours
MOTION_FLOOR = 4e-4      # pooled correlator output below which there is no real motion (camera noise on a still hand)
CAP = 0.8                # most volts a neuron is given per step (the rest of the project's cap)
OUT = HERE / "runs"


# ---- rendered hands ---------------------------------------------------------------------------------------------
def draw_hand(img, x, y, size, angle, color, spread) -> None:
    """A palm and five fingers, as a filled shape."""
    s = size
    c, si = np.cos(angle), np.sin(angle)
    at = lambda u, v: (int(round(x + (c * u - si * v))), int(round(y + (si * u + c * v))))
    cv2.ellipse(img, at(0, 0), (max(1, int(s * 0.42)), max(1, int(s * 0.5))), np.degrees(angle), 0, 360, color, -1, cv2.LINE_AA)
    for i, (u, ln) in enumerate(((-0.36, 0.75), (-0.13, 0.95), (0.1, 1.0), (0.32, 0.8))):
        tip = (u * s * (1 + spread), -s * (0.45 + ln * 0.75))
        cv2.line(img, at(u * s, -s * 0.35), at(*tip), color, max(1, int(s * 0.17)), cv2.LINE_AA)
    cv2.line(img, at(s * 0.38, s * 0.05), at(s * (0.85 + spread), -s * 0.3), color, max(1, int(s * 0.19)), cv2.LINE_AA)


def rendered_clip(gesture: str, rng: np.random.Generator, hard: bool = False) -> np.ndarray:
    """(FRAMES, H, W) grey 0..1. A hand of random size, shade, place and speed on a random background, with camera noise
    and light flicker. hard (the test set): hands, speeds and backgrounds outside what training saw."""
    scale = W * 1.1 * rng.uniform(1.0, 1.2) if hard else W * rng.uniform(0.3, 0.42) * 2
    bgv = rng.uniform(0.15, 0.3) if hard else rng.uniform(0.3, 0.85)
    bg = np.full((H * 2, W * 2), bgv, np.float32)
    for _ in range(rng.integers(2, 7)):               # things in the room
        p = (int(rng.integers(0, W * 2)), int(rng.integers(0, H * 2)))
        cv2.rectangle(bg, p, (p[0] + int(rng.integers(8, 50)), p[1] + int(rng.integers(8, 40))), float(rng.uniform(0.1, 0.9)), -1)
    bg = cv2.GaussianBlur(bg, (0, 0), 2.0)
    hand = float(rng.uniform(0.75, 0.95) if bgv < 0.55 else rng.uniform(0.05, 0.25))
    x0, y0 = rng.uniform(W * 0.7, W * 1.3), rng.uniform(H * 0.7, H * 1.3)
    travel = rng.uniform(0.55, 0.9) if hard else rng.uniform(0.35, 0.6)
    angle, spread = rng.uniform(-0.3, 0.3), rng.uniform(0.0, 0.4)
    size = scale * 0.32
    start, length = rng.uniform(0.05, 0.3), rng.uniform(0.45, 0.65)
    frames = np.empty((FRAMES, H, W), np.float32)
    dx, dy, grow = {"swipe left": (-1, 0, 0), "swipe right": (1, 0, 0), "swipe up": (0, -1, 0), "swipe down": (0, 1, 0),
                    "push": (0, 0, 1), "pull": (0, 0, -1), "still": (0, 0, 0)}[gesture]
    wobble = rng.uniform(0.3, 1.5, 2)
    for f in range(FRAMES):
        t = f / FRAMES
        u = np.clip((t - start) / length, 0, 1)
        u = u * u * (3 - 2 * u)                       # starts and stops smoothly, like an arm
        v = u - 0.5
        px = x0 + dx * v * travel * W * 2 + np.sin(f * 0.35) * wobble[0]      # a resting hand is never quite still
        py = y0 + dy * v * travel * H * 2 + np.cos(f * 0.3) * wobble[1]
        sz = size * (1 + grow * v * 1.3)
        img = bg.copy()
        draw_hand(img, px, py, sz, angle, hand, spread)
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
        img = img * (1 + rng.normal(0, 0.01)) + rng.normal(0, 0.012, img.shape)
        frames[f] = np.clip(img, 0, 1)
    return frames


# ---- the retina model -------------------------------------------------------------------------------------------
def motion(frames: np.ndarray) -> np.ndarray:
    """Hassenstein-Reichardt correlators on ON and OFF contrast, normalised by the clip's own contrast so light level
    doesn't matter. (FRAMES, polarity 2, direction 4 [right, left, up, down], H, W), >= 0."""
    prev = cv2.GaussianBlur(np.stack(list(frames), -1), (0, 0), 1.0).transpose(2, 0, 1)
    d = np.diff(prev, axis=0, prepend=prev[:1])
    out = np.zeros((len(frames), 2, 4, H, W), np.float32)
    for pol, s in enumerate((np.maximum(d, 0), np.maximum(-d, 0))):       # ON then OFF
        a, b = s[:-1], s[1:]                           # delayed arm, direct arm
        for axis, (pos, neg) in ((2, (0, 1)), (1, (3, 2))):
            sh = 2
            r = a * np.roll(b, -sh, axis=axis) - np.roll(a, -sh, axis=axis) * b
            out[1:, pol, pos] = np.maximum(r, 0)
            out[1:, pol, neg] = np.maximum(-r, 0)
    # pooled over neighbouring points and scaled to each moment's strongest motion, as eyes adapt, with a floor so camera
    # noise on a still hand stays near 0. Without this few neurons get any drive and the signal dies (first test: 20%).
    T = len(frames)
    pooled = np.stack([cv2.GaussianBlur(f, (0, 0), POOL) for f in out.transpose(0, 3, 4, 1, 2).reshape(T, H, W, 8)])
    peak = np.maximum(np.percentile(pooled, 99.5, axis=(1, 2, 3)), MOTION_FLOOR)[:, None, None, None]
    return np.minimum(pooled / peak, 1.0).transpose(0, 3, 1, 2).reshape(T, 2, 4, H, W)


def eye_places(brain: FlyBrain) -> dict:
    """For each T4/T5 type: neuron indices with their (x, y) in the picture, from the wiring (see the top of this file)."""
    raw = Path(r"C:\Users\artif\fly-data") if Path(r"C:\Users\artif\fly-data").exists() else Path.home() / "fly-data"
    import pandas as pd
    ids = np.load(raw / "brain.npz", allow_pickle=True)["ids"]
    index = {int(b): i for i, b in enumerate(ids)}
    known = {}
    for sheet, eye in (("Right OL", "R"), ("Left OL", "L")):
        d = pd.read_excel(raw / "raw" / "optic-columns.xlsx", sheet_name=sheet, usecols=["column", "L1"])
        for col, body in zip(d["column"], d["L1"]):
            parts = str(col).split("_")
            if int(body) in index and len(parts) == 5:
                known[index[int(body)]] = (eye, int(parts[3]), int(parts[4]))
    h = np.array([v[1:] for v in known.values()], np.float32)
    # the columns' two skew axes -> along the eye (h1, front to back) and across it (what h2 adds beyond h1)
    slope = np.polyfit(h[:, 0], h[:, 1], 1)
    across = h[:, 1] - np.polyval(slope, h[:, 0])
    lo, hi = h[:, 0].min(), h[:, 0].max()
    span = np.abs(across).max() + 1e-6
    n = brain.n
    place = np.full((n, 2), np.nan, np.float32)
    for i, (eye, h1, h2) in known.items():
        frac = (h1 - lo) / (hi - lo)
        place[i] = ((-1 if eye == "L" else 1) * frac, (h2 - np.polyval(slope, h1)) / span)
    # a neuron's place = the weighted mean place of what feeds it, one layer at a time. The weights' sign doesn't matter here.
    from scipy.sparse import csr_matrix
    W_ = csr_matrix((np.abs(np.asarray(brain.weights)), np.asarray(brain.indices), np.asarray(brain.indptr)), shape=(n, n))
    pre_to_post = W_ if _weights_are_pre_to_post(brain, W_) else W_.T.tocsr()
    ct = brain.cell_type.astype(str)

    def spread(pre_types: list[str], post_types: list[str]) -> None:
        pre = np.flatnonzero(np.isin(ct, pre_types) & ~np.isnan(place[:, 0]))
        post = np.flatnonzero(np.isin(ct, post_types))
        m = pre_to_post[pre][:, post].T.tocsr()        # post x pre
        total = np.asarray(m.sum(1)).ravel()
        got = total > 0
        place[post[got]] = np.c_[m @ place[pre, 0], m @ place[pre, 1]][got] / total[got, None]

    spread(["L1"], ["Mi1", "Tm3"])                     # ON relay
    spread(["L1"], ["L5", "C3"])
    spread(["L1", "L5"], ["Tm1", "Tm2", "Tm4", "Tm9"]) # OFF relay
    spread(["Mi1", "Tm3"], ["T4a", "T4b", "T4c", "T4d"])
    spread(["Tm1", "Tm2", "Tm4", "Tm9"], ["T5a", "T5b", "T5c", "T5d"])
    out = {}
    for t in ("T4a", "T4b", "T4c", "T4d", "T5a", "T5b", "T5c", "T5d"):
        idx = np.flatnonzero((ct == t) & ~np.isnan(place[:, 0]))
        out[t] = (idx, place[idx])
    return out


def _weights_are_pre_to_post(brain: FlyBrain, W_) -> bool:
    """brain._propagate: for each neuron j that fired, acc[indices[e]] += weights[e] over indptr[j]..: rows are the
    presynaptic neurons when that loop reads j as the row. L1 -> Mi1 is the check."""
    ct = brain.cell_type.astype(str)
    l1, mi1 = np.flatnonzero(ct == "L1"), np.flatnonzero(ct == "Mi1")
    return W_[l1][:, mi1].sum() > W_[mi1][:, l1].sum()


class Retina:
    """Motion in the picture -> volts on each T4/T5 neuron at its place."""

    def __init__(self, brain: FlyBrain):
        places = eye_places(brain)
        self.units = []
        for t, (idx, p) in places.items():
            pol = 0 if t.startswith("T4") else 1
            letter = t[-1]
            eye = np.where(p[:, 0] < 0, 0, 1)          # 0 left eye, 1 right eye
            # front-to-back is away from the middle: right in the picture for the right eye, left for the left eye
            dirn = {"a": (0, 1), "b": (1, 0), "c": (2, 2), "d": (3, 3)}[letter]     # (right eye, left eye) direction index
            direction = np.where(eye == 1, dirn[0], dirn[1])
            x = np.clip(((p[:, 0] + 1) / 2 * (W - 1)).round().astype(int), 0, W - 1)
            y = np.clip(((p[:, 1] + 1) / 2 * (H - 1)).round().astype(int), 0, H - 1)
            self.units.append((idx, pol, direction, x, y))
        self.n = sum(len(u[0]) for u in self.units)
        self.idx = np.concatenate([u[0] for u in self.units])

    def volts(self, m: np.ndarray) -> np.ndarray:
        """m: (B, polarity, direction, H, W) -> (neurons, B)."""
        out = [m[:, pol, d, y, x].T for _, pol, d, x, y in self.units]
        return np.minimum(np.concatenate(out, 0) * DRIVE_GAIN, CAP)


def run_clips(brain: FlyBrain, retina: Retina, clips: np.ndarray, seed: int) -> np.ndarray:
    """clips: (B, FRAMES, H, W) -> (B, FRAMES, descending neurons) spike counts per frame."""
    B = brain.batch
    dn = np.flatnonzero(np.isin(brain.superclass.astype(str), ["descending_neuron", "descending_neuron_tbc"]))
    where = np.full(brain.n, -1)
    where[dn] = np.arange(len(dn))
    ms = np.stack([motion(c) for c in clips], 1)       # (FRAMES, B, pol, dir, H, W)
    brain.reset(seed=seed)
    for _ in range(WARM):
        brain.step()
    counts = np.zeros((B, len(clips[0]), len(dn)), np.float32)
    for f in range(len(clips[0])):
        v = retina.volts(ms[f])
        for _ in range(STEPS_PER_FRAME):
            brain.v[retina.idx] += v                   # one volt per neuron per fly (step's inject takes one per fly)
            out = brain.step()
            for b, fired in enumerate(out if isinstance(out, list) else [out]):   # one fly: a plain array
                h = where[fired]
                counts[b, f, h[h >= 0]] += 1
    return counts


def dn_features(counts: np.ndarray) -> np.ndarray:
    """The readout's input: log spikes of each descending neuron in five stretches of the clip, so timing counts."""
    n = counts.shape[1] // 5
    return np.log1p(np.stack([counts[:, i * n:(i + 1) * n].sum(1) for i in range(5)], 1).reshape(len(counts), -1).astype(np.float32))


def no_brain_features(clips: np.ndarray) -> np.ndarray:
    """The control: the same retina output straight to the readout, no neurons in between. Each clip: motion by polarity
    and direction on a 6 x 8 grid, over the clip. Same inputs, with the connectome taken out."""
    out = []
    for c in clips:
        m = motion(c)
        grid = cv2.resize(m.sum(0).reshape(8, H, W).transpose(1, 2, 0), (8, 6), interpolation=cv2.INTER_AREA)
        out.append(grid.ravel())
    return np.array(out, np.float32)


def dataset(n_per: int, seed: int, hard: bool) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    clips, labels = [], []
    for i, g in enumerate(GESTURES):
        for _ in range(n_per):
            clips.append(rendered_clip(g, rng, hard))
            labels.append(i)
    order = rng.permutation(len(clips))
    return np.array(clips)[order], np.array(labels)[order]


def recorded(folder: Path, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Your recordings: (clips, labels, take number) from record's .npz files."""
    clips, labels, takes = [], [], []
    for f in sorted(folder.glob("*.npz")):
        d = np.load(f)
        clips.append(d["frames"].astype(np.float32) / 255)
        labels.append(GESTURES.index(str(d["gesture"])))
        takes.append(int(d["take"]))
    return np.array(clips), np.array(labels), np.array(takes)


def brain_counts(clips: np.ndarray, brain: FlyBrain, retina: Retina, seed: int) -> np.ndarray:
    B = brain.batch
    out, t0 = [], time.time()
    for i in range(0, len(clips), B):
        part = clips[i:i + B]
        pad = B - len(part)
        full = np.concatenate([part, np.repeat(part[-1:], pad, 0)]) if pad else part
        out.append(run_clips(brain, retina, full, seed + i)[:len(part)])
        if i % (B * 5) == 0:
            print(f"    {i}/{len(clips)} clips, {time.time() - t0:.0f} s", flush=True)
    return np.concatenate(out)


def measure(args) -> None:
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from flytalk import rewire

    if args.clips:
        clips, y, takes = recorded(Path(args.clips), args.seed)
        test = takes >= np.quantile(takes, 0.67)
        tr_x, tr_y, te_x, te_y = clips[~test], y[~test], clips[test], y[test]
        sets = {"test": (te_x, te_y)}
    else:
        tr_x, tr_y = dataset(args.train, args.seed, hard=False)
        sets = {"test": dataset(args.test, args.seed + 1, hard=False), "new hands": dataset(args.test, args.seed + 2, hard=True)}
    print(f"train {len(tr_x)} clips, " + ", ".join(f"{k} {len(v[0])}" for k, v in sets.items()), flush=True)
    model = lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.001, max_iter=800))  # noqa: E731
    results: dict = {"gestures": GESTURES, "chance": round(1 / len(GESTURES), 3)}

    def score(name: str, xtrain, feature) -> None:
        m = model().fit(xtrain, tr_y)
        results[name] = {k: round(float((m.predict(feature(v[0])) == v[1]).mean()), 3) for k, v in sets.items()}
        print(f"  {name}: {results[name]}", flush=True)
        return m

    # no brain first: it is the bar
    score("no brain (retina straight to readout)", no_brain_features(tr_x), no_brain_features)
    pix = lambda c: np.abs(np.diff(c, axis=1)).reshape(len(c), -1)[:, ::7]     # noqa: E731
    score("pixels (frame differences)", pix(tr_x), pix)

    brain = FlyBrain(batch=args.batch, sensory_input=False)
    retina = Retina(brain)
    print(f"  {retina.n} T4/T5 neurons placed in the eye", flush=True)
    real_tr = brain_counts(tr_x, brain, retina, 40000)
    real = {k: brain_counts(v[0], brain, retina, 50000 + 7000 * j) for j, (k, v) in enumerate(sets.items())}
    m = model().fit(dn_features(real_tr), tr_y)
    results["fly brain"] = {k: round(float((m.predict(dn_features(real[k])) == sets[k][1]).mean()), 3) for k in sets}
    results["shuffled labels"] = round(float((model().fit(dn_features(real_tr), np.random.default_rng(1).permutation(tr_y))
                                              .predict(dn_features(real["test"])) == sets["test"][1]).mean()), 3)
    print(f"  fly brain: {results['fly brain']}  shuffled {results['shuffled labels']}", flush=True)
    import joblib
    OUT.mkdir(exist_ok=True)
    joblib.dump({"readout": m, "gestures": GESTURES}, OUT / "gesture_readout.joblib")
    np.savez_compressed(OUT / "gesture_counts.npz", train=real_tr.astype(np.uint8), train_y=tr_y,
                        **{f"x_{k}": v.astype(np.uint8) for k, v in real.items()}, **{f"y_{k}": v[1] for k, v in sets.items()})

    rewire(brain, seed=args.seed + 3)
    fake_tr = brain_counts(tr_x, brain, retina, 60000)
    fake = {k: brain_counts(v[0], brain, retina, 70000 + 7000 * j) for j, (k, v) in enumerate(sets.items())}
    m2 = model().fit(dn_features(fake_tr), tr_y)
    results["scrambled wiring"] = {k: round(float((m2.predict(dn_features(fake[k])) == sets[k][1]).mean()), 3) for k in sets}
    print(f"  scrambled wiring: {results['scrambled wiring']}", flush=True)
    (OUT / "gesture_results.json").write_text(json.dumps(results, indent=1))
    print(json.dumps(results))


def record(args) -> None:
    folder = OUT / "my_hand"
    folder.mkdir(parents=True, exist_ok=True)
    cam = cv2.VideoCapture(args.camera)
    if not cam.isOpened():
        raise SystemExit("no camera found")
    for take in range(args.takes):
        for g in np.random.default_rng(take).permutation(GESTURES):
            frames, t0 = [], time.time()
            while time.time() - t0 < 1.5:              # get ready
                ok, f = cam.read()
                if ok:
                    show = cv2.flip(f, 1)
                    cv2.putText(show, f"{g}  (take {take + 1}/{args.takes}) ... get ready", (20, 40), 0, 0.8, (120, 255, 200), 2)
                    cv2.imshow("record", show)
                    cv2.waitKey(1)
            while len(frames) < FRAMES:
                ok, f = cam.read()
                if ok:
                    frames.append(cv2.resize(cv2.cvtColor(cv2.flip(f, 1), cv2.COLOR_BGR2GRAY), (W, H), interpolation=cv2.INTER_AREA))
                    show = cv2.flip(f, 1)
                    cv2.putText(show, f"{g}  GO", (20, 40), 0, 1.0, (60, 60, 255), 3)
                    cv2.imshow("record", show)
                    cv2.waitKey(max(1, int(1000 / FPS) - 10))
            np.savez_compressed(folder / f"{take:03d}_{g.replace(' ', '_')}.npz", frames=np.array(frames, np.uint8), gesture=g, take=take)
    cam.release()
    cv2.destroyAllWindows()
    print(f"saved to {folder}; now: python drone/gestures.py measure --clips {folder}")


def live(args) -> None:
    import joblib
    fit = joblib.load(OUT / "gesture_readout.joblib")
    brain = FlyBrain(batch=1, sensory_input=False)
    retina = Retina(brain)
    cam = cv2.VideoCapture(args.camera)
    if not cam.isOpened():
        raise SystemExit("no camera found")
    dn = np.flatnonzero(np.isin(brain.superclass.astype(str), ["descending_neuron", "descending_neuron_tbc"]))
    where = np.full(brain.n, -1)
    where[dn] = np.arange(len(dn))
    frames: list = []
    print("press q to stop")
    while True:
        ok, f = cam.read()
        if not ok:
            break
        show = cv2.flip(f, 1)
        frames.append(cv2.resize(cv2.cvtColor(show, cv2.COLOR_BGR2GRAY), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255)
        if len(frames) == FRAMES:
            clip = np.array(frames)[None]
            counts = run_clips(brain, retina, clip, int(time.time()))
            p = fit["readout"].predict_proba(dn_features(counts))[0]
            print(f"{fit['gestures'][int(p.argmax())]:12s} {p.max():.0%}", flush=True)
            frames = frames[FRAMES // 2:]
        cv2.imshow("camera", show)
        if cv2.waitKey(1) & 255 == ord("q"):
            break
    cam.release()
    cv2.destroyAllWindows()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("measure")
    m.add_argument("--train", type=int, default=60, help="clips per gesture")
    m.add_argument("--test", type=int, default=30)
    m.add_argument("--batch", type=int, default=24)
    m.add_argument("--seed", type=int, default=2026)
    m.add_argument("--clips", help="your recordings instead of rendered hands")
    r = sub.add_parser("record")
    r.add_argument("--takes", type=int, default=12)
    r.add_argument("--camera", type=int, default=0)
    li = sub.add_parser("live")
    li.add_argument("--camera", type=int, default=0)
    args = ap.parse_args()
    {"measure": measure, "record": record, "live": live}[args.cmd](args)


if __name__ == "__main__":
    main()
