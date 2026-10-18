"""A fruit fly's connectome flies the drone.

    python drone/pilot.py                       # 30 s flight -> drone/runs/flight.mp4 (drone + live brain side by side)
    python drone/pilot.py --seconds 60 --flies 4 --device auto --no-gusts --out drone/runs/long.mp4

What the brain gets (the visual front end is a model; everything after these neurons is the connectome, as in
flybrain.FeatureDetectors):
  - the nearest fruit -> LC10a (the neurons a male uses to chase a target) on the side it is on
  - a pillar growing in view -> LPLC2 (looming), and one close ahead -> LC4 (fast looming / threat)
  - a gust -> the Johnston's organ wind sensors of the antenna on the side it comes from
What the drone does with the brain's descending neurons (spike counts in short windows, like sshfighter):
  - DNa02 left vs right -> yaw rate (turn toward the side that fires more)
  - MDN (backward walking) -> brake
  - DNp01 (giant fiber, escape) -> a climb burst: the fly's take-off jump
  - the wind descending neurons (DNg05_a, DNg06_a, DNg29, DNge016) left vs right -> turn into the wind (our choice of
    meaning: flies orient upwind; which side fires is the connectome's)
The drone cruises forward like a flying fly (DNg100, forward walking, is silent in this model: measured 2026-10-18).
Nothing here says "fly to the fruit": the turn toward it is the connectome's.
Smell is left out: no descending neuron of this model answers food odour or vinegar (wiz/dnscreen.py), so it would
steer nothing.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sim import CRUISE, DroneSim, Thing  # noqa: E402
from brainview import BrainView  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
from flybrain.eyes import FeatureDetectors  # noqa: E402

CRUISE_SPEED = 0.6   # m/s
WINDOW = 25          # brain steps (0.5 s) for steering
TURN_GAIN = 0.5      # rad/s per spike of DNa02 left-minus-right in the window
WIND_TURN = 0.05     # rad/s per spike of the wind DNs left-minus-right in the window
BRAKE_GAIN = 0.15    # m/s off the cruise speed per MDN spike in the window
ESCAPE_WINDOW, ESCAPE_SPIKES = 5, 2
JUMP_S, JUMP_CLIMB = 0.5, 0.8
LOOM_GAIN = 60.0     # LPLC2 volts per rad of angular growth per brain step
THREAT_NEAR = 0.45   # m: a pillar this close ahead drives LC4
CAP = 0.8            # most volts any channel adds per step
JO = ["JO-CL", "JO-CM", "JO-CA2", "JO-EV1", "JO-EV2", "JO-EV3", "JO-EV5", "JO-EV6", "JO-ED1", "JO-ED2_a", "JO-ED2_b",
      "JO-ED2_c"]    # Johnston's organ: wind and sound on the antenna (the same types as flybook's "wind")
# Measured 2026-10-18 (8 flies, 2 s, 0.8 V on one antenna's JO): each fires ~6-12 Hz on the stimulated side, ~0 on
# the other; half the wind, about half the rate. DNa02 and DNp01 do not answer wind.
WIND_DN = ["DNg05_a", "DNg06_a", "DNg29", "DNge016"]
GROUPS = ("steer_L", "steer_R", "backward_L", "backward_R", "escape_L", "escape_R", "wind_L", "wind_R")


class Senses:
    """Things in view and the wind -> (neuron indices, volts) for this brain step."""

    def __init__(self, brain):
        fd = FeatureDetectors(brain)
        self.cells = {"chase": fd.chase, "loom": fd.loom, "threat": fd.cells["threat"],
                      "antenna": {s: brain.cells(JO, s) for s in "LR"}}
        self.prev: dict[int, float] = {}
        self.last: dict[str, float] = {}

    def inject(self, things: list[Thing], wind: tuple[float, float] | None = None) -> list:
        drive = {f"{ch}{s}": 0.0 for ch in self.cells for s in "LR"}
        fruit = [t for t in things if t.kind == "fruit"]
        if fruit:
            t = min(fruit, key=lambda t: t.distance)
            left = float(np.clip(0.5 + t.bearing / 0.35, 0, 1))       # dead ahead drives both sides
            amount = min(CAP, 0.55 + 1.5 * t.size)
            drive["chaseL"], drive["chaseR"] = amount * left, amount * (1 - left)
        seen = {}
        for i, t in enumerate(x for x in things if x.kind == "pillar"):
            seen[i] = t.size
            side = "L" if t.bearing > 0 else "R"
            growth = max(0.0, t.size - self.prev.get(i, t.size))
            drive[f"loom{side}"] = max(drive[f"loom{side}"], min(CAP, growth * LOOM_GAIN))
            if t.distance < THREAT_NEAR and abs(t.bearing) < np.radians(70):
                drive[f"threat{side}"] = max(drive[f"threat{side}"], CAP * (1 - t.distance / THREAT_NEAR))
        self.prev = seen
        if wind is not None:                           # the antenna facing the wind gets most of it
            bearing, strength = wind
            left = float(np.clip(0.5 + np.sin(bearing), 0, 1))
            drive["antennaL"], drive["antennaR"] = CAP * strength * left, CAP * strength * (1 - left)
        self.last = drive
        return [(self.cells[k[:-1]][k[-1]], v) for k, v in drive.items() if v > 0]


class Pilot:
    """Descending-neuron spikes -> drone commands. With several flies (same wiring, own noise) the counts are averaged."""

    def __init__(self, brain):
        self.brain = brain
        self.idx = {g: brain.groups[g] for g in GROUPS if g in brain.groups}
        self.idx.update({f"wind_{s}": brain.cells(WIND_DN, s) for s in "LR"})
        self.hist: deque = deque(maxlen=WINDOW)
        self.mask = np.zeros(brain.n, bool)
        self.jump_until = -1.0

    def observe(self, fired) -> None:
        flies = fired if isinstance(fired, list) else [fired]
        c = np.zeros(len(GROUPS))
        for f in flies:
            self.mask[:] = False
            self.mask[f] = True
            c += [self.mask[self.idx[g]].sum() for g in GROUPS]
        self.hist.append(c / len(flies))

    def count(self, *groups: str, window: int = WINDOW) -> float:
        recent = np.sum(list(self.hist)[-window:], axis=0)
        return float(sum(recent[GROUPS.index(g)] for g in groups))

    def command(self, t: float, z: float) -> dict:
        yaw = (TURN_GAIN * (self.count("steer_L") - self.count("steer_R")) +
               WIND_TURN * (self.count("wind_L") - self.count("wind_R")))
        forward = max(0.0, CRUISE_SPEED - BRAKE_GAIN * self.count("backward_L", "backward_R"))
        if self.count("escape_L", "escape_R", window=ESCAPE_WINDOW) >= ESCAPE_SPIKES and t >= self.jump_until:
            self.jump_until = t + JUMP_S
        climb = JUMP_CLIMB if t < self.jump_until else 0.3 * (CRUISE - z)   # after a jump, glide back to cruise height
        return {"forward": forward, "climb": climb, "yaw_rate": yaw}


def hud(frame: np.ndarray, sim: DroneSim, pilot: Pilot, crashes: int, font) -> np.ndarray:
    im = Image.fromarray(frame)
    d = ImageDraw.Draw(im, "RGBA")
    d.rounded_rectangle([24, 24, 430, 220], radius=18, fill=(0, 0, 0, 150))
    d.text((44, 38), "FLY BRAIN PILOT", font=font(30), fill=(140, 255, 210))
    d.text((44, 80), f"t {sim.t:5.1f}s   fruit {sim.eaten}   crashes {crashes}", font=font(22), fill=(255, 255, 255))
    rows = (("DNa02 L", ("steer_L",), 1, (140, 255, 210)), ("DNa02 R", ("steer_R",), 1, (140, 255, 210)),
            ("DNp01", ("escape_L", "escape_R"), 1, (255, 110, 90)), ("wind DN", ("wind_L", "wind_R"), 4, (255, 225, 90)))
    for i, (label, groups, per, col) in enumerate(rows):
        y = 118 + i * 24
        v = pilot.count(*groups) / per
        d.text((44, y), label, font=font(18), fill=(200, 200, 200))
        d.rounded_rectangle([140, y + 4, 140 + int(min(v, 10) * 26), y + 18], radius=6, fill=col)
    w = sim.wind_from()
    if w is not None:                                  # where the gust comes from, as seen from behind the drone
        cx, cy, r = frame.shape[1] - 100, 100, 50
        bx, by = cx - r * np.sin(w[0]), cy - r * np.cos(w[0])
        d.ellipse([cx - r - 14, cy - r - 14, cx + r + 14, cy + r + 14], fill=(0, 0, 0, 120))
        d.line([bx, by, cx, cy], fill=(255, 225, 90), width=6)
        d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(255, 225, 90))
        d.text((cx - 34, cy + r + 18), f"GUST {w[1]:.0%}", font=font(18), fill=(255, 225, 90))
    return np.asarray(im)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seconds", type=float, default=30.0)
    ap.add_argument("--flies", type=int, default=1, help="brains averaged (same wiring, own noise)")
    ap.add_argument("--device", default="cpu", help="cpu, cuda or auto")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=str(HERE / "runs" / "flight.mp4"))
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--no-gusts", action="store_true")
    args = ap.parse_args()

    print("loading connectome...", flush=True)
    brain = FlyBrain(device=args.device, batch=args.flies, seed=args.seed)
    senses, pilot = Senses(brain), Pilot(brain)
    for _ in range(100):                       # settle spontaneous activity
        pilot.observe(brain.step())
    sim = DroneSim(seed=args.seed, gusts=not args.no_gusts)
    ticks = round(brain.dt / sim.dt)            # control ticks per brain step
    fonts: dict = {}
    font = lambda s: fonts.setdefault(s, ImageFont.truetype("arial.ttf", s) if sys.platform == "win32"
                                      else ImageFont.load_default(s))
    W, H, BW = 1280, 720, 640
    view = BrainView(brain, {
        "LC10a: sees the fruit": (brain.cells(["LC10a"]), (90, 200, 255), False),
        "LPLC2 / LC4: looming": (brain.cells(["LPLC2", "LC4"]), (255, 160, 60), False),
        "DNa02: steer": (brain.cells(["DNa02"]), (140, 255, 210), True),
        "DNp01: escape": (brain.cells(["DNp01"]), (255, 90, 80), True),
        "MDN: brake": (brain.cells(["MDN"]), (190, 140, 255), True),
        "wind DNs": (brain.cells(WIND_DN), (255, 225, 90), True),
    }, width=BW, height=H, font=font)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W + BW}x{H}", "-r", str(args.fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                           "-crf", "20", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
    crashes, next_frame, t0 = 0, 0.0, time.perf_counter()
    while sim.t < args.seconds:
        fired = brain.step(None, senses.inject(sim.things(), sim.wind_from()))
        pilot.observe(fired)
        view.observe(fired[0] if isinstance(fired, list) else fired)
        cmd = pilot.command(sim.t, sim.pos[2])
        for _ in range(ticks):
            sim.step(**cmd)
        if sim.crashed:
            crashes += 1
            eaten, t = sim.eaten, sim.data.time
            sim.reset()
            sim.eaten, sim.data.time = eaten, t
        while next_frame <= sim.t:
            frame = np.concatenate([hud(sim.render(width=W, height=H), sim, pilot, crashes, font), view.render()], axis=1)
            ff.stdin.write(np.ascontiguousarray(frame).tobytes())
            next_frame += 1 / args.fps
        if int(sim.t * 50) % 250 == 0:
            print(f"  t {sim.t:5.1f}s  fruit {sim.eaten}  crashes {crashes}  "
                  f"({(time.perf_counter() - t0) / max(sim.t, 1e-6):.1f}x real time)", flush=True)
    ff.stdin.close()
    ff.wait()
    sim.close()
    print(f"{out}: {args.seconds:.0f} s, fruit {sim.eaten}, crashes {crashes}")


if __name__ == "__main__":
    main()
