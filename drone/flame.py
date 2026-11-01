"""Telling flames from things that are only flame-coloured: our own camera step, no connectome in it (fire.py showed the connectome's motion route can't, 0.47).

    python drone/flame.py clips --folder forest       # development footage: runs/clips/forest/, sets the cutoffs below
    python drone/flame.py clips --folder forest_fresh2 # the test, once

Hot-coloured patches that swell and sink as a whole and don't stay put. 1.6 s of frames at 25 a second, 128 x 96, the size of the drone's cameras; any camera movement between frames is taken out first.
For each patch:
    COARSE    how much the brightness changes over time once blurred to about 9 pixels, relative to its mean. Pixel by pixel leaves score as high as flames (0.12-0.20 both), since a leafy texture sits on the
              colour test's edge and flips; blurred, leaves mostly fall under 0.05
    KEEP      how much of the patch is the same pixels half a second later. Red leaves in a breeze change by as much as a weak fire (0.081) but stay where they are (0.75 kept, no flame over 0.57)
A patch is flame when it has at least 60 pixels, COARSE >= 0.20 and KEEP < 0.65. Our own step, nothing here is the connectome's.

First test: MISSED (11-01), runs/flame/forest_fresh.json. Cutoffs set on runs/clips/forest alone (COARSE 0.07, 30 pixels), on forest_fresh: 14 of 15 fire clips (rule 11), but 9 of 20 not-fire called (rule 2), 7 fewer than colour alone (rule 3).
Mostly small side patches. Those clips are no longer fresh, and the cutoffs above come from them plus runs/clips/forest, where they call 17 of 25 fire and 3 of 28 not-fire. It misses big saturated fires, whose brightness hardly changes once blurred.

Second test, rules fixed before running, once, on runs/clips/forest_fresh2/, picked by title before these cutoffs were chosen; a clip counts as called when at least 2 of its 4 looks are:
    CATCH     at least 6 of the 10 fire clips called
    FALSE     at most 3 of the 16 not-fire clips called
    COLOUR    at least 3 fewer not-fire clips called than by flame colour alone, so the check earns its place
Limits: these clips are ground level, flames in plain view, mostly on a tripod. Smoke isn't handled at all, and from the air it finds nothing: 1 of 15 aerial fire clips even has flame colours (the flames are too small or hidden), so a
real patrol would want a heat camera or a smoke step. Nothing here is the connectome's.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
W, H = 128, 96
FPS = 25
LOOK_FRAMES = 40          # 1.6 s
MIN_PATCH = 60            # pixels ever hot
COARSE = 0.20
KEEP = 0.65
KEEP_LAG = 12             # frames: about half a second
BLUR = 9                  # pixels
WINDOWS = 4


def hot_mask(rgb: np.ndarray) -> np.ndarray:
    """Flame-coloured pixels, uint8 RGB in. The same test forest.py's stand-in used."""
    r, g, b = rgb[..., 0].astype(np.int16), rgb[..., 1].astype(np.int16), rgb[..., 2].astype(np.int16)
    return (r > 191) & (b < 102) & (r - g > 38)


def steady(frames: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Hot masks and blurred brightness with the camera's movement taken out, each shifted back onto the first frame."""
    grey = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY).astype(np.float32) for f in frames]
    masks, shown = [hot_mask(frames[0])], [grey[0]]
    x = y = 0.0
    size = (frames[0].shape[1], frames[0].shape[0])
    for a, b, f in zip(grey, grey[1:], frames[1:]):
        (dx, dy), _ = cv2.phaseCorrelate(a, b)
        x, y = x + dx, y + dy
        t = np.array([[1, 0, -x], [0, 1, -y]], np.float32)
        masks.append(cv2.warpAffine(hot_mask(f).astype(np.uint8), t, size, flags=cv2.INTER_NEAREST).astype(bool))
        shown.append(cv2.warpAffine(b, t, size, flags=cv2.INTER_LINEAR))
    return np.stack(masks), np.stack([cv2.blur(g, (BLUR, BLUR)) for g in shown])


def patches(frames: list[np.ndarray]) -> list[dict]:
    """Every patch big enough to judge: pixels, the two measures, whether it's flame, and where its pixels are across the picture."""
    masks, blurred = steady(frames)
    ever = (masks.sum(0) >= 2).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ever, connectivity=8)
    swing = blurred.std(0) / (blurred.mean(0) + 5)
    lag = min(KEEP_LAG, len(frames) - 1)
    both, either = masks[lag:] & masks[:-lag], masks[lag:] | masks[:-lag]
    out = []
    for i in range(1, n):
        size = int(stats[i, cv2.CC_STAT_AREA])
        if size >= MIN_PATCH:
            part = labels == i
            coarse = float(swing[part].mean())
            keep = float((both[:, part].sum(1) / (either[:, part].sum(1) + 1)).mean())
            xs = np.nonzero(part)[1]
            out.append({"n": size, "coarse": coarse, "keep": keep, "flame": coarse >= COARSE and keep < KEEP, "x": float(xs.mean()), "width": int(xs.max() - xs.min() + 1)})
    return out


def read_windows(path: Path) -> list[list[np.ndarray]]:
    """WINDOWS evenly spaced looks at the clip, each LOOK_FRAMES long, at FPS frames a second and the drone's picture size."""
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or FPS
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, round(fps / FPS))
    span = LOOK_FRAMES * step
    starts = np.linspace(0, max(0, total - span - 1), WINDOWS).astype(int)
    out = []
    for s in starts:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(s))
        frames = []
        for i in range(span):
            ok, f = cap.read()
            if not ok:
                break
            if i % step == 0:
                frames.append(cv2.cvtColor(cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB))
        if len(frames) >= 10:
            out.append(frames)
    cap.release()
    return out


def clip_scores(path: Path) -> list[dict]:
    """One row per look at the clip."""
    rows = []
    for w in read_windows(path):
        ps = patches(w)
        rows.append({"coloured": bool(ps), "flame": any(p["flame"] for p in ps), "best": round(max((p["coarse"] for p in ps if p["keep"] < KEEP), default=0.0), 3)})
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="Flames or only flame-coloured, on real footage")
    sub = ap.add_subparsers(dest="what", required=True)
    c = sub.add_parser("clips")
    c.add_argument("--folder", default="forest")
    a = ap.parse_args()
    root = HERE / "runs" / "clips" / a.folder
    rows = []
    for sub_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        for f in sorted(sub_dir.glob("*.mp4")):
            r = clip_scores(f)
            need = WINDOWS / 2
            rows.append({"folder": sub_dir.name, "name": f.stem, "coloured": sum(w["coloured"] for w in r) >= need, "called": sum(w["flame"] for w in r) >= need, "best": [w["best"] for w in r]})
            print(json.dumps(rows[-1]), flush=True)
    out = HERE / "runs" / "flame"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{a.folder}.json").write_text(json.dumps(rows, indent=1))
    tally = {}
    for folder in sorted({r["folder"] for r in rows}):
        part = [r for r in rows if r["folder"] == folder]
        tally[folder] = (len(part), sum(r["coloured"] for r in part), sum(r["called"] for r in part))
        print(f"{folder:14} clips {tally[folder][0]:3}  flame-coloured {tally[folder][1]:3}  called fire {tally[folder][2]:3}")
    if a.folder == "forest_fresh2":
        fire, other = tally["fire"], tally["not_fire"]
        print(f"CATCH   {fire[2]} of {fire[0]}: {'PASS' if fire[2] >= 6 else 'MISS'}")
        print(f"FALSE   {other[2]} of {other[0]}: {'PASS' if other[2] <= 3 else 'MISS'}")
        print(f"COLOUR  {other[1] - other[2]} fewer than colour alone ({other[1]}): {'PASS' if other[1] - other[2] >= 3 else 'MISS'}")


if __name__ == "__main__":
    main()
