"""One or two cameras: when the target leaves the picture, can the drone still tell where it went?

    python drone/predict.py bench --seed 7501                       # does the brain itself hold it? No flying
    python drone/predict.py fly --mode one_predict --seed 7601      # one measured flight, JSON on the last line

The simulation has four cameras, so it never loses anything for long. A real drone has one, 90 degrees across. Two questions:

1. Bench: does the connectome keep a memory of where the target went? A target on one side drives LC10a for 1 s, then vanishes.
   Rules fixed before running, 8 flies x 6 repeats a side, in the 0.5-1 s after it vanishes:
     MEMORY  a decoder on all neurons (5-fold, cells picked inside each fold) names the side at least 75% of the time, 20 points over
             scrambled wiring
     STEERS  DNa02 still leans to that side in at least 75% of looks where it fires at all, and it fires in at least half
   Reported, no rule: the same at other delays, for central-complex cells alone, and before the target appears (should be 50%).

2. Flight: `Tracker` is ours, not the fly's, and is plainly a model on top. It knows its own movement from the commands the brain just
   gave (forward and yaw; nothing from the simulator), and the target's from how it moved while seen. When the target is lost, the
   predicted bearing keeps driving LC10a, so the turn still comes through the connectome. If the prediction says it should be in the
   picture and it isn't, or says it's far behind, it keeps turning one way to scan (our rule, also through LC10a). Gives up after HOLD_S.
   Modes: four (all cameras), one (front only), one_predict, and --rewire on any of them.
   Constants below were picked on seeds 7551-7554. Rules fixed before running, seeds 7601-7608, 60 s each, paired by seed with a 95%
   bootstrap interval:
     PREDICTS  in the first 1 s lost, median bearing error at most 0.7x holding the last bearing seen. Past that the target has really
               moved on (5 s is 2 m at its speed, about as far as it is away), so longer losses are for searching, reported only
     VIEW      target in view at least 1.25x as often as `one`, interval above 0
     HELPS     mean distance at least 20% below `one`, interval above 0
     WIRING    one_predict at least 0.2 m closer than one_predict on scrambled wiring
   Reported, no rule: `four` as the ceiling, own-position error from commands alone, and self-only prediction against self + target.

3. One or two cameras as the real setup, since real drones have no more. Modes one_predict, two (front and back), two_predict, four.
   Rules fixed before running, seeds 8001-8008, 60 s each, paired by seed:
     ONE_CLOSE  one_predict within 1 m of the target at most 10 points below four
     TWO_CLOSE  two_predict the same
     TWO_ADDS   two_predict in view at least 15 points more than one_predict, 95% interval above 0
     WIRING     one_predict in view at least 20 points over one_predict on scrambled wiring, 95% interval above 0. In view, not distance: on
                seeds 7601-7608 scrambled wiring kept its distance by hovering

4. The bench's brain. Those flights ran on sensory_input=True, FlyBrain's default, and come-here by sound did far better on False (92% against 63%). Does following too? Same constants, nothing retuned, one_predict and two_predict with and without --no-sensory-input.
   Rules fixed before running, seeds 9501-9508, 60 s each, NUMBA_NUM_THREADS=2, paired by seed:
     CLOSER    one_predict on False within 1 m at least 10 points over True, 95% interval above 0
     STOPS     one_predict on False stopped at least 10 points less than True, 95% interval above 0. Stopping near things is the follower's known weakness
     CRASHES   one_predict on False no more crashes than True over all 8
   two_predict is reported, no rule.
   Result 2026-11-02: CLOSER missed (+0.6 points), STOPS missed (5 points more, not less), CRASHES passed (9 against 12). Results in runs/predict/sensory/.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
import eyes as eyes_module  # noqa: E402
from eyes import PixelEyes  # noqa: E402
from events import Events  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
from flybrain.eyes import FeatureDetectors  # noqa: E402
from flytalk import rewire  # noqa: E402
from follow import TURN_GAIN, FollowPilot, FollowSenses  # noqa: E402
import pilot as pilot_module  # noqa: E402
from sim import DroneSim, Thing  # noqa: E402
from sim.world import BEACONS  # noqa: E402

OUT = HERE / "runs" / "predict"
HOLD_S = 10.0           # seconds it keeps looking with nothing seen: a full turn at the LC10a turn rate fits in this
FOV_EDGE = np.radians(40)   # inside this a prediction should be visible
LAYOUTS = {"four": ("front", "left", "back", "right"), "one": ("front",), "one_predict": ("front",), "two": ("front", "back"), "two_predict": ("front", "back")}
BEHIND = np.radians(120)    # past this left and right flip with noise, so it picks a side and stays on it
SCAN = np.radians(60)       # the bearing fed to LC10a while scanning: firmly on one side
MAX_YAW = 3.0           # rad/s: the controller's limit, as any real drone's spec sheet gives it
TARGET_MEMORY = 2.0     # seconds: a lost target's velocity fades over this
SEEN_SMOOTH = 0.25      # how much of a new sighting is believed: distance from a few pixels is rough
VEL_SMOOTH = 0.03
VEL_CAP = 0.6           # m/s: faster than this is a bad distance reading, not a real target. A prior about what it follows
WINDOWS = {"before": (-25, 0), "0-0.1 s": (0, 5), "0.1-0.25 s": (5, 12), "0.25-0.5 s": (12, 25), "0.5-1 s": (25, 50), "1-2 s": (50, 100)}
CX = ("EPG", "PEG", "PEN", "PFN", "PFL", "PFR", "FC", "hDelta", "vDelta", "FB")


def wrap(a: float) -> float:
    return float((a + np.pi) % (2 * np.pi) - np.pi)


class Tracker:
    """Where am I, and where is the target? Own pose from commands only; target from sightings, kept going when lost."""

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.pose = np.zeros(2)
        self.h = 0.0
        self.target = self.frozen = None
        self.vel = np.zeros(2)
        self.last = None
        self.lost = 0.0
        self.size = 0.1
        self.held = 0.0
        self.side = 1.0

    def move(self, cmd: dict, dt: float) -> None:
        self.h += float(np.clip(cmd["yaw_rate"], -MAX_YAW, MAX_YAW)) * dt
        self.pose = self.pose + cmd["forward"] * dt * np.array([np.cos(self.h), np.sin(self.h)])

    def see(self, t: Thing, dt: float) -> None:
        p = self.pose + t.distance * np.array([np.cos(self.h + t.bearing), np.sin(self.h + t.bearing)])
        if self.target is None or self.lost > 0.5:
            self.target = p
        else:
            was = self.target
            self.target = was + SEEN_SMOOTH * (p - was)
            self.vel = self.vel + VEL_SMOOTH * ((self.target - was) / dt - self.vel)
            speed = float(np.hypot(*self.vel))
            if speed > VEL_CAP:
                self.vel = self.vel * VEL_CAP / speed
        self.frozen = self.target.copy()
        self.lost, self.size, self.held = 0.0, t.size, t.bearing

    def unseen(self, dt: float) -> None:
        self.lost += dt
        if self.target is not None:
            self.target = self.target + self.vel * dt
            self.vel = self.vel * np.exp(-dt / TARGET_MEMORY)

    def _rel(self, p: np.ndarray) -> tuple[float, float]:
        d = p - self.pose
        return wrap(float(np.arctan2(d[1], d[0])) - self.h), float(np.hypot(*d))

    def guess(self) -> Thing | None:
        if self.target is None or self.lost > HOLD_S:
            return None
        b, d = self._rel(self.target)
        return Thing("leader", b, d, self.size)

    def aim(self, g: Thing) -> Thing:
        """What LC10a is told while lost: the prediction, or a steady scan to one side when the prediction can't be right."""
        if FOV_EDGE <= abs(g.bearing) < BEHIND:
            self.side = float(np.sign(g.bearing))
            return g
        return Thing("leader", self.side * SCAN, g.distance, g.size)

    def self_only(self) -> float:
        return self._rel(self.frozen)[0]


def soundtrack(log: list[tuple[float, float, bool]], fps: int, path: str) -> None:
    """Made here, nothing to license: a propeller hum that follows the drone's real speed and turning, and a short tone when the target
    goes out of view (falling) or comes back (rising). log: per video frame (speed m/s, |yaw| rad/s, target in view)."""
    from scipy.io import wavfile
    sr = 44100
    n = int(len(log) / fps * sr)
    at = np.arange(n) / sr * fps
    frames = np.arange(len(log))
    speed = np.interp(at, frames, [x[0] for x in log])
    yaw = np.interp(at, frames, [min(x[1], 3.0) for x in log])
    rng = np.random.default_rng(0)
    out = np.zeros(n)
    for detune, gain in ((1.0, 1.0), (1.013, 0.8), (0.987, 0.8), (1.027, 0.6)):   # four rotors, never quite in step
        phase = 2 * np.pi * np.cumsum((175 + 70 * speed + 18 * yaw) * detune) / sr
        for k in range(1, 7):
            out += gain * np.sin(k * phase) / k ** 1.3
    out /= np.abs(out).max()
    air = np.convolve(rng.normal(0, 1, n), np.ones(40) / 40, mode="same")
    out = 0.5 * out + 0.25 * air / np.abs(air).max()
    for i in range(1, len(log)):
        if log[i][2] != log[i - 1][2]:
            start = int(i / fps * sr)
            length = min(int(0.16 * sr), n - start)
            t = np.arange(length) / sr
            a, b = (880.0, 1320.0) if log[i][2] else (660.0, 440.0)
            tone = np.sin(2 * np.pi * (a * t + (b - a) * t ** 2 / (2 * 0.16))) * np.sin(np.pi * t / 0.16) ** 2
            out[start:start + length] += 0.35 * tone
    fade = np.minimum(1, np.minimum(np.arange(n), n - 1 - np.arange(n)) / (0.4 * sr))
    wavfile.write(path, sr, (out * fade / np.abs(out).max() * 0.7 * 32767).astype(np.int16))


class Film:
    """A video to post: only the drones, what the camera sees, a map and what the drone is doing. No brain panel, nothing about flies.
    plain leaves out every word and card: a coloured dot for the state, the camera picture and the map, with the sound."""
    W, H, FPS = 1280, 720, 30
    MINT, AMBER, RED = (140, 255, 210), (255, 205, 90), (255, 120, 100)

    def __init__(self, sim, path: str, plain: bool = False):
        from follow import TopMap
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.sim, self.chart, self.next = sim, TopMap(sim), 0.0
        self.plain, self.path, self.log = plain, path, []
        path = path + ".video.mp4" if plain else path
        self.ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{self.W}x{self.H}", "-r", str(self.FPS), "-i", "-",
                                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
        self.fonts: dict = {}

    def font(self, size: int):
        return self.fonts.setdefault(size, ImageFont.truetype("arial.ttf", size))

    def card(self, lines: list[tuple[str, int, tuple]], seconds: float) -> None:
        if self.plain:
            return
        im = Image.new("RGB", (self.W, self.H), (6, 9, 9))
        d = ImageDraw.Draw(im)
        y = (self.H - sum(s + 22 for _, s, _ in lines)) // 2
        for text, size, col in lines:
            w = d.textlength(text, font=self.font(size))
            d.text(((self.W - w) / 2, y), text, font=self.font(size), fill=col)
            y += size + 22
        self.ff.stdin.write(np.asarray(im).tobytes() * int(seconds * self.FPS))

    def frames(self, picture: np.ndarray | None, status: str, guess: np.ndarray | None) -> None:
        sim = self.sim
        while self.next <= sim.t:
            im = Image.fromarray(sim.render(width=self.W, height=self.H))
            d = ImageDraw.Draw(im, "RGBA")
            col = self.MINT if status == "TARGET IN VIEW" else self.AMBER if status.startswith("LOST: P") else self.RED
            self.log.append((float(np.hypot(*sim.data.qvel[:2])), abs(float(sim.data.qvel[5])), status == "TARGET IN VIEW"))
            if not self.plain:
                d.rounded_rectangle([24, 24, 360, 72], radius=16, fill=(0, 0, 0, 190))
                d.ellipse([42, 39, 60, 57], fill=col)
                d.text((72, 35), status, font=self.font(23), fill=col)
            if picture is not None:
                im.paste(Image.fromarray(picture).resize((320, 240)), (24, 86 - (62 if self.plain else 0)))
                top = 86 - (62 if self.plain else 0)
                d.rectangle([24, top, 344, top + 240], outline=col if self.plain else (255, 255, 255, 160), width=3 if self.plain else 2)
                if not self.plain:
                    d.rounded_rectangle([24, 334, 344, 370], radius=10, fill=(0, 0, 0, 170))
                    d.text((40, 341), "its one camera, all it gets", font=self.font(19), fill=(235, 235, 235))
            at = (self.W - self.chart.size - 24, 24)
            self.chart.draw(im, at)
            x, y = self.chart.xy(sim.pos[:2])
            x, y = x + at[0], y + at[1]
            for side in (-np.pi / 4, np.pi / 4):        # what the camera covers
                reach = 62
                d.line([x, y, x + reach * np.cos(sim.heading + side), y - reach * np.sin(sim.heading + side)], fill=(255, 150, 50, 220), width=2)
            if guess is not None:
                gx, gy = self.chart.xy(guess)
                gx, gy = gx + at[0], gy + at[1]
                d.ellipse([gx - 9, gy - 9, gx + 9, gy + 9], outline=self.AMBER, width=3)
            if not self.plain:
                d.rounded_rectangle([self.W - self.chart.size - 24, 312, self.W - 24, 438], radius=10, fill=(0, 0, 0, 170))
                for i, (c, text) in enumerate((((255, 150, 50), "this drone"), ((50, 255, 150), "its target"), ((255, 60, 215), "a distraction"), (self.AMBER, "where it thinks the target is"))):
                    d.ellipse([self.W - self.chart.size - 12, 323 + i * 28, self.W - self.chart.size + 2, 337 + i * 28], fill=c)
                    d.text((self.W - self.chart.size + 10, 320 + i * 28), text, font=self.font(17), fill=(235, 235, 235))
                d.rounded_rectangle([24, self.H - 58, 590, self.H - 20], radius=12, fill=(0, 0, 0, 170))
                d.text((42, self.H - 50), "Simulation. No radio link: it only sees the target.", font=self.font(20), fill=(235, 235, 235))
            self.ff.stdin.write(np.asarray(im).tobytes())
            self.next += 1 / self.FPS

    def close(self) -> None:
        self.ff.stdin.close()
        self.ff.wait()
        if self.plain:
            wav = self.path + ".wav"
            soundtrack(self.log, self.FPS, wav)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", self.path + ".video.mp4", "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest",
                            "-movflags", "+faststart", self.path], check=True)
            Path(wav).unlink()
            Path(self.path + ".video.mp4").unlink()


def fly(a) -> dict:
    brain = FlyBrain(seed=a.seed, sensory_input=a.sensory_input)
    if a.rewire:
        rewire(brain, seed=a.seed + 1000)
    pilot_module.TURN_GAIN = TURN_GAIN
    senses, pilot = FollowSenses(brain), FollowPilot(brain)
    for _ in range(100):
        pilot.observe(brain.step())
    sim = DroneSim(seed=a.seed, n_fruit=0, gusts=False, leader=True, decoy=True)
    cameras = LAYOUTS[a.mode]
    eyes_module.use_cameras(cameras)
    pixels = PixelEyes(BEACONS["leader"], seed=a.seed)
    tracker, bus = Tracker(), Events()
    log: list = []
    bus.on("*", lambda e: log.append((round(e.t, 2), e.name, {k: round(v, 3) for k, v in e.data.items()})))
    ticks = round(brain.dt / sim.dt)
    dist, seen_steps, errs, pose_err, crashes, n, stops, things = [], 0, {"hold": [], "self": [], "both": []}, [], 0, 0, 0, []
    was_seen, truth0, late = False, None, []
    film = Film(sim, a.out, a.plain) if a.out else None
    if film:
        film.card([("One camera.", 64, (255, 255, 255)), ("No radio. It has to follow what it sees.", 34, (140, 255, 210)), ("When the target leaves the picture, it works out where it went.", 28, (200, 200, 200))], 3.5)
    picture = None
    while sim.t < a.seconds:
        if n % 2 == 0:
            shots = sim.eyes(names=cameras)
            picture = shots["front"]
            things = pixels.things(shots)
        n += 1
        sees = next((t for t in things if t.kind == "leader"), None)
        if sees is not None:
            if not was_seen and tracker.lost > 0:
                g = tracker.guess()
                bus.emit("target_found", t=sim.t, bearing=sees.bearing, lost_for=tracker.lost,
                         predicted=g.bearing if g else float("nan"), error=abs(wrap(g.bearing - sees.bearing)) if g else float("nan"))
            tracker.see(sees, brain.dt)
        else:
            if was_seen:
                bus.emit("target_lost", t=sim.t, bearing=tracker.held)
            tracker.unseen(brain.dt)
        was_seen = sees is not None
        feed = list(things)
        guess = tracker.guess()
        if sees is None and guess is not None and tracker.lost > 0:
            d = sim.leader.pos[:2] - sim.pos[:2]                  # scoring only: nothing below this reaches the brain
            true_b = wrap(float(np.arctan2(d[1], d[0])) - sim.heading)
            if tracker.lost <= 1.0:
                errs["hold"].append(abs(wrap(tracker.held - true_b)))
                errs["self"].append(abs(wrap(tracker.self_only() - true_b)))
                errs["both"].append(abs(wrap(guess.bearing - true_b)))
            else:
                late.append(abs(wrap(guess.bearing - true_b)))
            if a.mode.endswith("_predict"):
                feed.append(tracker.aim(guess))
        fired = brain.step(None, senses.inject(feed, match_pillars=True))
        pilot.observe(fired)
        cmd = pilot.command(sim.t, sim.pos[2])
        tracker.move(cmd, brain.dt)
        for _ in range(ticks):
            sim.step(**cmd)
        if truth0 is None:
            truth0 = sim.pos[:2].copy()
        pose_err.append(float(np.hypot(*(sim.pos[:2] - truth0 - tracker.pose))))
        dist.append(float(np.hypot(*(sim.leader.pos[:2] - sim.pos[:2]))))
        seen_steps += sees is not None
        stops += cmd["forward"] == 0.0
        if sim.crashed:
            crashes += 1
            bus.emit("crash", t=sim.t)
            t = sim.data.time
            sim.reset()
            sim.data.time = t
            senses.leader_size, senses.pillars, things = None, [], []
            tracker.reset()
            truth0, was_seen = None, False
        if film:
            lost = sees is None
            scanning = lost and guess is not None and not FOV_EDGE <= abs(guess.bearing) < BEHIND
            status = "TARGET IN VIEW" if not lost else "LOST: SEARCHING" if scanning or guess is None else "LOST: PREDICTING"
            film.frames(picture, status, tracker.target if lost and guess is not None else None)
    if film:
        film.card([("Kept its target in view 1.85x as much", 46, (255, 255, 255)), ("with prediction, against the same one camera without it", 28, (140, 255, 210)),
                   ("8 test flights of 60 s each, in simulation. Not yet flown on a real drone.", 24, (200, 200, 200))], 4.0)
        film.close()
    sim.close()
    found = [e[2]["error"] for e in log if e[1] == "target_found" and e[2]["error"] == e[2]["error"]]
    return {"mode": a.mode, "rewired": a.rewire, "sensory_input": a.sensory_input, "seed": a.seed, "seconds": a.seconds, "mean_distance": round(float(np.mean(dist)), 3),
            "within_1m": round(float(np.mean(np.array(dist) < 1.0)), 3), "in_view": round(seen_steps / len(dist), 3), "crashes": crashes,
            "stopped": round(stops / len(dist), 3), "lost_steps": len(errs["both"]),
            "err_hold": round(float(np.median(errs["hold"])), 3) if errs["hold"] else None,
            "err_self": round(float(np.median(errs["self"])), 3) if errs["self"] else None,
            "err_both": round(float(np.median(errs["both"])), 3) if errs["both"] else None,
            "err_after_1s": round(float(np.median(late)), 3) if late else None, "own_position_err": round(float(np.median(pose_err)), 3), "found_err": round(float(np.median(found)), 3) if found else None,
            "events": dict(bus.counts)}


def trials(brain, chase, seed: int, reps: int, dna02) -> tuple[dict, np.ndarray, list]:
    """Spike counts per window: {window: (samples, neurons)}, side per sample (0 left, 1 right), DNa02 lean per window."""
    windows = {k: [] for k in WINDOWS}
    lean = {k: [] for k in WINDOWS}
    sides = []
    for r in range(reps):
        for s, side in enumerate("LR"):
            brain.reset(seed + 100 * r + s)
            for _ in range(25):
                brain.step()
            counts = {k: np.zeros((brain.batch, brain.n), np.int16) for k in WINDOWS}

            def tally(step: int, fired) -> None:
                for k, (lo, hi) in WINDOWS.items():
                    if lo <= step < hi:
                        for f, x in enumerate(fired):
                            counts[k][f, x] += 1
            for t in range(-25, 0):
                tally(t, brain.step())
            for _ in range(50):
                brain.step(None, inject=[(chase[side], 0.7)])
            for t in range(100):
                tally(t, brain.step())
            for k in WINDOWS:
                windows[k].append(counts[k])
                lean[k].append(counts[k][:, dna02["L"]].sum(1).astype(int) - counts[k][:, dna02["R"]].sum(1).astype(int))
            sides += [s] * brain.batch
        print(f"  repeat {r + 1}/{reps}", flush=True)
    return {k: np.concatenate(v) for k, v in windows.items()}, np.array(sides), lean


def decode(x: np.ndarray, y: np.ndarray, keep=None) -> float:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold
    if keep is not None:
        x = x[:, keep]
    x = x.astype(np.float32)
    right = []
    for tr, te in StratifiedKFold(5, shuffle=True, random_state=0).split(x, y):
        gap = np.abs(x[tr][y[tr] == 0].mean(0) - x[tr][y[tr] == 1].mean(0)) / (x[tr].std(0) + 0.1)
        top = np.argsort(gap)[-300:]
        m = LogisticRegression(C=0.1, max_iter=500).fit(x[tr][:, top], y[tr])
        right.append(m.predict(x[te][:, top]) == y[te])
    return round(float(np.concatenate(right).mean()), 3)


def bench_one(brain, chase, dna02, cx, seed: int, reps: int) -> dict:
    w, y, lean = trials(brain, chase, seed, reps, dna02)
    out = {}
    for k in WINDOWS:
        d = np.concatenate(lean[k])
        fires = d != 0
        wanted = np.where(y == 0, 1, -1)
        out[k] = {"decoder": decode(w[k], y), "cx_decoder": decode(w[k], y, cx), "dna02_fires": round(float(fires.mean()), 3),
                  "dna02_right_side": round(float((np.sign(d[fires]) == wanted[fires]).mean()), 3) if fires.any() else None}
        print(k, out[k], flush=True)
    return out


def bench(a) -> None:
    brain = FlyBrain(batch=a.flies, seed=a.seed)
    chase = FeatureDetectors(brain).chase
    dna02 = {s: brain.cells(["DNa02"], s) for s in "LR"}
    ct = brain.cell_type.astype(str)
    cx = np.flatnonzero([t.startswith(CX) for t in ct])
    print(f"{len(cx)} central-complex cells", flush=True)
    res = {"real": bench_one(brain, chase, dna02, cx, a.seed, a.reps)}
    rewire(brain, seed=a.seed + 3)
    res["scrambled"] = bench_one(brain, chase, dna02, cx, a.seed + 50000, a.reps)
    r, s = res["real"]["0.5-1 s"], res["scrambled"]["0.5-1 s"]
    res["rules"] = {"MEMORY": r["decoder"] >= 0.75 and r["decoder"] - s["decoder"] >= 0.2,
                    "STEERS": r["dna02_fires"] >= 0.5 and (r["dna02_right_side"] or 0) >= 0.75}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"bench{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res["rules"]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    b = sub.add_parser("bench")
    b.add_argument("--seed", type=int, default=7501)
    b.add_argument("--flies", type=int, default=8)
    b.add_argument("--reps", type=int, default=6)
    f = sub.add_parser("fly")
    f.add_argument("--mode", choices=tuple(LAYOUTS), default="one_predict")
    f.add_argument("--seed", type=int, default=7551)
    f.add_argument("--seconds", type=float, default=60.0)
    f.add_argument("--rewire", action="store_true")
    f.add_argument("--out", help="also record a video to post")
    f.add_argument("--plain", action="store_true", help="with --out: no words or cards, and with sound")
    f.add_argument("--no-sensory-input", dest="sensory_input", action="store_false", help="the bench's brain: no synapses onto sensory neurons")
    a = ap.parse_args()
    if a.what == "bench":
        bench(a)
    else:
        print(json.dumps(fly(a)))


if __name__ == "__main__":
    main()
