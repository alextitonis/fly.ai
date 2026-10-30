"""A hand swipe turns the drone in the 3D world, with nothing trained.

    python drone/swipe.py --out drone/runs/swipe.mp4          # rendered hands, one at a time, with video
    python drone/swipe.py --clip hand.mp4 --out drone/runs/swipe_real.mp4   # a recorded hand instead
    python drone/swipe.py --no-video                          # the measured run; --rewire scrambles the wiring

The hand reaches the brain only through gestures.py's motion route (camera -> motion model -> T4/T5). The turn is reflex.py's
signal, DNg41 + DNb03 on the right minus on the left, read directly over the last 0.6 s; the drone turns that way. The camera
sees the hand as if the drone faced you. The drone is told nothing else: it flies slowly forward and has no goal.

Rule fixed before running: across 12 left and 12 right swipes, at least 75% change the heading the right way, and at least 20
points better than scrambled wiring. A swipe counts over its own clip and the 0.4 s after it.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import deque
from pathlib import Path

import cv2
import mujoco
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import gestures as g  # noqa: E402
from reflex import DEAD, OFFSET, TYPES  # noqa: E402
from brainview import BrainView  # noqa: E402
from sim import CRUISE, DroneSim  # noqa: E402
from flybrain import FlyBrain  # noqa: E402

SPEED = 0.25          # m/s
TURN_GAIN = 0.12      # rad/s per Hz of signal
WINDOW = 30           # brain steps (0.6 s) the signal is read over
AFTER = 10            # frames (0.4 s) a swipe's turn is still counted after its clip
W, H, BW = 1280, 720, 640


def script(n: int, seed: int) -> list[str]:
    """n left and n right swipes in random order, with a still hand before each."""
    order = np.random.default_rng(seed).permutation(["swipe left"] * n + ["swipe right"] * n)
    return [x for s in order for x in ("still", str(s))]


def recorded(path: str) -> list[np.ndarray]:
    cap = cv2.VideoCapture(path)
    step = max(1, round((cap.get(cv2.CAP_PROP_FPS) or 25) / g.FPS))
    frames, i = [], 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        i += 1
        if i % step == 0:
            frames.append(cv2.cvtColor(cv2.resize(f, (g.W, g.H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255)
    return [np.array(frames[k:k + g.FRAMES]) for k in range(0, len(frames) - g.FRAMES + 1, g.FRAMES)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--clip", help="a recorded hand instead of rendered ones")
    ap.add_argument("--swipes", type=int, default=12, help="left and right swipes each")
    ap.add_argument("--seed", type=int, default=4041)
    ap.add_argument("--rewire", action="store_true")
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--out", default=str(HERE / "runs" / "swipe.mp4"))
    a = ap.parse_args()

    brain = FlyBrain(batch=1, sensory_input=False)
    if a.rewire:
        from flytalk import rewire
        rewire(brain, seed=a.seed + 3)
    retina = g.Retina(brain)
    ct, side = brain.cell_type.astype(str), brain.side.astype(str)
    right, left = np.flatnonzero(np.isin(ct, TYPES) & (side == "R")), np.flatnonzero(np.isin(ct, TYPES) & (side == "L"))
    for _ in range(g.WARM):
        brain.step()
    sim = DroneSim(seed=a.seed, n_fruit=0, gusts=False, pillars=[])
    ticks = round(brain.dt / sim.dt)
    rng = np.random.default_rng(a.seed + 1)
    labels = ["recorded"] * 999 if a.clip else script(a.swipes, a.seed)
    clips = recorded(a.clip) if a.clip else None

    ff = view = font = cam = None
    if not a.no_video:
        fonts: dict = {}
        font = lambda s: fonts.setdefault(s, ImageFont.truetype("arial.ttf", s))   # noqa: E731
        view = BrainView(brain, {"T4/T5: hand motion in": (np.concatenate([retina.idx]), (90, 200, 255), False),
                                 "DNg41, DNb03: left vs right": (np.r_[left, right], (140, 255, 210), True)}, width=BW, height=H, font=font)
        cam = mujoco.MjvCamera()
        cam.type = mujoco.mjtCamera.mjCAMERA_FREE
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W + BW}x{H}", "-r", "30", "-i", "-",
                               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21", "-movflags", "+faststart", a.out], stdin=subprocess.PIPE)

    hist: deque = deque(maxlen=WINDOW)
    trail: list = []
    next_frame, yaw, sig = 0.0, 0.0, 0.0
    results, pending = [], []
    unwrapped, last_h = 0.0, sim.heading
    n_clips = len(clips) if clips is not None else len(labels)
    for c in range(n_clips):
        label = labels[c]
        frames = clips[c] if clips is not None else g.rendered_clip(label, rng)
        m = g.motion(frames)
        if label.startswith("swipe"):
            pending.append({"want": 1 if label == "swipe left" else -1, "start": unwrapped, "until": sim.t + len(frames) / g.FPS + AFTER / g.FPS})
        for f in range(len(frames)):
            v = retina.volts(m[f][None])
            for _ in range(g.STEPS_PER_FRAME):
                brain.v[retina.idx] += v
                fired = brain.step()
                is_fired = np.zeros(brain.n, bool)
                is_fired[fired] = True
                hist.append((is_fired[right].sum(), is_fired[left].sum()))
                sig = float(np.sum(hist, axis=0)[0] - np.sum(hist, axis=0)[1]) / (len(hist) * brain.dt) - OFFSET
                yaw = -TURN_GAIN * sig if abs(sig) > DEAD else 0.0          # + yaw is left, + signal says right
                for _ in range(ticks):
                    sim.step(forward=SPEED, climb=0.3 * (CRUISE - sim.pos[2]), yaw_rate=yaw)
                d = (sim.heading - last_h + np.pi) % (2 * np.pi) - np.pi
                unwrapped += d
                last_h = sim.heading
                for p in [p for p in pending if sim.t >= p["until"]]:
                    results.append(p["want"] * (unwrapped - p["start"]))
                    pending.remove(p)
                if sim.crashed:
                    t = sim.data.time
                    sim.reset()
                    sim.data.time = t
                    last_h = sim.heading
                    trail = []
                if ff is not None:
                    view.observe(fired)
                    while next_frame <= sim.t:
                        r = sim.renderers_get(W, H)
                        cam.lookat[:] = sim.pos
                        cam.distance, cam.elevation, cam.azimuth = 1.5, -45, 90
                        r.update_scene(sim.data, cam)
                        im = Image.fromarray(r.render())
                        d_ = ImageDraw.Draw(im, "RGBA")
                        d_.rounded_rectangle([24, 24, 520, 190], radius=18, fill=(0, 0, 0, 170))
                        d_.text((44, 36), "A SWIPE TURNS IT. NOTHING TRAINED", font=font(22), fill=(140, 255, 210))
                        word = "real recorded hand" if a.clip else ("hand still" if label == "still" else label)
                        d_.text((44, 76), f"the hand: {word}", font=font(22), fill=(255, 255, 255))
                        turn = "straight" if yaw == 0 else ("left" if yaw > 0 else "right")
                        d_.text((44, 110), f"the fly's neurons: {turn} ({sig:+.0f} Hz)", font=font(22), fill=(255, 225, 90))
                        x0, xm, bar = 44, 270, np.clip(sig, -15, 15) / 15 * 200
                        d_.rectangle([x0, 152, xm + 226, 168], fill=(60, 60, 60, 200))
                        d_.rectangle([min(xm, xm + bar), 152, max(xm, xm + bar), 168], fill=(140, 255, 210, 255))
                        d_.line([xm, 146, xm, 174], fill=(255, 255, 255, 255), width=2)
                        # the drone's heading, as it's small in the picture
                        cx, cy = W / 2, H / 2
                        hx, hy = cx + 70 * np.cos(sim.heading), cy - 70 * np.sin(sim.heading)
                        d_.line([cx, cy, hx, hy], fill=(255, 150, 50, 230), width=5)
                        d_.ellipse([hx - 6, hy - 6, hx + 6, hy + 6], fill=(255, 150, 50, 255))
                        # its only input: the hand, as big as it can be
                        hand = np.uint8(np.clip(frames[f] * 255, 0, 255))
                        im.paste(Image.fromarray(hand).resize((360, 270), 0).convert("RGB"), (W - 384, 24))
                        d_.text((W - 380, 298), "its only input", font=font(18), fill=(255, 255, 255))
                        # where it has flown
                        trail = (trail + [sim.pos[:2].copy()])[-300:]
                        k = 220 / 7.0
                        pts = [(W - 124 + p[0] * k, H - 130 - p[1] * k) for p in trail]
                        d_.rectangle([W - 234, H - 240, W - 14, H - 20], fill=(8, 12, 12, 215), outline=(90, 130, 120, 255))
                        if len(pts) > 1:
                            d_.line(pts, fill=(255, 150, 50, 230), width=3)
                        ff.stdin.write(np.ascontiguousarray(np.concatenate([np.asarray(im), view.render()], axis=1)).tobytes())
                        next_frame += 1 / 30
        if c % 10 == 0:
            print(f"  clip {c}/{n_clips}, {sum(x > 0 for x in results)}/{len(results)} right way so far", flush=True)
    if ff is not None:
        ff.stdin.close()
        ff.wait()
    sim.close()
    results = np.array(results) if results else np.zeros(0)
    print(json.dumps({"rewired": a.rewire, "swipes": len(results), "right_way": round(float((results > 0).mean()), 3) if len(results) else None,
                      "mean_turn_deg": round(float(np.degrees(results.mean())), 1) if len(results) else None, "seconds": round(sim.t, 1)}))


if __name__ == "__main__":
    main()
