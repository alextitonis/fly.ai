"""One drone follows another with no radio: the follower's fly brain only sees it.

    python drone/follow.py                                # 60 s demo -> drone/runs/follow.mp4
    python drone/follow.py --no-video --condition decoy   # one measured flight, JSON on the last line
    python drone/follow.py --eyes exact                   # the simulator tells it where things are (best case, no camera)

With --eyes camera (the default) the follower knows only what its four onboard cameras show (eyes.py): the simulator's
positions are used for scoring and for the viewer, never for flying. A second drone, with a magenta beacon, flies around
all the time as a distraction.
What passes between the drones is light: the leader's position reaches the follower's brain only as things in view.
  - the leader, on the side it is on -> LC10a (the neurons a male uses to chase a target), stronger when it looks bigger
  - the leader growing in view -> LPLC2 (looming)
  - out of range, or behind a pillar -> nothing at all
What the drone does with the brain is pilot.py's mapping, plus one thing: while DNp01 (escape) is firing it stops moving
forward, so the looming reflex is what keeps it from flying into the leader. Nothing here says "follow": the turn
toward the leader is the connectome's.

Conditions, for measuring it:
  real    the brain sees the leader
  decoy   the brain sees the other drone instead (nothing reaches it from the real leader; same kind of signal)
  blind   the brain sees no leader
  --rewire scrambles the connectome (degree-preserving, flytalk.rewire) under any of them
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from sim import CRUISE, DroneSim, Thing  # noqa: E402
from sim.world import BEACONS, LEADER_RADIUS, LEADER_RANGE, PILLAR_RADIUS, Leader, _segment_gap  # noqa: E402
from eyes import PixelEyes  # noqa: E402
from brainview import BrainView  # noqa: E402
import pilot as pilot_module  # noqa: E402
from pilot import CAP, LOOM_GAIN, THREAT_NEAR, Pilot, Senses  # noqa: E402
from flybrain import FlyBrain  # noqa: E402

FOLLOW_SPEED = 0.55   # m/s: a little faster than the leader's 0.45, so it can catch up
CLOSE = 1.0           # m: "with the leader"
RETURN_RATE = 1.0     # 1/s: how fast it comes back to cruise height after an escape
SMOOTH = 0.12         # camera: how much of a new apparent size is believed each brain step
NEAR_SIZE = 0.15      # camera: rad; smaller than this nothing can be looming yet, and one pixel is a lot of its width
TURN_GAIN = 1.5       # rad/s per spike of DNa02 left-minus-right (picked on seeds 101-103; the leader turns faster than fruit)


class FollowSenses(Senses):
    def __init__(self, brain):
        super().__init__(brain)
        self.leader_size = None
        self.pillars: list = []                        # camera: (bearing, size) last look, matched by bearing

    def inject(self, things: list[Thing], wind=None, match_pillars: bool = False) -> list:
        leader = next((t for t in things if t.kind == "leader"), None)
        seen = [Thing("fruit", t.bearing, t.distance, t.size) if t.kind == "leader" else t for t in things
                if not (match_pillars and t.kind == "pillar")]
        super().inject(seen, wind)                     # the leader takes the place of the fruit on LC10a
        drive = self.last
        if match_pillars:                              # the camera's list changes order: follow each pillar by where it is
            now = []
            for t in (x for x in things if x.kind == "pillar"):
                gap = lambda b: abs((b - t.bearing + np.pi) % (2 * np.pi) - np.pi)   # noqa: E731
                was = [s for b, s in sorted(self.pillars, key=lambda x: gap(x[0])) if gap(b) < 0.1][:1]
                # a picture's width comes in whole pixels: smoothed, or one pixel of jitter reads as a sudden loom
                size = was[0] + SMOOTH * (t.size - was[0]) if was else t.size
                growth = max(0.0, size - was[0]) if was and size > NEAR_SIZE else 0.0
                side = "L" if t.bearing > 0 else "R"
                drive[f"loom{side}"] = max(drive[f"loom{side}"], min(CAP, growth * LOOM_GAIN))
                if t.distance < THREAT_NEAR and abs(t.bearing) < np.radians(70):
                    drive[f"threat{side}"] = max(drive[f"threat{side}"], CAP * (1 - t.distance / THREAT_NEAR))
                now.append((t.bearing, size))
            self.pillars = now
        if leader is not None:
            size = leader.size
            if match_pillars and self.leader_size is not None:
                size = self.leader_size + SMOOTH * (leader.size - self.leader_size)
            growth = 0.0 if self.leader_size is None else max(0.0, size - self.leader_size)
            if match_pillars and size <= NEAR_SIZE:
                growth = 0.0
            side = "L" if leader.bearing > 0 else "R"
            drive[f"loom{side}"] = max(drive[f"loom{side}"], min(CAP, growth * LOOM_GAIN))
        self.leader_size = None if leader is None else size
        return [(self.cells[k[:-1]][k[-1]], v) for k, v in drive.items() if v > 0]


class FollowPilot(Pilot):
    def command(self, t: float, z: float) -> dict:
        cmd = super().command(t, z)
        cmd["forward"] = 0.0 if t < self.jump_until else min(cmd["forward"], FOLLOW_SPEED)
        if t >= self.jump_until:                       # back to cruise height quickly, or the leader drops out of its cameras' view
            cmd["climb"] = RETURN_RATE * (CRUISE - z)
        return cmd


def seen_decoy(sim: DroneSim, decoy: Leader) -> Thing | None:
    """The decoy, as sim.things() would give the real leader."""
    p, q = sim.pos[:2], decoy.pos[:2]
    d = q - p
    dist = float(np.hypot(*d))
    if dist > LEADER_RANGE or any(_segment_gap(p, q, np.array(x)) <= PILLAR_RADIUS for x in sim.pillars):
        return None
    bearing = float((np.arctan2(d[1], d[0]) - sim.heading + np.pi) % (2 * np.pi) - np.pi)
    return Thing("leader", bearing, dist, 2 * float(np.arctan2(LEADER_RADIUS, max(dist, 1e-3))))


class TopMap:
    """The arena from above: pillars, both drones and where they have just been."""

    def __init__(self, sim: DroneSim, size: int = 280, trail_s: float = 10.0):
        self.sim, self.size = sim, size
        self.span = 3.5
        self.keep = int(trail_s * 25)
        self.leader: list = []
        self.me: list = []
        self.other: list = []
        self.next_at = 0.0

    def xy(self, p) -> tuple[float, float]:
        k = self.size / (2 * self.span)
        return float(self.size / 2 + p[0] * k), float(self.size / 2 - p[1] * k)

    def draw(self, im: Image.Image, at: tuple[int, int]) -> None:
        sim = self.sim
        if sim.t >= self.next_at:
            self.next_at = sim.t + 1 / 25
            self.leader = (self.leader + [sim.leader.pos[:2].copy()])[-self.keep:]
            self.me = (self.me + [sim.pos[:2].copy()])[-self.keep:]
            if sim.decoy is not None:
                self.other = (self.other + [sim.decoy.pos[:2].copy()])[-self.keep:]
        panel = Image.new("RGBA", (self.size, self.size), (8, 12, 12, 215))
        d = ImageDraw.Draw(panel, "RGBA")
        e0, e1 = self.xy((-3, 3)), self.xy((3, -3))
        d.rectangle([e0[0], e0[1], e1[0], e1[1]], outline=(90, 130, 120, 255), width=2)
        for q in sim.pillars:
            x, y = self.xy(q)
            d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(190, 190, 185, 255))
        for trail, col in ((self.other, (255, 60, 215)), (self.leader, (50, 255, 150)), (self.me, (255, 150, 50))):
            if len(trail) > 1:
                d.line([self.xy(p) for p in trail], fill=col + (200,), width=3)
            if trail:
                x, y = self.xy(trail[-1])
                d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=col + (255,), outline=(255, 255, 255, 255))
        im.paste(panel, at, panel)


def hud(frame: np.ndarray, sim: DroneSim, pilot: Pilot, stats: dict, chart: TopMap, font, pictures=None) -> np.ndarray:
    im = Image.fromarray(frame)
    d = ImageDraw.Draw(im, "RGBA")
    if pictures:                                       # exactly what the fly's pilot gets
        strip = np.hstack([pictures[k] for k in ("left", "front", "right", "back")])
        im.paste(Image.fromarray(strip).resize((480, 90)), (484, 24))
        d.text((488, 118), "its only input: its 4 cameras", font=font(16), fill=(235, 235, 235))
    d.rounded_rectangle([24, 24, 470, 246], radius=18, fill=(0, 0, 0, 165))
    d.text((44, 36), "NO RADIO: FOLLOWS BY SIGHT", font=font(24), fill=(140, 255, 210))
    d.text((44, 74), f"t {sim.t:5.1f}s    distance {stats['distance']:.2f} m", font=font(21), fill=(255, 255, 255))
    d.text((44, 104), f"within 1 m {stats['with']:.0%}    crashes {stats['crashes']}", font=font(21), fill=(255, 255, 255))
    rows = (("DNa02 L", ("steer_L",), 1, (140, 255, 210)), ("DNa02 R", ("steer_R",), 1, (140, 255, 210)),
            ("DNp01", ("escape_L", "escape_R"), 1, (255, 110, 90)))
    for i, (label, groups, per, col) in enumerate(rows):
        y = 142 + i * 28
        v = pilot.count(*groups) / per
        d.text((44, y), label, font=font(18), fill=(200, 200, 200))
        d.rounded_rectangle([140, y + 4, 140 + int(min(v, 10) * 28), y + 18], radius=6, fill=col)
    chart.draw(im, (frame.shape[1] - chart.size - 24, 24))
    h, w = frame.shape[:2]
    d.rounded_rectangle([24, h - 92, w - 24, h - 20], radius=14, fill=(0, 0, 0, 165))
    d.ellipse([44, h - 76, 58, h - 62], fill=(50, 255, 150, 255))
    d.text((66, h - 82), "leader: flies a set route", font=font(19), fill=(235, 235, 235))
    d.ellipse([330, h - 76, 344, h - 62], fill=(255, 150, 50, 255))
    d.text((352, h - 82), "follower: flown by a fruit fly's connectome", font=font(19), fill=(235, 235, 235))
    if sim.decoy is not None:
        d.ellipse([800, h - 76, 814, h - 62], fill=(255, 60, 215, 255))
        d.text((822, h - 82), "a distraction: not its leader", font=font(19), fill=(235, 235, 235))
    note = "leader hidden: its brain gets nothing until it reappears" if not stats["sees"] else         "no link between them: all the follower has is what it sees"
    d.text((44, h - 52), note, font=font(19), fill=(255, 225, 90) if not stats["sees"] else (180, 200, 195))
    return np.asarray(im)


def run(args) -> dict:
    print("loading connectome...", flush=True)
    brain = FlyBrain(device=args.device, batch=args.flies, seed=args.seed)
    if args.rewire:
        from flytalk import rewire
        rewire(brain, seed=args.seed + 1000)
    senses, pilot = FollowSenses(brain), FollowPilot(brain)
    for _ in range(100):
        pilot.observe(brain.step())
    camera = args.eyes == "camera"
    sim = DroneSim(seed=args.seed, n_fruit=0, gusts=False, leader=True, decoy=camera)
    decoy = Leader(np.random.default_rng(args.seed + 5000), sim.pillars) if args.condition == "decoy" and not camera else None
    pixels = PixelEyes(BEACONS["decoy" if args.condition == "decoy" else "leader"], seed=args.seed) if camera else None
    looks, things = 0, []
    ticks = round(brain.dt / sim.dt)

    ff = view = font = None
    W, H, BW = 1280, 720, 640
    if not args.no_video:
        fonts: dict = {}
        font = lambda s: fonts.setdefault(s, ImageFont.truetype("arial.ttf", s) if sys.platform == "win32"
                                          else ImageFont.load_default(s))
        view = BrainView(brain, {
            "LC10a: sees the leader": (brain.cells(["LC10a"]), (90, 200, 255), False),
            "LPLC2: it looms": (brain.cells(["LPLC2"]), (255, 160, 60), False),
            "DNa02: steer": (brain.cells(["DNa02"]), (140, 255, 210), True),
            "DNp01: escape, stops": (brain.cells(["DNp01"]), (255, 90, 80), True),
        }, width=BW, height=H, font=font)
        chart = TopMap(sim)
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                               "-s", f"{W + BW}x{H}", "-r", str(args.fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                               "-crf", "21", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)

    dist, near, seen, escapes, crashes = [], 0, 0, 0, 0
    next_frame, t0, stamp = 0.0, time.perf_counter(), 0
    while sim.t < args.seconds:
        if camera:                                     # a new picture every other brain step (25 frames a second)
            if looks % 2 == 0:
                things = [t for t in pixels.things(sim.eyes()) if t.kind != "leader" or args.condition != "blind"]
            looks += 1
        else:
            things = [t for t in sim.things() if t.kind != "leader" or args.condition == "real"]
        if decoy is not None:
            decoy.step(brain.dt)
            got = seen_decoy(sim, decoy)
            if got:
                things.append(got)
        sees = any(t.kind == "leader" for t in things)
        fired = brain.step(None, senses.inject(things, match_pillars=camera))
        pilot.observe(fired)
        cmd = pilot.command(sim.t, sim.pos[2])
        for _ in range(ticks):
            sim.step(**cmd)
        d = float(np.linalg.norm(sim.leader.pos[:2] - sim.pos[:2]))
        dist.append(d)
        near += d < CLOSE
        seen += sees
        escapes += cmd["forward"] == 0.0
        if sim.crashed:
            crashes += 1
            t = sim.data.time
            sim.reset()
            sim.data.time = t
            senses.leader_size, senses.pillars, things = None, [], []
        if ff is not None:
            view.observe(fired[0] if isinstance(fired, list) else fired)
            while next_frame <= sim.t:
                stats = {"distance": d, "with": near / len(dist), "crashes": crashes, "sees": sees}
                sim_frame = sim.render(width=W, height=H)
                pictures = sim.eyes() if camera else None
                frame = np.concatenate([hud(sim_frame, sim, pilot, stats, chart, font, pictures), view.render()], axis=1)
                ff.stdin.write(np.ascontiguousarray(frame).tobytes())
                next_frame += 1 / args.fps
        if int(sim.t) >= stamp + 15:
            stamp = int(sim.t)
            print(f"  t {sim.t:5.1f}s  mean distance {np.mean(dist):.2f}  crashes {crashes}  "
                  f"({(time.perf_counter() - t0) / max(sim.t, 1e-6):.1f}x real time)", flush=True)
    if ff is not None:
        ff.stdin.close()
        ff.wait()
    sim.close()
    return {"eyes": args.eyes, "condition": args.condition, "rewired": args.rewire, "seed": args.seed, "seconds": args.seconds,
            "mean_distance": round(float(np.mean(dist)), 3), "with_leader": round(near / len(dist), 3),
            "sees_it": round(seen / len(dist), 3), "stopped": round(escapes / len(dist), 3), "crashes": crashes}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seconds", type=float, default=60.0)
    ap.add_argument("--condition", choices=("real", "decoy", "blind"), default="real")
    ap.add_argument("--eyes", choices=("camera", "exact"), default="camera")
    ap.add_argument("--rewire", action="store_true")
    ap.add_argument("--flies", type=int, default=1, help="brains averaged (same wiring, own noise)")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--out", default=str(HERE / "runs" / "follow.mp4"))
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--turn-gain", type=float, default=TURN_GAIN)
    args = ap.parse_args()
    pilot_module.TURN_GAIN = args.turn_gain
    print(json.dumps(run(args)))


if __name__ == "__main__":
    main()
