"""The fly learns who to follow, then flies by it: two leaders in view, and its dopamine-trained preference picks one.

    python drone/choose.py --train A --seed 301 --no-video                # one measured flight
    python drone/choose.py --people --train A --out drone/runs/person.mp4 # a person as the leader, with video

Nothing here is told a colour. The cameras find colourful shapes (eyes.ColourEyes). Before the flight a trainer shows the
fly each leader's colour and gives dopamine for one, punishment for the other (imprint.py: real Kenyon-cell spikes x
dopamine at their output synapses). In flight the fly looks at each shape in turn: its colour drives the visual neurons
into the Kenyon cells, and what it learned about those spikes picks which shape goes to LC10a. Untrained, it takes the
biggest. The steering is the connectome's, as in follow.py. Limits: each visual neuron's colour preference is our model,
the quiet "blink" before each look is ours, and the step from a learned value to LC10a is ours (the connectome's own MBON
route to steering isn't used).
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
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "flytrade" / "research"))
from sim import DroneSim, Thing  # noqa: E402
from sim.world import BEACONS, SHIRTS  # noqa: E402
from eyes import ColourEyes, hue_of  # noqa: E402
from brainview import BrainView  # noqa: E402
from follow import TURN_GAIN, FollowPilot, FollowSenses, TopMap  # noqa: E402
import pilot as pilot_module  # noqa: E402
from imprint import KC_OFFSET, Colours  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
import plasticity  # noqa: E402

LOOK_STEPS = 25        # brain steps on each shape in turn
BLINK_STEPS = 5        # before each look the Kenyon cells and APL are held quiet: our addition, not in the wiring. Left running,
                       # their own recurrent loop makes them all-or-nothing and two colours stop looking different
TRAIN_ROUNDS = 12
PERSON_SIZE = 1.3      # a shirt is most of what shows of a person
DRONE_SIZE = 4.1       # a beacon is much smaller than the drone under it (eyes.SIZE_SCALE x the size ratio)
STICK = 0.6            # how much of a new look's value is believed
AVOID = -0.1           # a learned value under this is not followed


def hue_gap(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


class Chooser:
    """Looks at each shape in turn and keeps a running learned value per colour."""

    def __init__(self, colours: Colours):
        self.c = colours
        self.value: dict[int, float] = {}
        self.i, self.steps, self.counts = 0, 0, np.zeros(len(colours.kc), np.float32)
        self.current = None
        self.blink = BLINK_STEPS

    @staticmethod
    def key(hue: float) -> int:
        return int(round(hue / 40.0))

    def before(self, shapes: list[dict]) -> None:
        """Before each brain step: a blink, or drive the visual neurons with the shape being looked at."""
        self.current = None
        if self.blink > 0:
            self.c.brain.v[self.c.quiet] = -1.0
            self.blink -= 1
            return
        self.current = shapes[self.i % len(shapes)] if shapes else None
        if self.current is not None:
            self.c.brain.v[self.c.cells] += self.c.drive(self.current["hue"])[:, None]

    def after(self, fired) -> None:
        if self.current is None:
            return
        h = self.c.where[fired]
        self.counts[h[h >= 0]] += 1
        self.steps += 1
        if self.steps >= LOOK_STEPS:
            v = float(plasticity.valence([0], self.counts[None], len(self.c.kc))[0])
            k = self.key(self.current["hue"])
            self.value[k] = self.value.get(k, v) + STICK * (v - self.value.get(k, v))
            self.steps, self.counts = 0, np.zeros_like(self.counts)
            self.i += 1
            self.blink = BLINK_STEPS

    def pick(self, shapes: list[dict]) -> dict | None:
        if not shapes:
            return None
        best = max(shapes, key=lambda s: (round(self.value.get(self.key(s["hue"]), 0.0), 2), s["size"]))
        # learned to dislike everything in view: follows nobody, rather than the least bad (real footage, 2026-10-30)
        return None if self.value.get(self.key(best["hue"]), 0.0) < AVOID else best


def teach(c: Colours, hues: dict[str, float], train: str, seed: int) -> None:
    """The trainer: each colour shown TRAIN_ROUNDS times in random order, dopamine right after."""
    if train == "none":
        return
    b = c.brain
    offset = [(c.all_kc, KC_OFFSET)]
    for name in np.random.default_rng(seed).permutation(list(hues) * TRAIN_ROUNDS):
        counts = np.zeros((1, len(c.kc)), np.float32)
        for _ in range(BLINK_STEPS):
            b.v[c.quiet] = -1.0
            b.step()
        for _ in range(LOOK_STEPS):
            b.v[c.cells] += c.drive(hues[name])[:, None]
            h = c.where[b.step(inject=offset)]
            counts[0, h[h >= 0]] += 1
        plasticity.valence([0], counts, len(c.kc))
        plasticity.learn([0], [1.0 if name == train else -1.0], len(c.kc))


def run(args) -> dict:
    plasticity.reset()
    plasticity.LR = 0.25
    print("loading connectome...", flush=True)
    brain = FlyBrain(device="cpu", batch=1, seed=args.seed, sensory_input=False)
    colours = Colours(brain)
    ct = brain.cell_type.astype(str)
    colours.quiet = np.r_[colours.all_kc, np.flatnonzero(ct == "APL")]
    for _ in range(60):                                # settled, as in flight: training gets no fresh start either
        brain.step(inject=[(colours.all_kc, KC_OFFSET)])
    pilot_module.TURN_GAIN = TURN_GAIN
    source = SHIRTS if args.people else BEACONS
    hues = {"A": float(hue_of(np.asarray(source["leader"][:3], np.float32))), "B": float(hue_of(np.asarray(source["decoy"][:3], np.float32)))}
    teach(colours, hues, args.train, args.seed + 7)
    senses, pilot = FollowSenses(brain), FollowPilot(brain)
    offset = [(colours.all_kc, KC_OFFSET)]
    for _ in range(100):
        pilot.observe(brain.step(inject=offset))
    sim = DroneSim(seed=args.seed, n_fruit=0, gusts=False, leader=True, decoy=True, people=args.people)
    eyes = ColourEyes(PERSON_SIZE if args.people else DRONE_SIZE, seed=args.seed)
    chooser = Chooser(colours)
    ticks = round(brain.dt / sim.dt)

    ff = view = font = chart = None
    W, H, BW = 1280, 720, 640
    names = {"A": "GREEN", "B": "PINK", "none": "NOBODY"}
    if not args.no_video:
        fonts: dict = {}
        font = lambda s: fonts.setdefault(s, ImageFont.truetype("arial.ttf", s))   # noqa: E731
        view = BrainView(brain, {"LC10a: sees its pick": (brain.cells(["LC10a"]), (90, 200, 255), False),
                                 "learning cells (KC)": (colours.kc, (255, 225, 90), False),
                                 "DNa02: steer": (brain.cells(["DNa02"]), (140, 255, 210), True),
                                 "DNp01: escape, stops": (brain.cells(["DNp01"]), (255, 90, 80), True)}, width=BW, height=H, font=font)
        chart = TopMap(sim)
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W + BW}x{H}", "-r", "30",
                               "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21", "-movflags", "+faststart", args.out], stdin=subprocess.PIPE)

    da, db, stops, crashes, picked = [], [], 0, 0, {"A": 0, "B": 0}
    pillars, shapes, pics, n, next_frame, stamp = [], [], None, 0, 0.0, 0
    while sim.t < args.seconds:
        if n % 2 == 0:
            pics = sim.eyes()
            pillars, shapes = eyes.shapes(pics)
        n += 1
        chooser.before(shapes)
        choice = chooser.pick(shapes)
        things = list(pillars)
        if choice is not None:
            things.append(Thing("leader", choice["bearing"], 1.0, choice["size"]))
            picked["A" if hue_gap(choice["hue"], hues["A"]) < hue_gap(choice["hue"], hues["B"]) else "B"] += 1
        fired = brain.step(None, senses.inject(things, match_pillars=True) + offset)
        pilot.observe(fired)
        chooser.after(fired)
        cmd = pilot.command(sim.t, sim.pos[2])
        for _ in range(ticks):
            sim.step(**cmd)
        p = sim.pos[:2]
        da.append(float(np.hypot(*(sim.leader.pos[:2] - p))))
        db.append(float(np.hypot(*(sim.decoy.pos[:2] - p))))
        stops += cmd["forward"] == 0.0
        if sim.crashed:
            crashes += 1
            t = sim.data.time
            sim.reset()
            sim.data.time = t
            senses.leader_size, senses.pillars = None, []
        if ff is not None:
            view.observe(fired)
            while next_frame <= sim.t:
                im = Image.fromarray(sim.render(width=W, height=H))
                d = ImageDraw.Draw(im, "RGBA")
                d.rounded_rectangle([24, 24, 470, 150], radius=18, fill=(0, 0, 0, 165))
                d.text((44, 36), f"TRAINED TO FOLLOW {names[args.train]}", font=font(24), fill=(140, 255, 210))
                d.text((44, 74), f"t {sim.t:5.1f}s  to green {da[-1]:.2f} m  to pink {db[-1]:.2f} m", font=font(19), fill=(255, 255, 255))
                vals = "  ".join(f"{'green' if hue_gap(k * 40.0, hues['A']) < hue_gap(k * 40.0, hues['B']) else 'pink'} {v:+.2f}" for k, v in chooser.value.items())
                d.text((44, 108), f"what it learned: {vals}", font=font(19), fill=(255, 225, 90))
                strip = np.hstack([pics[k] for k in ("left", "front", "right", "back")])
                im.paste(Image.fromarray(strip).resize((480, 90)), (484, 24))
                chart.draw(im, (W - chart.size - 24, 24))
                d.rounded_rectangle([24, H - 62, W - 24, H - 20], radius=14, fill=(0, 0, 0, 165))
                d.text((44, H - 52), "no radio: only its 4 cameras. A fly's connectome steers; what it learned picks who", font=font(19), fill=(235, 235, 235))
                ff.stdin.write(np.ascontiguousarray(np.concatenate([np.asarray(im), view.render()], axis=1)).tobytes())
                next_frame += 1 / 30
        if int(sim.t) >= stamp + 15:
            stamp = int(sim.t)
            print(f"  t {sim.t:.0f}s to A {np.mean(da):.2f} to B {np.mean(db):.2f} {chooser.value}", flush=True)
    if ff is not None:
        ff.stdin.close()
        ff.wait()
    sim.close()
    return {"people": args.people, "train": args.train, "seed": args.seed, "to_A": round(float(np.mean(da)), 3), "to_B": round(float(np.mean(db)), 3),
            "near_A": round(float(np.mean(np.array(da) < 1.5)), 3), "near_B": round(float(np.mean(np.array(db) < 1.5)), 3),
            "picked_A": round(picked["A"] / max(1, sum(picked.values())), 3), "looks": sum(picked.values()),
            "stopped": round(stops / len(da), 3), "crashes": crashes, "value": {str(k): round(v, 2) for k, v in chooser.value.items()}}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--train", choices=("A", "B", "none"), default="A", help="A = green, B = pink")
    ap.add_argument("--people", action="store_true")
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--seed", type=int, default=301)
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--out", default=str(HERE / "runs" / "choose.mp4"))
    print(json.dumps(run(ap.parse_args())))


if __name__ == "__main__":
    main()
